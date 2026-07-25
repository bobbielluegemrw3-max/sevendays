import { WalletMoneyCard, type WalletMoneyCopy } from '@/components/WalletMoneyCard';

/**
 * C プレビュー本体(fixture)。日本語の代表コピーを直書き(本番結線時に i18n 化)。
 * 3パターンを並べてオーナーが比較できるようにする:
 *   ① 受取予定あり + 厩舎の馬あり(チャンピオンを出したユーザー)
 *   ② 受取予定なし + 厩舎の馬あり(通常の育成中ユーザー)
 *   ③ 受取予定なし + 厩舎の馬なし(現金だけのユーザー)
 */

const COPY: WalletMoneyCopy = {
  wm_title: 'ウォレット',
  wm_now_head: '今あるお金',
  wm_avail_k: '使える残高',
  wm_locked_k: 'ロック中',
  wm_incoming_head: 'これから入るお金',
  wm_receivable_k: '受取予定',
  wm_receivable_sub_tpl: 'チャンピオン買い取り・残り{count}回・次はあと{days}日',
  wm_receivable_none: '受取予定はありません。',
  wm_stable_k: '厩舎の馬（参考価値）',
  wm_stable_note: '参考価値です。売却すれば現金になります。この価値はレースのBURNで変動します。',
};

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0a0813',
  padding: '32px 16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 28,
};
const col: React.CSSProperties = { width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8 };
const caption: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
  color: '#8890a0',
  letterSpacing: '0.04em',
};
const hint: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
  color: '#c9a86a',
  maxWidth: 420,
  lineHeight: 1.7,
  textAlign: 'center',
};

export function WalletAssetsPreview(): React.JSX.Element {
  return (
    <div style={wrap}>
      <div style={hint}>
        C プレビュー — 総資産カードの再フレーム（投資フレーミング廃止・現金中心）。
        <br />
        「総資産／TOTAL／増減」は無し。馬の時価は純資産に合算せず別枠。
      </div>

      <div style={col}>
        <div style={caption}>① チャンピオンを出したユーザー（受取予定あり＋馬あり）</div>
        <WalletMoneyCard
          available="123.45"
          locked="10.00"
          receivable={{ total: 171.42, count: 6, nextDays: 1 }}
          stableValue={250}
          t={COPY}
        />
      </div>

      <div style={col}>
        <div style={caption}>② 育成中ユーザー（受取予定なし＋馬あり）</div>
        <WalletMoneyCard
          available="48.00"
          locked="102.00"
          receivable={{ total: 0, count: 0, nextDays: null }}
          stableValue={186}
          t={COPY}
        />
      </div>

      <div style={col}>
        <div style={caption}>③ 現金だけのユーザー（受取予定なし＋馬なし）</div>
        <WalletMoneyCard
          available="500.00"
          locked="0.00"
          receivable={{ total: 0, count: 0, nextDays: null }}
          stableValue={0}
          t={COPY}
        />
      </div>
    </div>
  );
}
