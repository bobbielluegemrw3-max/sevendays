import Link from 'next/link';
import { LoginForm } from '@/components/LoginForm';
import s from './login.module.css';

export default function LoginPage() {
  return (
    <div className={s.wrap}>
      <Link href="/" className={s.brand} aria-label="Seven Days Derby">
        <span className={s.bar} />
        <span className={s.lock}>
          <span className={s.l1}>SEVEN&nbsp;DAYS</span>
          <span className={s.l2}>DERBY</span>
        </span>
      </Link>

      <div className={s.box}>
        <div className={s.inner}>
          <h1 className={s.title}>ログイン / はじめる</h1>
          <p className={s.sub}>ウォレット・Google・メールアドレスで、今夜のダービーへ。</p>
          <LoginForm />
        </div>
      </div>

      <Link href="/" className={s.back}>
        ← トップへ戻る
      </Link>
    </div>
  );
}
