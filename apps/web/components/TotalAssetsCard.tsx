import type { AppDict } from '@/lib/i18n';
import s from './total-assets.module.css';

/* ============================================================================
 * TotalAssetsCard — 総資産カード(2026-07-16 オーナー依頼)。
 * 「残高 + 厩舎の評価額 + ロック中 = 総資産」を一目で。/dashboard と /wallet の
 * 2箇所に置く共有サーバーコンポーネント(表示のみ・数値は呼び出し側が計算)。
 * デザインは 1c の部品言語: 金=資産のトーン、等式は3つのミニスタットで表現。
 * 評価額は公開価格テーブル由来 — BURNリスクの一文を必ず添える(R1正直コピー)。
 * ========================================================================== */

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TotalAssetsCard({
  available,
  locked,
  stableValue,
  uncollected = 0,
  t,
}: {
  available: string;
  locked: string;
  stableValue: number;
  /** 未回収(利確待ち)の上昇分 — 調教確定までは総資産に合流させない(A2・表示の儀式)。 */
  uncollected?: number;
  t: AppDict['dash'];
}) {
  const bal = Number(available);
  const lock = Number(locked);
  const total = bal + stableValue + lock - uncollected;
  return (
    <div className={s.card}>
      <div className={s.head}>
        <span className={s.label}>{t.total_k}</span>
      </div>
      <div className={s.body}>
        <div className={s.total}>
          <span className={s.totalV}>{money(total)}</span>
          <span className={s.totalU}>USDT</span>
        </div>
        <div className={s.eq} role="math" aria-label={`${t.total_bal} ${money(bal)} + ${t.total_stable} ${money(stableValue)} + ${t.total_locked} ${money(lock)}${uncollected > 0 ? ` - ${t.total_uncollected_k} ${money(uncollected)}` : ''} = ${money(total)}`}>
          <span className={s.part}>
            <span className={s.partK}>{t.total_bal}</span>
            <span className={s.partV}>{money(bal)}</span>
          </span>
          <span className={s.op}>+</span>
          <span className={s.part}>
            <span className={s.partK}>{t.total_stable}</span>
            <span className={`${s.partV} ${s.partStable}`}>{money(stableValue)}</span>
          </span>
          <span className={s.op}>+</span>
          <span className={s.part}>
            <span className={s.partK}>{t.total_locked}</span>
            <span className={`${s.partV} ${s.partLocked}`}>{money(lock)}</span>
          </span>
          {uncollected > 0 ? (
            <>
              <span className={s.op}>−</span>
              <span className={s.part}>
                <span className={s.partK}>{t.total_uncollected_k}</span>
                <span className={`${s.partV} ${s.partUncollected}`}>{money(uncollected)}</span>
              </span>
            </>
          ) : null}
          <span className={`${s.op} ${s.opEq}`}>=</span>
          <span className={`${s.part} ${s.partEq}`}>
            <span className={s.partK}>TOTAL</span>
            <span className={`${s.partV} ${s.partTotal}`}>{money(total)}</span>
          </span>
        </div>
        {uncollected > 0 ? (
          <div className={s.uncollectedLine}>
            {(t.total_uncollected_tpl ?? '未回収 +{v}').replace('{v}', money(uncollected))}
          </div>
        ) : null}
      </div>
      <div className={s.note}>{t.total_note}</div>
    </div>
  );
}
