'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { deriveNftLook } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import { RarityLegend } from '@/components/RarityLegend';
import s from '../app/market.module.css';
import d from '../app/support.module.css';

/**
 * /market — 見えるマーケットプレイス(Decision 076) リデザイン。
 * 需要(今夜の買い予約件数)・供給(出品棚)・直近の成約を「市場の鼓動」として
 * 上部に。続いて自分の出品管理+手動出品、マッチング順の出品棚、成約フィード。
 * 買い予約(購入予約)は SHOWCASE 直下の ReservePanel が担う(Decision 085)。
 *
 * 手動出品の約束事(UIで明示・不変): 出品中はレースに出走しない(Market Lock・
 * day/価値凍結)、価格は当日ラダー固定、取り下げは翌バッチ反映、出品は馬ごと1日1回。
 * props 型・list/unlist の API・確認チェックボックスは既存のまま。
 */

export interface ShelfItem {
  listing_id: string;
  horse_id: string;
  price: string;
  current_day: number;
  listed_at: string;
  name: string;
  dna_hash: string;
  /** レアリティ(新規): COMMON/UNCOMMON/RARE/EPIC/LEGENDARY。 */
  rarity: string;
}
export interface MatchRow {
  horse_name: string;
  price: string;
  buyer: string;
  matched_at: string;
  /** SOLDカード用のアート素材(Decision 085)。 */
  dna_hash: string;
  rarity: string;
  /** true = Day0新規発行の成約(P2Pではなくミント)。 */
  is_mint: boolean;
}
export interface MyListing {
  listing_id: string;
  horse_id: string;
  price: string;
  current_day: number;
  listed_at: string;
  cancel_after_batch: boolean;
  /** 'SMART'(自動出品) | 'MANUAL'(手動出品)。Decision 086で両方見せる。 */
  source: string;
  name: string;
  dna_hash: string;
  /** レアリティ(新規)。 */
  rarity: string;
}
export interface ListableHorse {
  id: string;
  name: string;
  current_day: number;
  status: string;
  dna_hash: string;
  /** 譲渡された馬(Decision 094)— 手動出品不可。 */
  gifted_at?: string | null;
}

export interface MarketPlaceData {
  shelf: ShelfItem[];
  pending_buy_count: number;
  recent_matches: MatchRow[];
  my_listings: MyListing[];
}

const fmt = (v: string): string =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** レアリティ(5段階)→ CSS Module のバッジクラス。未知値は COMMON 扱い。 */
const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const rarClass = (rarity: string): string => (RARITIES.includes(rarity) ? rarity : 'COMMON');

