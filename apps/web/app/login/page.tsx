import type { Metadata } from 'next';
import { EmailLoginForm } from '@/components/EmailLoginForm';
import { GoogleLoginButton } from '@/components/GoogleLoginButton';

export const metadata: Metadata = {
  title: 'ログイン — Seven Days Derby',
  robots: { index: false, follow: false },
};

/**
 * /login — メール＋パスワードのログイン(Google一本化の代替経路・2026-07-26)。
 * サイトの Google OAuth が停止した際の入口。Google が復旧したら併存で可(下にボタンも置く)。
 * アカウントは Supabase 側で作成済みのものだけ(自己サインアップ無し)。
 */
export default function LoginPage(): React.JSX.Element {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '32px 16px' }}>
      <h1 style={{ fontFamily: 'var(--font-display, sans-serif)', letterSpacing: '0.06em', margin: 0, textAlign: 'center' }}>ログイン</h1>
      <EmailLoginForm />
      <div style={{ fontSize: 12, color: 'var(--muted, #8f8ac2)', textAlign: 'center', maxWidth: 360 }}>
        メールとパスワードが分からない場合は運営にお問い合わせください。
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', width: 'min(360px, 90%)', paddingTop: 18, display: 'flex', justifyContent: 'center' }}>
        <GoogleLoginButton size="sm" label="Google でログイン" />
      </div>
    </div>
  );
}
