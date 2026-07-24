'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { refreshSoft } from '@/lib/deferred-refresh';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { deriveNftLook } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import { localDateTime } from '@/lib/format-time';
import { nextRaceInstant } from '@/lib/race-time';
import { PRICE_TABLE_V1 } from '@sevendays/domain';
import s from '../app/market.module.css';
import { TotalValue } from '@/components/ui/TotalValue';
import d from '../app/support.module.css';
import { ErrorLine } from '@/components/ui/ErrorLine';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

/**
 * /market — マーケットプレイス 3幕再デザイン(MARKET_PAGE_IDENTITY_REVISION_SPEC.md)。
 * デザイナー正典 Marketplace.html を本番データへ結線。表示名は「マーケットプレイス」。
 *   ACT1 迎える  — ヘッダー(カウントダウン/需給実数/残高) + プール予約(reserveSlot) + 出走予定の棚
 *   ACT2 手放す  — 手放し候補カード(案B: 総合値/適性/戦績はデータ層未拡充のため出さない)
 *                  + 手放し待ち(出品中) + 手放し確認モーダル。手放し=MANUAL 出品(手数料5%)
 *   ACT3 清算    — 実成約フィード(SOLD/新規発行)に統合
 *
 * §3 引き算: 鼓動3カード/棚の毎回モーダル/棚のSOLD混在/独立成約セクションを撤去。
 * §3 残す(不変): 予約機構・出品/取下API・確認チェックボックス・Market Lock・価格ラダー・キュー・割当・精算。
 * globals.css のトークン(--cyan/--gold/--font-display…)は正典と同値なのでそのまま使う。
 */

export interface ShelfItem {
  listing_id: string;
  horse_id: string;
  price: string;
  current_day: number;
  listed_at: string;
  name: string;
  dna_hash: string;
  rarity: string;
  total_value?: number | null;
}
export interface MatchRow {
  horse_name: string;
  price: string;
  buyer: string;
  matched_at: string;
  dna_hash: string;
  rarity: string;
  is_mint: boolean;
}
export interface MyListing {
  listing_id: string;
  horse_id: string;
  price: string;
  current_day: number;
  listed_at: string;
  cancel_after_batch: boolean;
  /** 'SMART'(自動出品) | 'MANUAL'(手動出品=手放し)。 */
  source: string;
  name: string;
  dna_hash: string;
  rarity: string;
}
export interface ListableHorse {
  id: string;
  name: string;
  current_day: number;
  status: string;
  dna_hash: string;
  gifted_at?: string | null;
}
export interface MarketPlaceData {
  shelf: ShelfItem[];
  pending_buy_count: number;
  recent_matches: MatchRow[];
  my_listings: MyListing[];
}

const RELEASE_FEE = 0.05;
const CHAMP_DAY = 7;
const fmt = (v: string | number): string =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const priceOf = (day: number): number => Number(PRICE_TABLE_V1[Math.max(0, Math.min(6, day))] ?? '0');
const receiveOf = (price: number): string => fmt(Math.floor(price * (1 - RELEASE_FEE) * 100) / 100);
const raceLabel = (day: number): string => {
  const l = CHAMP_DAY - day;
  return l <= 1 ? 'あと 1 走で走破 ＝ チャンピオン 200 に届きます' : `あと ${l} 走で走破 ＝ チャンピオン 200`;
};
const hhmmss = (ms: number): string => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
};

// featSpin(回転する光の枠線・正典 §2-1)は @property/@keyframes が要る=スコープ<style>で注入。
const FEAT_STYLE = `
.mktScope .mktFeat{position:relative;isolation:isolate}
.mktScope .mktFeat::before{content:'';position:absolute;inset:0;border-radius:12px;padding:1px;pointer-events:none;z-index:2;background:conic-gradient(from var(--featAngle,0deg),transparent 0deg,rgba(0,234,255,0) 44deg,#00eaff 84deg,#fff 96deg,#00eaff 108deg,rgba(0,234,255,0) 150deg,transparent 360deg);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;animation:mktFeatSpin 5s linear infinite}
@property --featAngle{syntax:'<angle>';initial-value:0deg;inherits:false}
@keyframes mktFeatSpin{to{--featAngle:360deg}}
@keyframes mktSheen{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
@keyframes mktBeat{0%,100%{opacity:1}50%{opacity:.6}}
@keyframes mktFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.mktScope *{animation:none!important}}
`;

const actStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 'clamp(15px,2.6vw,22px)',
  background: 'linear-gradient(180deg,var(--panel-2),var(--panel))',
  boxShadow: 'var(--shadow)',
  animation: `mktFade .5s ease both`,
};
const bar = (grad: string): React.CSSProperties => ({
  width: 6,
  height: 38,
  borderRadius: 3,
  background: grad,
});
const kicker = (color: string): React.CSSProperties => ({
  font: '700 10px/1 var(--font-mono)',
  letterSpacing: '.28em',
  color,
});
const actTitle: React.CSSProperties = {
  margin: '4px 0 0',
  font: '800 21px/1 var(--font-display)',
  letterSpacing: '.05em',
  color: 'var(--text)',
};

export function MarketPlaceView({
  data,
  myHorses,
  reserveSlot,
  walletAvailable = '0',
  preview = false,
}: {
  data: MarketPlaceData;
  myHorses: ListableHorse[];
  reserveSlot?: React.ReactNode;
  /** USER_AVAILABLE 残高(ヘッダー表示・GET /wallet)。 */
  walletAvailable?: string;
  preview?: boolean;
}) {
  const lang = useLang();
  const router = useRouter();
  const [pick, setPick] = useState<ListableHorse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ヘッダーのカウントダウン(次のバッチまで)。ref+DOM直更新で毎秒再レンダーを避ける。
  const cdRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tick = () => {
      if (cdRef.current) cdRef.current.textContent = hhmmss(nextRaceInstant().getTime() - Date.now());
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const myIds = new Set(data.my_listings.map((l) => l.horse_id));
  const listable = myHorses.filter(
    (h) => h.status === 'ACTIVE' && h.current_day >= 1 && h.current_day <= 6 && !myIds.has(h.id) && !h.gifted_at,
  );

  const submitList = async () => {
    if (!pick || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    if (preview) {
      setBusy(false);
      setPick(null);
      setNotice(`${horseDisplayName(pick.name, lang)} を手放しました(プレビュー)。`);
      return;
    }
    const result = await apiFetch('/api/v1/market/list', { method: 'POST', body: { horse_id: pick.id } });
    setBusy(false);
    if (result.status === 200) {
      setNotice(`${horseDisplayName(pick.name, lang)} を手放しました。次のレースから出走しません。`);
      setPick(null);
      refreshSoft(router);
    } else {
      setError(errorMessage(result.body) ?? '手放しに失敗しました。');
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
      setNotice(`${horseDisplayName(listing.name, lang)} を厩舎に戻す手続きを受け付けました(次のバッチ後)。`);
      if (!preview) refreshSoft(router);
    } else {
      setNotice(errorMessage(result.body) ?? '取り下げに失敗しました。');
    }
  };

  return (
    <div
      className={`mktScope ${s.wrap}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <style dangerouslySetInnerHTML={{ __html: FEAT_STYLE }} />

      {/* ═══ ヘッダー: シネマティック・ゲート ═══ */}
      <header
        style={{
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 20,
          background:
            'radial-gradient(120% 130% at 50% 128%,rgba(0,234,255,.16),transparent 55%),linear-gradient(180deg,#0c0918,#070510)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'repeating-linear-gradient(90deg,transparent 0,transparent 62px,rgba(0,234,255,.04) 62px,rgba(0,234,255,.04) 63px)',
            mask: 'linear-gradient(180deg,transparent 40%,#000 130%)',
            WebkitMask: 'linear-gradient(180deg,transparent 40%,#000 130%)',
          }}
        />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(0,234,255,.7),rgba(255,45,196,.5),transparent)' }} />
        <div style={{ position: 'relative', padding: 'clamp(18px,3vw,26px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 'clamp(14px,2.5vw,26px)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 9, height: 20, borderRadius: 2, background: 'linear-gradient(180deg,var(--cyan),var(--magenta))', boxShadow: '0 0 12px rgba(0,234,255,.6)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: '.9' }}>
                <span style={{ font: '500 7px/1 var(--font-mono)', letterSpacing: '.3em', color: 'var(--muted)' }}>SEVEN DAYS</span>
                <span style={{ font: '800 15px/1 var(--font-display)', letterSpacing: '.1em', color: 'var(--text)' }}>DERBY</span>
              </span>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, font: '700 9.5px/1 var(--font-mono)', letterSpacing: '.14em', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff3b5c', boxShadow: '0 0 8px rgba(255,59,92,.9)', animation: 'mktBeat 1.5s ease-in-out infinite' }} />
              NIGHT&nbsp;SETTLEMENT
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ minWidth: 220 }}>
              <div style={{ font: '700 11px/1 var(--font-mono)', letterSpacing: '.34em', color: 'var(--cyan)', textTransform: 'uppercase', marginBottom: 11 }}>MARKETPLACE</div>
              <h1 style={{ margin: 0, font: '900 clamp(30px,5.5vw,46px)/1 var(--font-display)', letterSpacing: '.04em', color: 'var(--text)' }}>マーケットプレイス</h1>
              <p style={{ margin: '12px 0 0', maxWidth: '40ch', color: 'var(--muted)', fontSize: 13, fontFamily: 'var(--font-jp)', lineHeight: 1.7 }}>朝 8:00・夜 20:00（GMT+8）の清算で、馬が厩舎を出入りします。次の清算までに、今夜の顔ぶれを整えましょう。</p>
            </div>
            <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
              <div style={{ font: '700 10px/1 var(--font-mono)', letterSpacing: '.2em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 9 }}>次の清算まで</div>
              <div ref={cdRef} style={{ font: '900 clamp(38px,7.5vw,64px)/.92 var(--font-display)', letterSpacing: '.01em', color: 'var(--cyan)', textShadow: '0 0 34px rgba(0,234,255,.5)', fontVariantNumeric: 'tabular-nums' }}>--:--:--</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', marginTop: 'clamp(16px,2.6vw,26px)', paddingTop: 15, borderTop: '1px solid var(--border)' }}>
            <span style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--faint)' }}>次のバッチ <b style={{ color: 'var(--text)', fontWeight: 600 }}>朝8:00 / 夜20:00 GMT+8</b></span>
            <span style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--faint)' }}>買い予約 <b style={{ color: 'var(--text)', fontWeight: 600 }}>{data.pending_buy_count.toLocaleString('en-US')} 件</b></span>
            <span style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--faint)' }}>出品中 <b style={{ color: 'var(--gold-bright)', fontWeight: 600 }}>{data.shelf.length.toLocaleString('en-US')} 頭</b></span>
            <span style={{ marginLeft: 'auto', font: '500 11px/1 var(--font-jp)', color: 'var(--faint)' }}>残高 <b style={{ color: 'var(--gold-bright)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{fmt(walletAvailable)}</b> USDT</span>
          </div>
        </div>
      </header>

      {notice && <p className="ok">{notice}</p>}

      {/* ═══ ACT 1: 馬を迎える ═══ */}
      <section style={actStyle} id="reserve">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={bar('linear-gradient(180deg,var(--cyan),var(--magenta))')} />
          <div>
            <div style={kicker('var(--cyan)')}>ACT&nbsp;01</div>
            <h2 style={actTitle}>馬を迎える</h2>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)' }}>次のレースに向けて、あたらしい馬を迎える</span>
        </div>

        {/* プール予約 + 予約状態 + AUTO設定(reserveSlot・実 PoolReservePanel ほか) */}
        <div style={{ marginTop: 15 }}>{reserveSlot}</div>

        {/* 次回のレースに出走予定の馬(棚のプレビュー・指名不可) */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          <h3 style={{ margin: 0, font: '700 14px/1 var(--font-display)', letterSpacing: '.06em', color: 'var(--text)' }}>次回のレースに出走予定の馬</h3>
          <span style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--muted)', textAlign: 'right' }}>指名購入はありません — 一斉マッチング（先着順）で公平に成立</span>
        </div>
        {data.shelf.length === 0 ? (
          <p className="empty">まだ出品はありません。最初の取引者になりましょう。</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 11, marginTop: 13 }}>
            {data.shelf.map((item, i) => (
              <div key={item.listing_id} className="mktFeat" style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'linear-gradient(160deg,rgba(255,255,255,.02),var(--panel-2))', padding: '11px 11px 13px', textAlign: 'center' }}>
                <span style={{ position: 'absolute', top: -8, left: -6, font: '400 9px/1 var(--font-mono)', color: 'var(--faint)', background: '#0a0816', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px', zIndex: 3 }}>#{i + 1}</span>
                {myIds.has(item.horse_id) && <span style={{ position: 'absolute', top: -8, right: -6, font: '700 8px/1 var(--font-display)', color: 'var(--cyan)', background: '#0a0816', border: '1px solid var(--border-strong)', borderRadius: 5, padding: '2px 6px', zIndex: 3 }}>MINE</span>}
                <div style={{ width: 104, height: 104, margin: '0 auto', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <NftHorseArt look={deriveNftLook(item.dna_hash, item.name)} size={208} />
                </div>
                <div style={{ font: '700 12px/1.3 var(--font-display)', color: 'var(--text)', marginTop: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{horseDisplayName(item.name, lang)}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 7 }}>
                  {item.total_value !== null && item.total_value !== undefined ? (
                    <TotalValue value={item.total_value} label="総合値" size="sm" />
                  ) : null}
                  <span style={{ font: '700 9.5px/1 var(--font-mono)', letterSpacing: '.06em', color: 'var(--muted)' }}>LV{item.current_day}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p style={{ margin: '12px 0 0', font: '400 11.5px/1.7 var(--font-mono)', color: 'var(--faint)' }}>この棚はプレビューです。予約すると、この中の馬か新規発行馬が次の清算で割り当たります（指名はできません）。</p>
      </section>

      {/* ═══ ACT 2: 馬を手放す ═══ */}
      <section style={actStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={bar('linear-gradient(180deg,var(--gold-bright),var(--gold))')} />
          <div>
            <div style={kicker('var(--gold)')}>ACT&nbsp;02</div>
            <h2 style={actTitle}>馬を手放す</h2>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)' }}>育てた馬を売って、利益を確定する</span>
        </div>

        <div style={{ font: '700 10.5px/1 var(--font-mono)', letterSpacing: '.14em', color: 'var(--faint)', textTransform: 'uppercase', margin: '16px 0 12px' }}>出品可能なあなたの馬</div>
        {listable.length === 0 ? (
          <p className="empty">手放せる馬がいません（LV.1〜6のACTIVE馬のみ）。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {listable.map((h) => {
              const price = priceOf(h.current_day);
              const trackPct = `${Math.round((h.current_day / 6) * 100)}%`;
              return (
                <div key={h.id} style={{ position: 'relative', border: '1px solid rgba(201,168,106,.32)', borderRadius: 'var(--radius)', background: 'linear-gradient(158deg,#1c1733 0%,var(--panel) 62%,#0c0a16 100%)', boxShadow: '0 30px 70px -42px #000,inset 0 1px 0 rgba(242,228,191,.13)', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(242,228,191,.6),transparent)' }} />
                  <div style={{ display: 'flex', gap: 15, padding: '17px 17px 13px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '0 0 auto', width: 96, height: 96, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(201,168,106,.4)', boxShadow: '0 0 0 3px rgba(201,168,106,.07),0 14px 30px -14px #000' }}>
                      <NftHorseArt look={deriveNftLook(h.dna_hash, h.name)} size={192} />
                    </div>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ font: '800 19px/1.15 var(--font-display)', letterSpacing: '.03em', color: 'var(--gold-bright)', textShadow: '0 1px 12px rgba(242,228,191,.15)' }}>{horseDisplayName(h.name, lang)}</div>
                          <div style={{ font: '500 10.5px/1 var(--font-mono)', color: 'var(--faint)', marginTop: 6, letterSpacing: '.08em' }}>DAY {h.current_day}</div>
                        </div>
                        <span style={{ flex: '0 0 auto', font: '700 11px/1 var(--font-display)', letterSpacing: '.06em', color: 'var(--gold-bright)', border: '1px solid rgba(201,168,106,.4)', borderRadius: 6, padding: '5px 9px', background: 'rgba(201,168,106,.1)' }}>DAY {h.current_day}</span>
                      </div>
                      <div style={{ margin: '12px 0 0', padding: '13px 15px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,.015)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', font: '500 10px/1 var(--font-mono)', color: 'var(--faint)', marginBottom: 9 }}>
                          <span>発行 100.00</span><span style={{ color: 'var(--gold-bright)' }}>走破 200.00</span>
                        </div>
                        <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: trackPct, background: 'linear-gradient(90deg,var(--gold),var(--gold-bright))', boxShadow: '0 0 10px rgba(242,228,191,.4)' }} />
                        </div>
                        <div style={{ textAlign: 'center', marginTop: 9, font: '400 11px/1 var(--font-jp)', color: 'var(--muted)' }}>現在値 <b style={{ font: '800 15px/1 var(--font-display)', color: 'var(--text)' }}>{fmt(price)}</b> USDT（生存で +10% / 日）</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 1, margin: '0 12px', background: 'var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 15px', background: 'var(--panel)' }}>
                      <div style={{ font: '400 10px/1 var(--font-mono)', letterSpacing: '.12em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 9 }}>今 手放すと</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)', marginBottom: 3 }}>受け取る</div>
                      <div style={{ font: '800 25px/1 var(--font-display)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{receiveOf(price)}<span style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}> USDT</span></div>
                      <div style={{ fontSize: 10.5, color: 'var(--faint)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>現在値 {fmt(price)} − 手数料 5%</div>
                    </div>
                    <div style={{ padding: '14px 15px', background: 'rgba(201,168,106,.05)' }}>
                      <div style={{ font: '400 10px/1 var(--font-mono)', letterSpacing: '.12em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 9 }}>走り続ければ</div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 7 }}>
                        <span style={{ fontSize: 15, lineHeight: 1.1, filter: 'saturate(.7)' }}>🏆</span>
                        <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--gold-bright)', fontFamily: 'var(--font-jp)' }}>{raceLabel(h.current_day)}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)' }}>＋ 生存するたび 価値 +10% / 日</div>
                    </div>
                  </div>
                  <div style={{ padding: '14px 12px 16px' }}>
                    <button type="button" onClick={() => { setPick(h); setConfirmed(false); setError(null); }} style={{ width: '100%', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'rgba(255,255,255,.04)', color: 'var(--text)', font: '700 13px/1 var(--font-display)', letterSpacing: '.06em', cursor: 'pointer' }}>この馬を手放す</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {data.my_listings.length > 0 && (
          <>
            <div style={{ font: '700 10.5px/1 var(--font-mono)', letterSpacing: '.14em', color: 'var(--faint)', textTransform: 'uppercase', margin: '20px 0 11px' }}>手放し待ち — 次の清算で買い手を待っています</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.my_listings.map((l) => (
                <div key={l.listing_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '9px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 13px' }}>
                  <div style={{ flex: '0 0 auto', width: 42, height: 42, borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border)', filter: 'grayscale(.35) brightness(.9)' }}>
                    <NftHorseArt look={deriveNftLook(l.dna_hash, l.name)} size={84} />
                  </div>
                  <span style={{ font: '700 14px/1.2 var(--font-display)', color: 'var(--text)' }}>{horseDisplayName(l.name, lang)}</span>
                  <span style={{ font: '700 9px/1 var(--font-display)', letterSpacing: '.06em', borderRadius: 5, padding: '3px 7px', whiteSpace: 'nowrap', ...(l.source === 'SMART' ? { color: 'var(--cyan)', border: '1px solid rgba(0,234,255,.4)', background: 'rgba(0,234,255,.07)' } : { color: 'var(--muted)', border: '1px solid var(--border)', background: 'rgba(255,255,255,.02)' }) }}>{l.source === 'SMART' ? 'スマート出品' : '手動出品'}</span>
                  <span style={{ font: '400 11px/1.5 var(--font-mono)', color: 'var(--faint)' }}>Day {l.current_day} · {fmt(l.price)} USDT · 出走停止中（DAY／価値は凍結）</span>
                  <span style={{ flex: 1 }} />
                  {l.cancel_after_batch ? (
                    <span style={{ font: '400 11px/1 var(--font-mono)', color: 'var(--faint)' }}>取り下げ予約済（次のバッチ後）</span>
                  ) : l.source === 'SMART' ? (
                    <span style={{ font: '400 11px/1 var(--font-mono)', color: 'var(--faint)' }}>取り下げはAUTO設定OFFで</span>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void submitUnlist(l)} style={{ flex: '0 0 auto', padding: '8px 13px', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(255,45,196,.5)', background: 'rgba(255,45,196,.1)', color: 'var(--magenta-soft)', font: '700 12px/1 var(--font-display)', letterSpacing: '.04em', cursor: 'pointer' }}>厩舎に戻す</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        <p style={{ margin: '16px 0 0', font: '400 11.5px/1.75 var(--font-jp)', color: 'var(--faint)' }}>保証はありません。次の清算で買い手が付けば成約、付かなければ厩舎に戻せます（手放し中はレースに出走しません）。価格は当日のLV価格で固定・手数料 5%。出品操作は馬ごとに 1 日 1 回です。</p>
      </section>

      {/* ═══ ACT 3: 今夜／直近の清算 ═══ */}
      <section style={actStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={bar('linear-gradient(180deg,var(--muted),var(--faint))')} />
          <div>
            <div style={kicker('var(--muted)')}>ACT&nbsp;03</div>
            <h2 style={actTitle}>今夜／直近の清算</h2>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)' }}>馬が厩舎を出入りした記録</span>
        </div>
        {data.recent_matches.length === 0 ? (
          <p className="empty">まだ成約はありません。</p>
        ) : (
          data.recent_matches.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', padding: '11px 2px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ flex: '0 0 auto', font: '700 9.5px/1 var(--font-display)', letterSpacing: '.08em', borderRadius: 5, padding: '4px 8px', ...(m.is_mint ? { color: 'var(--gold-bright)', border: '1px solid rgba(201,168,106,.5)', background: 'rgba(201,168,106,.1)' } : { color: 'var(--good-soft)', border: '1px solid rgba(53,208,127,.4)', background: 'rgba(53,208,127,.1)' }) }}>{m.is_mint ? '新規発行' : 'SOLD'}</span>
              <span style={{ flex: 1, minWidth: 0, font: '700 13px/1.2 var(--font-display)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{horseDisplayName(m.horse_name, lang)}</span>
              <span style={{ font: '700 14px/1 var(--font-display)', color: 'var(--gold-bright)', fontVariantNumeric: 'tabular-nums' }}>{fmt(m.price)}</span>
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>→ {m.buyer}</span>
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>{localDateTime(m.matched_at).slice(5)}</span>
            </div>
          ))
        )}
        <p style={{ margin: '12px 0 0', font: '400 11px/1.6 var(--font-jp)', color: 'var(--faint)', textAlign: 'center' }}>実際に成約した清算のみを表示しています</p>
      </section>

      {/* ═══ 手放し確認モーダル(確認チェックボックスを維持・§3残す) ═══ */}
      {pick && (
        <div className={d.overlay} role="dialog" aria-modal="true" onClick={() => setPick(null)}>
          <div className={d.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 6 }}>
              <div style={{ flex: '0 0 auto', width: 48, height: 48, borderRadius: 11, overflow: 'hidden', border: '1px solid rgba(201,168,106,.4)' }}>
                <NftHorseArt look={deriveNftLook(pick.dna_hash, pick.name)} size={96} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '400 10.5px/1 var(--font-mono)', letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase' }}>手放しの確認</div>
                <div style={{ font: '700 17px/1.25 var(--font-display)', letterSpacing: '.04em', color: 'var(--gold-bright)', marginTop: 4 }}>{horseDisplayName(pick.name, lang)} を手放しますか？</div>
              </div>
            </div>
            <div style={{ border: '1px solid rgba(230,178,74,.5)', background: 'rgba(230,178,74,.08)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', margin: '14px 0', font: '400 12.5px/1.75 var(--font-jp)', color: 'var(--warn)' }}>
              手放すと <b>次のレースから出走しません</b>。次の清算で買い手が付けば <b style={{ color: 'var(--gold-bright)' }}>{receiveOf(priceOf(pick.current_day))} USDT</b> を受け取ります（手数料 5% 込み）。付かなければ厩舎に戻せます。出品操作は馬ごとに 1 日 1 回です。
            </div>
            <label className={d.confirmLabel} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>手放すと、この馬は <b style={{ color: 'var(--gold-bright)' }}>チャンピオンを目指せなくなる</b> ことを理解しました。</span>
            </label>
            {error && <ErrorLine>{error}</ErrorLine>}
            <div className={d.dialogActions}>
              <Button variant="secondary" onClick={() => setPick(null)}>キャンセル</Button>
              <Button busy={busy} busyLabel="手放し中…" disabled={!confirmed} sound="confirm" onClick={() => void submitList()}>
                手放す
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
