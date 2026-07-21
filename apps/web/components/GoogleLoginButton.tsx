'use client';

import { useState, type ReactNode } from 'react';
import { siteOrigin, supabaseBrowser } from '@/lib/client-api';
import s from './google-login.module.css';
import { ErrorLine } from '@/components/ui/ErrorLine';

/**
 * Googleログイン開始ボタン(Decision 083: ログインはGoogle一本化・/login廃止)。
 * 既定は公式スタイル準拠の黒ボタン(カラーGロゴ+ラベル)。`unstyled` を渡すと
 * 見た目は呼び出し側のclassNameに委ね、クリック動作だけを提供する(ヒーロー等
 * デザイン変更禁止の箇所用)。成功時はGoogleへリダイレクトするので戻ってこない。
 */
export function GoogleLoginButton({
  label = 'Google でログイン',
  size = 'md',
  unstyled = false,
  className,
  children,
}: {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  unstyled?: boolean;
  className?: string | undefined;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const { error: authError } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteOrigin()}/auth/callback` },
    });
    // 成功時はここに戻らない(Googleへ遷移)。失敗だけ通知して復帰。
    if (authError) {
      setBusy(false);
      // UI基盤 3-3: 旧 window.alert()。OSダイアログはページの文脈から切り離され、
      // 読み上げにも履歴にも残らない。ボタンの直下に出して再試行できるようにする。
      setError(authError.message);
    }
  }

  if (unstyled) {
    return (
      <>
        <button type="button" className={className} onClick={() => void start()} disabled={busy}>
          {children ?? label}
        </button>
        {error ? <ErrorLine className={s.gerr} inline>{error}</ErrorLine> : null}
      </>
    );
  }
  return (
    <>
    <button
      type="button"
      className={`${s.gbtn} ${size === 'sm' ? s.sm : size === 'lg' ? s.lg : ''} ${className ?? ''}`}
      onClick={() => void start()}
      disabled={busy}
    >
      <svg className={s.glogo} viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      <span className={s.glabel}>{label}</span>
    </button>
    {error ? <ErrorLine className={s.gerr} inline>{error}</ErrorLine> : null}
    </>
  );
}
