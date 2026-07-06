'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { deriveNftLook } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import s from '../app/market.module.css';
import d from '../app/support.module.css';

/**
 * /market — 見えるマーケットプレイス(Decision 076)。
 * 需要(今夜の買い予約件数)・出品棚(マッチング順)・直近の成約・自分の出品
 * 管理と手動出品。買い予約そのもの(購入セッション)は既存の購入UIが担う。
 *
 * 手動出品の約束事(UIで明示): 出品中はレースに出走しない(Market Lock・
 * day/価値凍結)、価格は当日ラダー固定、取り下げは翌バッチ反映、
 * 出品操作は馬ごとに1日1回。
 */

export interface ShelfItem {
  listing_id: string;
  horse_id: string;
  price: string;
  current_day: number;
  listed_at: string;
  name: string;
  dna_hash: string;
}
export interface MatchRow {
  horse_name: string;
  price: string;
  buyer: string;
  matched_at: string;
}
export interface MyListing {
  listing_id: string;
  horse_id: string;
  price: string;
  current_day: number;
  listed_at: string;
  cancel_after_batch: boolean;
  name: string;
  dna_hash: string;
}
export interface ListableHorse {
  id: string;
  name: string;
  current_day: number;
  status: string;
  dna_hash: string;
}

export interface MarketPlaceData {
  shelf: ShelfItem[];
  pending_buy_count: number;
  recent_matches: MatchRow[];
  my_listings: MyListing[];
}

