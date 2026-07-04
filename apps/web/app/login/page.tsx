import Link from 'next/link';
import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      <Link href="/" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.14em', color: 'var(--gold)' }}>
        SEVEN&nbsp;DAYS&nbsp;DERBY
      </Link>
      <h1 style={{ marginTop: '1.2rem' }}>ようこそ</h1>
      <p className="muted" style={{ fontSize: '0.9rem', marginTop: '-0.2rem' }}>
        MetaMask / Google でログインして、今夜のダービーへ。
      </p>
      <div className="panel" style={{ textAlign: 'left', marginTop: '1.2rem' }}>
        <LoginForm />
      </div>
    </div>
  );
}
