import Link from 'next/link';
import { APP_COPY, fill, type Lang } from '@/lib/i18n';
import s from '../app/buybacks.module.css';

/* ============================================================================
 * /champion(チャンピオン報酬一覧)再設計 — ダッシュボード Option 1c と同じ部品言語。
 * 純粋な表示コンポーネント。props は { buybacks: Buyback[] } のみ。
 * 表示数値は Buyback の値のみ(架空値なし)。データ取得層 page.tsx は依頼側で結線。
 * ========================================================================== */

export interface Buyback {
  id: string; horse_id: string; status: string; total_amount: string;
  day7_clear_date: string; payments_paid: number | string;
}

function money(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
}
function shortId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export function BuybacksView({ buybacks, lang = 'ja' }: { buybacks: Buyback[]; lang?: Lang }) {
  const t = APP_COPY[lang].champion;
  return (
    <div className={s.wrap}>
      <div className={s.h1}>{t.bv_title}</div>
      <div className={s.intro}>
        {t.bv_intro_a}<b>{t.bv_intro_bold1}</b>{t.bv_intro_b}<b>{t.bv_intro_bold2}</b>{t.bv_intro_c}<b>{t.bv_intro_bold3}</b>{t.bv_intro_d}
      </div>

      {buybacks.length > 0 ? (
        <div className={s.list}>
          {buybacks.map((b) => {
            const paid = Number(b.payments_paid) || 0;
            const done = b.status === 'COMPLETED';
            return (
              <Link key={b.id} href={`/champion/${b.id}`} className={s.card}>
                <div className={s.cardTop}>
                  <span className={s.cardTitle}>{fill(t.card_day7_tpl, { d: b.day7_clear_date })}</span>
                  <span className={`${s.badge} ${done ? s.stDone : s.stProgress}`}>{done ? t.status_done : t.status_progress}</span>
                  <span className={s.cardHid}>{fill(t.card_horse_tpl, { id: shortId(b.horse_id) })}</span>
                </div>
                <div className={s.cardProg}>
                  <span className={s.progLabel}>{fill(t.count7_tpl, { p: paid })}</span>
                  <span className={s.bar}><span style={{ width: `${(paid / 7) * 100}%` }} /></span>
                  <span className={s.cardTotal}>{money(b.total_amount)}<small>USDT</small></span>
                  <span className={s.cardGo}>{t.detail_arrow}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>{t.empty_a}<br />{t.empty_b}</div>
      )}
    </div>
  );
}
