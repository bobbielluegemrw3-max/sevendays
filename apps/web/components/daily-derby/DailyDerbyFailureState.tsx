import s from '../../app/daily-derby.module.css';

/**
 * バッチ失敗時のセーフモード表示(ADR-006 §12)。
 * パニックを誘う文言(system broken / funds lost 等)は禁止 — 静穏に。
 */
export function DailyDerbyFailureState() {
  return (
    <div className={s.failWrap}>
      <div className={s.failCard}>
        <div className={s.failTitle}>Daily Derby is under review</div>
        <p>
          Marketplace remains temporarily locked while settlement verification is
          completed.
        </p>
        <p>Results will be published once verification finishes. No action is required.</p>
      </div>
    </div>
  );
}
