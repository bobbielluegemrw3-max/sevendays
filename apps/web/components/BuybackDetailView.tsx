import Link from 'next/link';
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

export function BuybackDetailView({ buyback }: { buyback: BuybackDetail }) {
  const payments = [...buyback.payments].sort((a, b) => a.payment_number - b.payment_number);
  const paidCount = payments.filter((p) => p.status === 'PAID').length;
  const paidAmt = payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const done = buyback.status === 'COMPLETED';
  const nextNumber = payments.find((p) => p.status !== 'PAID')?.payment_number ?? -1;

  return (
    <div className={s.wrap}>
      {/* ヘッダ */}
      <div>
        <Link href="/champion" className={s.crumb}>← チャンピオン報酬一覧</Link>
        <div className={s.titleRow}>
          <span className={s.title}>チャンピオン報酬 {buyback.day7_clear_date}</span>
          <span className={`${s.badge} ${done ? s.stDone : s.stProgress}`}>{done ? '完了' : '進行中'}</span>
          <Link href={`/horses/${buyback.horse_id}`} className={s.hidLink}>馬 {buyback.horse_id.slice(0, 10)} →</Link>
        </div>
      </div>

      {/* 進捗ヒーロー */}
      <section className={s.hero}>
        <div className={s.heroTop}>
          <div>
            <div className={s.heroK}>受取進捗 · PROGRESS</div>
            <div className={s.heroNum}>{paidCount}<small> / 7 回</small></div>
          </div>
          <div className={s.heroRight}>
            <div className={s.heroRightK}>総額 · 受取済</div>
            <div className={s.heroAmt}>{money(String(paidAmt))} <span>/ {money(buyback.total_amount)}</span></div>
          </div>
        </div>
        <div className={`${s.bar} ${s.barBig}`} style={{ marginTop: 14 }}><span style={{ width: `${(paidCount / 7) * 100}%` }} /></div>
      </section>

      {/* 支払いスケジュール */}
      <div>
        <div className={s.secLabel}>支払いスケジュール · 7 PAYMENTS</div>
        <div className={s.pays}>
          {payments.map((p) => {
            const isPaid = p.status === 'PAID';
            const isNext = !isPaid && p.payment_number === nextNumber;
            return (
              <div key={p.payment_number} className={`${s.pRow} ${isPaid ? s.pPaid : ''}`}>
                <span className={`${s.pNum} ${isPaid ? s.pNumPaid : ''}`}>{p.payment_number}</span>
                <div className={s.pBody}>
                  <div className={s.pAmt}>{money(p.amount)} <small>USDT</small></div>
                  <div className={s.pDue}>予定 {p.due_date}{p.paid_at ? ` · 支払 ${p.paid_at.slice(0, 19)}` : ''}</div>
                </div>
                <span className={`${s.pStatus} ${isPaid ? s.pStatusPaid : isNext ? s.pStatusNext : s.pStatusPending}`}>
                  {isPaid ? 'PAID · 支払済' : isNext ? '次回' : p.status === 'PENDING' ? '予定' : p.status}
                </span>
              </div>
            );
          })}
        </div>
        <div className={s.note}>毎晩20:00の精算で1回ずつ支払われます。7回すべて完了すると、この馬の記念NFT（Polygon / ERC-721）がミントされます。</div>
      </div>
    </div>
  );
}
