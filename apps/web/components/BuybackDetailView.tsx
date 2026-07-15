import Link from 'next/link';
import { localDateTime } from '@/lib/format-time';
import { APP_COPY, fill, type Lang } from '@/lib/i18n';
import s from '../app/buybacks.module.css';

/* ============================================================================
 * /champion/[id](チャンピオン報酬詳細)再設計 — 200 USDT を7回に分けて受取るスケジュール。
 * 純粋な表示コンポーネント。表示数値は BuybackDetail の値のみ(架空値なし)。
 * データ取得層 page.tsx は依頼側で結線。
 * ========================================================================== */

export interface Payment {
  payment_number: number; due_date: string; amount: string; status: string; paid_at: string | null;
}
export interface BuybackDetail {
  id: string; horse_id: string; status: string; total_amount: string;
  day7_clear_date: string; payments: Payment[];
}

function money(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
}

export function BuybackDetailView({ buyback, lang = 'ja' }: { buyback: BuybackDetail; lang?: Lang }) {
  const t = APP_COPY[lang].champion;
  const payments = [...buyback.payments].sort((a, b) => a.payment_number - b.payment_number);
  const paidCount = payments.filter((p) => p.status === 'PAID').length;
  const paidAmt = payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const done = buyback.status === 'COMPLETED';
  const nextNumber = payments.find((p) => p.status !== 'PAID')?.payment_number ?? -1;

  return (
    <div className={s.wrap}>
      {/* ヘッダ */}
      <div>
        <Link href="/champion" className={s.crumb}>{t.crumb}</Link>
        <div className={s.titleRow}>
          <span className={s.title}>{fill(t.detail_title_tpl, { d: buyback.day7_clear_date })}</span>
          <span className={`${s.badge} ${done ? s.stDone : s.stProgress}`}>{done ? t.status_done : t.status_progress}</span>
          <Link href={`/horses/${buyback.horse_id}`} className={s.hidLink}>{fill(t.horse_link_tpl, { id: buyback.horse_id.slice(0, 10) })}</Link>
        </div>
      </div>

      {/* 進捗ヒーロー */}
      <section className={s.hero}>
        <div className={s.heroTop}>
          <div>
            <div className={s.heroK}>{t.progress_k}</div>
            <div className={s.heroNum}>{paidCount}<small>{t.of7}</small></div>
          </div>
          <div className={s.heroRight}>
            <div className={s.heroRightK}>{t.total_received_k}</div>
            <div className={s.heroAmt}>{money(String(paidAmt))} <span>/ {money(buyback.total_amount)}</span></div>
          </div>
        </div>
        <div className={`${s.bar} ${s.barBig}`} style={{ marginTop: 14 }}><span style={{ width: `${(paidCount / 7) * 100}%` }} /></div>
      </section>

      {/* 支払いスケジュール */}
      <div>
        <div className={s.secLabel}>{t.schedule_label}</div>
        <div className={s.pays}>
          {payments.map((p) => {
            const isPaid = p.status === 'PAID';
            const isNext = !isPaid && p.payment_number === nextNumber;
            return (
              <div key={p.payment_number} className={`${s.pRow} ${isPaid ? s.pPaid : ''}`}>
                <span className={`${s.pNum} ${isPaid ? s.pNumPaid : ''}`}>{p.payment_number}</span>
                <div className={s.pBody}>
                  <div className={s.pAmt}>{money(p.amount)} <small>USDT</small></div>
                  <div className={s.pDue}>{fill(t.due_tpl, { d: p.due_date })}{p.paid_at ? fill(t.paid_tpl, { t: localDateTime(p.paid_at) }) : ''}</div>
                </div>
                <span className={`${s.pStatus} ${isPaid ? s.pStatusPaid : isNext ? s.pStatusNext : s.pStatusPending}`}>
                  {isPaid ? t.status_paid : isNext ? t.status_next : p.status === 'PENDING' ? t.status_pending : p.status}
                </span>
              </div>
            );
          })}
        </div>
        <div className={s.note}>{t.detail_note}</div>
      </div>
    </div>
  );
}
