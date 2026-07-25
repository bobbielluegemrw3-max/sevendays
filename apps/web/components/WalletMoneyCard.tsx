import s from './wallet-money.module.css';

/* ============================================================================
 * WalletMoneyCard — 総資産カードの後継(WALLET_HARDENING §4 C・R1再フレーム)。
 * 「総資産/TOTAL/損益/増減」の投資フレーミングを廃止し、現金中心の中立ビューに:
 *   ① 今あるお金   = 使える残高 + ロック中
 *   ② これから入るお金 = 受取予定(チャンピオン買い取り 200USDT/7日分割の残・SCHEDULED分)
 *   ③ 厩舎の馬(参考価値) = 純資産に合算しない別枠(売却で現金化)
 * 受取予定は「既に勝った馬の buyback_schedule_payments(SCHEDULED)」のみ=投影値でない。
 * 表示のみ(数値は呼び出し側が算出)。増減アニメ/損益ラベルは持たない。
 * ========================================================================== */

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** キー名は i18n の dash 辞書(wm_*)と一致=dash をそのまま渡せる(マッピング不要)。 */
export interface WalletMoneyCopy {
  /** カード見出し(投資語を使わない・例「ウォレット」)。 */
  wm_title: string;
  wm_now_head: string; // 今あるお金
  wm_avail_k: string; // 使える残高
  wm_locked_k: string; // ロック中
  wm_incoming_head: string; // これから入るお金
  wm_receivable_k: string; // 受取予定
  /** 受取予定サブライン。{count}=残り回数 {days}=次回まで日数。 */
  wm_receivable_sub_tpl: string;
  wm_receivable_none: string; // 受取予定なし
  wm_stable_k: string; // 厩舎の馬(参考価値)
  wm_stable_note: string; // 参考価値の注記
}

export interface WalletReceivable {
  /** SCHEDULED 支払いの合計(残・USDT)。 */
  total: number;
  /** 残り支払い回数。 */
  count: number;
  /** 次回支払いまでの日数(0=本日/未定は null)。 */
  nextDays: number | null;
}

export function WalletMoneyCard({
  available,
  locked,
  receivable,
  stableValue,
  t,
}: {
  available: string;
  locked: string;
  /** 受取予定(既に勝った馬の買い取り残)。無ければ total=0。 */
  receivable: WalletReceivable;
  /** 厩舎の馬の参考価値(公開価格テーブル由来)。現金に合算しない。 */
  stableValue: number;
  t: WalletMoneyCopy;
}): React.JSX.Element {
  const bal = Number(available);
  const lock = Number(locked);
  const hasReceivable = receivable.total > 0;
  const hasStable = stableValue > 0;

  return (
    <div className={s.card}>
      <div className={s.label}>{t.wm_title}</div>

      {/* ① 今あるお金 */}
      <div className={s.group}>
        <div className={s.groupHead}>{t.wm_now_head}</div>
        <div className={s.rows}>
          <div className={`${s.row} ${s.hero}`}>
            <span className={s.rowK}>{t.wm_avail_k}</span>
            <span className={`${s.rowV} ${s.vAvail}`}>
              {money(bal)}
              <span className={s.rowU}>USDT</span>
            </span>
          </div>
          <div className={s.row}>
            <span className={s.rowK}>{t.wm_locked_k}</span>
            <span className={`${s.rowV} ${s.vLocked}`}>
              {money(lock)}
              <span className={s.rowU}>USDT</span>
            </span>
          </div>
        </div>
      </div>

      {/* ② これから入るお金(受取予定) */}
      <div className={s.group}>
        <div className={s.groupHead}>{t.wm_incoming_head}</div>
        <div className={s.rows}>
          <div className={s.row}>
            <span className={s.rowK}>{t.wm_receivable_k}</span>
            <span className={`${s.rowV} ${s.vReceivable}`}>
              {money(receivable.total)}
              <span className={s.rowU}>USDT</span>
            </span>
          </div>
        </div>
        {hasReceivable ? (
          <div className={s.sub}>
            {t.wm_receivable_sub_tpl
              .replace('{count}', String(receivable.count))
              .replace('{days}', receivable.nextDays === null ? '—' : String(receivable.nextDays))}
          </div>
        ) : (
          <div className={`${s.sub} ${s.subNone}`}>{t.wm_receivable_none}</div>
        )}
      </div>

      {/* ③ 厩舎の馬(参考価値・現金に合算しない別枠) */}
      {hasStable ? (
        <>
          <div className={s.divider} />
          <div className={s.stable}>
            <span className={s.stableK}>{t.wm_stable_k}</span>
            <span className={s.stableV}>
              {money(stableValue)}
              <span className={s.rowU}>USDT</span>
            </span>
          </div>
          <div className={s.stableNote}>{t.wm_stable_note}</div>
        </>
      ) : null}
    </div>
  );
}
