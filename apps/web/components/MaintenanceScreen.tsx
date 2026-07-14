import { GoogleLoginButton } from '@/components/GoogleLoginButton';
import s from './maintenance.module.css';

/* メンテナンス画面(Decision 098)。ONの間、管理者以外の全ページがこれに
 * 置き換わる(RootLayoutが差し替える — 各ページは実行されない)。
 * 下部の小さなログイン導線は管理者のセッション切れ用: ログイン後、
 * 管理者ならレイアウトのゲートを通過して通常画面に戻る。一般ユーザーが
 * ログインしてもこの画面に戻るだけ(APIも503で遮断済み)。 */
export function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div className={s.root}>
      <div className={s.brand}>
        <span className={s.b1}>SEVEN&nbsp;DAYS</span>
        <span className={s.b2}>DERBY</span>
      </div>
      <div className={s.card}>
        <div className={s.badge}>MAINTENANCE</div>
        <h1 className={s.title}>ただいまメンテナンス中です</h1>
        <p className={s.sub}>Seven Days Derby is under maintenance.</p>
        {message ? <p className={s.msg}>{message}</p> : null}
        <p className={s.note}>
          完了までしばらくお待ちください。皆さまの残高・馬・記録はすべて安全に保管されています。
        </p>
      </div>
      <div className={s.adminRow}>
        <GoogleLoginButton unstyled className={s.adminLink} label="管理者ログイン" />
      </div>
    </div>
  );
}