const fmt = (v: string): string =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MarketPlaceView({
  data,
  myHorses,
  preview = false,
}: {
  data: MarketPlaceData;
  /** 出品ダイアログの候補(自分のACTIVE馬)。 */
  myHorses: ListableHorse[];
  preview?: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pick, setPick] = useState<ListableHorse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const myIds = new Set(data.my_listings.map((l) => l.horse_id));
  const listable = myHorses.filter(
    (h) => h.status === 'ACTIVE' && h.current_day >= 1 && h.current_day <= 6 && !myIds.has(h.id),
  );

  const submitList = async () => {
    if (!pick || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    if (preview) {
      setBusy(false);
      setDialogOpen(false);
      setNotice(`${pick.name} を出品しました(プレビュー)。`);
      return;
    }
    const result = await apiFetch('/api/v1/market/list', {
      method: 'POST',
      body: { horse_id: pick.id },
    });
    setBusy(false);
    if (result.status === 200) {
      setDialogOpen(false);
      setNotice(`${pick.name} を出品しました。今夜からレースには出走しません。`);
      router.refresh();
    } else {
      setError(errorMessage(result.body) ?? '出品に失敗しました。');
    }
  };

  const submitUnlist = async (listing: MyListing) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const result = preview
      ? { status: 200, body: {} }
      : await apiFetch('/api/v1/market/unlist', { method: 'POST', body: { horse_id: listing.horse_id } });
    setBusy(false);
    if (result.status === 200) {
      setNotice(`${listing.name} の取り下げを受け付けました。今夜のバッチ後に外れ、明日からレースに戻ります。`);
      if (!preview) router.refresh();
    } else {
      setNotice(errorMessage(result.body) ?? '取り下げに失敗しました。');
    }
  };

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <span className={s.h1}>Marketplace</span>
        <span className={s.headNote}>毎晩20:00 (GMT+8) のバッチが、予約と出品を古い順に自動マッチングします</span>
      </div>

      {/* ---- 市場の鼓動 ---- */}
      <div className={s.pulse}>
        <div className={`${s.pulseCard} ${s.pulseBuy}`}>
          <div className={s.pulseK}>今夜の買い予約</div>
          <div className={s.pulseV}>{data.pending_buy_count.toLocaleString('en-US')}<span className={s.pulseSub}> 件</span></div>
          <div className={s.pulseSub}>全プレイヤー合計(匿名)</div>
        </div>
        <div className={`${s.pulseCard} ${s.pulseSell}`}>
          <div className={s.pulseK}>出品中の馬</div>
          <div className={s.pulseV}>{data.shelf.length.toLocaleString('en-US')}<span className={s.pulseSub}> 頭</span></div>
          <div className={s.pulseSub}>マッチング順に掲載</div>
        </div>
        <div className={`${s.pulseCard} ${s.pulseMatch}`}>
          <div className={s.pulseK}>直近の成約</div>
          <div className={s.pulseV}>{data.recent_matches.length > 0 ? `${fmt(data.recent_matches[0]!.price)}` : '—'}</div>
          <div className={s.pulseSub}>{data.recent_matches.length > 0 ? `${data.recent_matches[0]!.horse_name} · 最新` : 'まだありません'}</div>
        </div>
      </div>

      {notice && <p className="ok">{notice}</p>}

      {/* ---- 自分の出品 ---- */}
      <section className="panel">
        <div className="section-head">
          <h2>自分の出品</h2>
          <button type="button" onClick={() => { setDialogOpen(true); setPick(null); setConfirmed(false); setError(null); }}>
            馬を出品する
          </button>
        </div>
        {data.my_listings.length === 0 ? (
          <p className="empty">出品中の馬はいません。</p>
        ) : (
          data.my_listings.map((l) => (
            <div key={l.listing_id} className={s.myRow}>
              <span className={s.myName}>{l.name}</span>
              <span className={s.myMeta}>Day {l.current_day} · {fmt(l.price)} USDT · 出品 {l.listed_at.slice(0, 10)}</span>
              {l.cancel_after_batch ? (
                <span className={s.pendingBadge}>取り下げ予約済(今夜のバッチ後)</span>
              ) : (
                <button type="button" className="secondary" disabled={busy} onClick={() => void submitUnlist(l)}>
                  取り下げる
                </button>
              )}
            </div>
          ))
        )}
        <p className={s.lockNote}>
          出品中の馬はレースに出走しません(Dayと価値は凍結)。価格は出品時のDay価格で固定。
          取り下げは翌バッチから反映(今夜売れた場合は売却が優先)。出品操作は馬ごとに1日1回です。
        </p>
      </section>

      {/* ---- 出品棚 ---- */}
      <section className="panel">
        <div className="section-head">
          <h2>出品中の馬</h2>
          <span className="muted">先頭から順にマッチングされます</span>
        </div>
        {data.shelf.length === 0 ? (
          <p className="empty">現在、出品中の馬はいません。</p>
        ) : (
          <div className={s.shelfGrid}>
            {data.shelf.map((item, i) => (
              <div key={item.listing_id} className={`${s.shelfCard} ${myIds.has(item.horse_id) ? s.shelfMine : ''}`}>
                <span className={s.shelfOrder}>#{i + 1}</span>
                {myIds.has(item.horse_id) && <span className={s.mineTag}>MINE</span>}
                <NftHorseArt look={deriveNftLook(item.dna_hash, item.name)} className={s.shelfArt} />
                <div className={s.shelfName}>{item.name}</div>
                <div className={s.shelfMeta}>DAY {item.current_day}</div>
                <div className={s.shelfPrice}>{fmt(item.price)} USDT</div>
              </div>
            ))}
          </div>
        )}
        <p className={s.shelfNote}>
          購入は「買い予約」で行います(下の購入セクション)。どの馬が割り当たるかは毎晩のバッチが
          決定論ルール(古い出品から順)で決めます。
        </p>
      </section>

      {/* ---- 直近の成約 ---- */}
      <section className="panel">
        <h2>直近の成約</h2>
        {data.recent_matches.length === 0 ? (
          <p className="empty">まだ成約はありません。</p>
        ) : (
          data.recent_matches.map((m, i) => (
            <div key={i} className={s.matchRow}>
              <span className={s.matchHorse}>{m.horse_name}</span>
              <span className={s.matchPrice}>{fmt(m.price)} USDT</span>
              <span className={s.matchBuyer}>→ {m.buyer}</span>
              <span className={s.matchTime}>{m.matched_at.slice(5, 16).replace('T', ' ')}</span>
            </div>
          ))
        )}
      </section>

      {/* ---- 出品ダイアログ ---- */}
      {dialogOpen && (
        <div className={d.overlay} role="dialog" aria-modal="true">
          <div className={d.dialog}>
            <div className={d.dialogTitle}>馬を出品する</div>
            {listable.length === 0 ? (
              <p className={s.pickEmpty}>出品できる馬がいません(Day1〜6のACTIVE馬のみ出品できます)。</p>
            ) : (
              <div className={s.pickGrid}>
                {listable.map((h) => (
                  <div
                    key={h.id}
                    className={`${s.pickCard} ${pick?.id === h.id ? s.pickActive : ''}`}
                    onClick={() => setPick(h)}
                    role="button"
                  >
                    <div className={s.pickName}>{h.name}</div>
                    <div className={s.pickMeta}>DAY {h.current_day}</div>
                  </div>
                ))}
              </div>
            )}
            <div className={d.warnBox}>
              ⚠ 出品中はレースに出走しません(Dayと価値は凍結)。価格は当日のDay価格で固定です。
              取り下げは翌バッチからの反映になり、出品操作は馬ごとに1日1回です。
            </div>
            <label className={d.confirmLabel}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              出品中はレースに出走しないことを理解しました
            </label>
            {error && <p className="error">{error}</p>}
            <div className={d.dialogActions}>
              <button type="button" className="secondary" onClick={() => setDialogOpen(false)}>キャンセル</button>
              <button type="button" disabled={!pick || !confirmed || busy} onClick={() => void submitList()}>
                {busy ? '出品中…' : 'この馬を出品する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
