import Link from 'next/link';
import { AccountLinking } from '@/components/AccountLinking';
import s from '../app/account.module.css';

/* ============================================================================
 * /account(アカウント)再設計 — ダッシュボード Option 1c と同じ部品言語。
 * 純粋な表示コンポーネント。プロフィール + ログイン連携(既存 AccountLinking を内包)。
 * データ取得層 page.tsx は依頼側で結線。表示は Me / Wallet の値のみ(架空値なし)。
 * ========================================================================== */

export interface Me { id: string; email: string; created_at: string }
export interface Wallet { wallet_address: string; created_at: string }

export function AccountView({ me, wallets }: { me: Me; wallets: Wallet[] }) {
  // ウォレットログインのみのユーザーは合成メール(@user.sevendays)を持つ → 未設定扱い
  const emailUnset = me.email.endsWith('@user.sevendays');

  return (
    <div className={s.wrap}>
      <div className={s.h1}>アカウント</div>

      {/* プロフィール */}
      <div className={s.profile}>
        <div className={s.row}>
          <span className={s.k}>ユーザーID</span>
          <span className={s.v}>{me.id}</span>
        </div>
        <div className={s.row}>
          <span className={s.k}>メール</span>
          {emailUnset
            ? <span className={s.vUnset}>(未設定 — ウォレットログイン)</span>
            : <span className={s.vEmail}>{me.email}</span>}
        </div>
        <div className={s.row}>
          <span className={s.k}>登録日</span>
          <span className={s.v}>{me.created_at.slice(0, 10)}</span>
        </div>
      </div>

      {/* ログイン方法の連携(既存 AccountLinking を内包) */}
      <section className={s.linking}>
        <div className={s.linkLabel}>ログイン方法の連携 · LINKING</div>
        <div className={s.linkLead}>
          連携すると、どのログイン方法でも同じアカウント（残高・馬）にアクセスできます。
          1つのウォレットは1つのアカウントにのみ紐づけできます。
        </div>
        <div className={s.linkBody}>
          <AccountLinking userId={me.id} wallets={wallets.map((w) => w.wallet_address)} />
        </div>
      </section>

      {/* サポート導線(2026-07-09) */}
      <section className={s.linking}>
        <div className={s.linkLabel}>サポート · SUPPORT</div>
        <div className={s.linkLead}>
          ゲームのルール・アカウント・入出金など、お困りのことがあればお気軽にご連絡ください。
          ご登録のメールアドレスへ返信します。
        </div>
        <div className={s.linkBody}>
          <Link href="/contact" className={s.supportBtn}>お問い合わせフォームへ →</Link>
        </div>
      </section>
    </div>
  );
}
