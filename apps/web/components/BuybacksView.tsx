import Link from 'next/link';
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

export function BuybacksView({ buybacks }: { buybacks: Buyback[] }) {
  return (
    <div className={s.wrap}>
      <div className={s.h1}>チャンピオン報酬</div>
      <div className={s.intro}>
        Day7を生き延びた馬は <b>200 USDT</b> で買い戻されます。翌日（D+1）から <b>7回</b>に分けて受取。
        7回完了で <b>記念NFT</b>（Polygon / ERC-721）がミントされます。
      </div>

      {buybacks.length > 0 ? (
        <div className={s.list}>
          {buybacks.map((b) => {
            const paid = Number(b.payments_paid) || 0;
            const done = b.status === 'COMPLETED';
            return (
              <Link key={b.id} href={`/champion/${b.id}`} className={s.card}>
                <div className={s.cardTop}>
                  <span className={s.cardTitle}>Day7達成 {b.day7_clear_date}</span>
                  <span className={`${s.badge} ${done ? s.stDone : s.stProgress}`}>{done ? '完了' : '進行中'}</span>
                  <span className={s.cardHid}>馬 {shortId(b.horse_id)}</span>
                </div>
                <div className={s.cardProg}>
                  <span className={s.progLabel}>{paid} / 7 回</span>
                  <span className={s.bar}><span style={{ width: `${(paid / 7) * 100}%` }} /></span>
                  <span className={s.cardTotal}>{money(b.total_amount)}<small>USDT</small></span>
                  <span className={s.cardGo}>詳細 →</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>チャンピオン報酬はまだありません。<br />馬がDay7を走り切るとチャンピオンとなり、報酬(200 USDT)がここに表示されます。</div>
      )}
    </div>
  );
}