export function MarketPlaceView({
  data,
  myHorses,
  reserveSlot,
  preview = false,
}: {
  data: MarketPlaceData;
  /** 出品ダイアログの候補(自分のACTIVE馬)。 */
  myHorses: ListableHorse[];
  /** SHOWCASE直下に差し込む購入予約パネル+予約一覧(Decision 085)。 */
  reserveSlot?: React.ReactNode;
  preview?: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pick, setPick] = useState<ListableHorse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 棚カードタップ時の「指名購入はできません」ファネルモーダル(Decision 085)。 */
  const [funnel, setFunnel] = useState<{ name: string; sold: boolean } | null>(null);

  const scrollToReserve = () => {
    setFunnel(null);
    document.getElementById('reserve')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const myIds = new Set(data.my_listings.map((l) => l.horse_id));
  // Decision 094: 譲渡された馬(gifted_at)は手動出品不可のため候補から除外。
  const listable = myHorses.filter(
    (h) => h.status === 'ACTIVE' && h.current_day >= 1 && h.current_day <= 6 && !myIds.has(h.id) && !h.gifted_at,
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
        <span className={s.headNote}>毎晩20:00 (GMT+8) のバッチが、買い予約と出品を古い順に自動マッチングします</span>
      </div>

      {/* ---- 市場の鼓動 ---- */}
      <div className={s.pulse}>
        <div className={`${s.pulseCard} ${s.pulseBuy}`}>
          <div className={s.pulseK}>今夜の買い予約(需要)</div>
          <div className={s.pulseV}>{data.pending_buy_count.toLocaleString('en-US')}<span className={s.pulseUnit}> 件</span></div>
          <div className={s.pulseSub}>全プレイヤー合計(匿名)</div>
        </div>
        <div className={`${s.pulseCard} ${s.pulseSell}`}>
          <div className={s.pulseK}>出品中の馬(供給)</div>
          <div className={s.pulseV}>{data.shelf.length.toLocaleString('en-US')}<span className={s.pulseUnit}> 頭</span></div>
          <div className={s.pulseSub}>マッチング順に掲載</div>
        </div>
        <div className={`${s.pulseCard} ${s.pulseMatch}`}>
          <div className={s.pulseK}>直近の成約価格</div>
          <div className={s.pulseV}>{data.recent_matches.length > 0 ? fmt(data.recent_matches[0]!.price) : '—'}</div>
          <div className={s.pulseSub}>{data.recent_matches.length > 0 ? `${data.recent_matches[0]!.horse_name} · 最新` : 'まだありません'}</div>
        </div>
      </div>

      {notice && <p className="ok">{notice}</p>}

      {/* ---- 第1幕: SHOWCASE(出品中+直近の実成約SOLD、Decision 085) ---- */}
      <section className="panel">
        <div className="section-head">
          <h2>出品中の馬</h2>
          <span className={s.shelfHeadNote}>先頭から順にマッチングされます</span>
        </div>
        {data.shelf.length === 0 && data.recent_matches.length === 0 ? (
          <p className="empty">まだ出品も成約もありません。今夜の最初の取引者になりましょう。</p>
        ) : (
          <div className={s.shelfGrid}>
            {data.shelf.map((item, i) => (
              <div
                key={item.listing_id}
                className={`${s.shelfCard} ${s.shelfClickable} ${myIds.has(item.horse_id) ? s.shelfMine : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setFunnel({ name: item.name, sold: false })}
                onKeyDown={(e) => { if (e.key === 'Enter') setFunnel({ name: item.name, sold: false }); }}
              >
                <span className={s.shelfOrder}>#{i + 1}</span>
                {myIds.has(item.horse_id) && <span className={s.mineTag}>MINE</span>}
                <NftHorseArt look={deriveNftLook(item.dna_hash, item.name)} className={s.shelfArt} />
                <div className={s.shelfName}>{item.name}</div>
                <div className={s.shelfRar}><span className={`${s.rar} ${s[`rar${rarClass(item.rarity)}`]}`}>{item.rarity}</span></div>
                <div className={s.shelfMeta}>DAY {item.current_day}</div>
                <div className={s.shelfPrice}>{fmt(item.price)} USDT</div>
              </div>
            ))}
            {/* 実成約のSOLDカード — 架空の馬は置かない(Decision 085) */}
            {data.recent_matches.slice(0, Math.max(4, 12 - data.shelf.length)).map((m, i) => (
              <div
                key={`sold-${i}`}
                className={`${s.shelfCard} ${s.shelfClickable} ${s.shelfSold}`}
                role="button"
                tabIndex={0}
                onClick={() => setFunnel({ name: m.horse_name, sold: true })}
                onKeyDown={(e) => { if (e.key === 'Enter') setFunnel({ name: m.horse_name, sold: true }); }}
              >
                <span className={s.soldTag}>{m.is_mint ? 'SOLD · 新規発行' : 'SOLD'}</span>
                <NftHorseArt look={deriveNftLook(m.dna_hash, m.horse_name)} className={`${s.shelfArt} ${s.soldArt}`} />
                <div className={s.shelfName}>{m.horse_name}</div>
                <div className={s.shelfRar}><span className={`${s.rar} ${s[`rar${rarClass(m.rarity)}`]}`}>{m.rarity}</span></div>
                <div className={s.shelfMeta}>{m.matched_at.slice(5, 10)} 成約 → {m.buyer}</div>
                <div className={`${s.shelfPrice} ${s.soldPrice}`}>{fmt(m.price)} USDT</div>
              </div>
            ))}
          </div>
        )}
        <p className={s.shelfNote}>
          指名購入はありません — すべての取引は毎晩20:00の一斉マッチング(先着順)で公平に成立します。
          カードをタップすると仕組みの説明が見られます。
        </p>
        <div className={s.legendWrap}><RarityLegend /></div>
      </section>

      {/* ---- 第2幕: 購入予約パネル+予約一覧(page.tsx から注入) ---- */}
      {reserveSlot}

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
              <NftHorseArt look={deriveNftLook(l.dna_hash, l.name)} className={s.myArt} />
              <span className={s.myName}>{l.name}</span>
              <span className={`${s.rar} ${s[`rar${rarClass(l.rarity)}`]}`}>{l.rarity}</span>
              <span className={`${s.srcBadge} ${l.source === 'SMART' ? s.srcSmart : ''}`}>
                {l.source === 'SMART' ? 'スマート出品' : '手動出品'}
              </span>
              <span className={s.myMeta}>Day {l.current_day} · {fmt(l.price)} USDT · 出品 {l.listed_at.slice(0, 10)}</span>
              <span className={s.mySpacer} />
              {l.cancel_after_batch ? (
                <span className={s.pendingBadge}>取り下げ予約済(今夜のバッチ後)</span>
              ) : l.source === 'SMART' ? (
                <span className={s.myMeta}>取り下げはAUTO設定のスマート出品OFFで(翌バッチ反映)</span>
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

      {/* ---- ファネルモーダル: 指名購入不可の説明 → 購入予約へ(Decision 085) ---- */}
      {funnel && (
        <div className={d.overlay} role="dialog" aria-modal="true" onClick={() => setFunnel(null)}>
          <div className={d.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={d.dialogTitle}>
              {funnel.sold ? `${funnel.name} は成約済みです` : `${funnel.name} を指名して購入することはできません`}
            </div>
            <p className={s.funnelText}>
              公平性のため、特定の馬を選んで買う仕組みはありません。
              すべての取引は毎晩20:00の一斉マッチングで、購入予約の先着順に自動で成立します
              (人の手や優先枠は一切入りません)。
            </p>
            <p className={s.funnelText}>
              購入予約をすると、今夜のマッチングでこの棚の出品馬、または新規発行馬が
              あなたの厩舎に割り当てられます。
            </p>
            <div className={d.dialogActions}>
              <button type="button" className="secondary" onClick={() => setFunnel(null)}>閉じる</button>
              <button type="button" onClick={scrollToReserve}>購入予約へ進む ▼</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- 出品ダイアログ(確認チェックボックスを維持) ---- */}
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
                    <NftHorseArt look={deriveNftLook(h.dna_hash, h.name)} className={s.pickArt} />
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
