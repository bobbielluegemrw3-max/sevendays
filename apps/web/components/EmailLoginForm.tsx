'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/client-api';
import { Button } from '@/components/ui/Button';
import { ErrorLine } from '@/components/ui/ErrorLine';

/**
 * メール＋パスワードのログイン(Google一本化の代替経路・2026-07-26)。
 * ★背景: サイトの Google OAuth が(オーナーのGoogleアカウント凍結で)停止した際の
 *   ログイン手段。LOGINのみ(自己サインアップ無し)=Supabaseで作成済みのアカウント
 *   だけが入れる=攻撃面は最小。Google復旧後も併存で構わない。
 * セッションは Supabase SSR の標準Cookieに入る(browser clientが書く→サーバが読む)ため
 * OAuthのcallbackは不要。成功時はフル遷移でSSRにセッションを拾わせる。
 */
export function EmailLoginForm(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: authError } = await supabaseBrowser().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      setBusy(false);
      setError(authError.message);
      return;
    }
    // 成功: 標準Cookieにセッションが入っている。フル遷移でSSRに拾わせる。
    window.location.assign('/dashboard');
  }

  return (
    <form className="stack" onSubmit={(e) => void submit(e)} style={{ maxWidth: 360, margin: '0 auto' }}>
      <label>
        メールアドレス
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label>
        パスワード
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Button variant="primary" type="submit" busy={busy} busyLabel="ログイン中…" sound="confirm">
        ログイン
      </Button>
    </form>
  );
}
