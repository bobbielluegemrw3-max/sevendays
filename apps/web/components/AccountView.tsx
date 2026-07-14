import Link from 'next/link';
import { AccountLinking } from '@/components/AccountLinking';
import { PwaSetupTile } from '@/components/PwaSetupTile';
import { StableNameForm } from '@/components/StableNameForm';
import { TradeAutoTile, type TradeSettings } from '@/components/TradeAutoControls';
import { avatarHue } from '@/lib/support-tree';
import { localDate } from '@/lib/format-time';
import s from '../app/account.module.css';

/* ============================================================================
 * /account(アカウント)— 「設定とあなたの記録のハブ」リデザイン v2(2026-07-12)。
 * 情報設計: ①アイデンティティ帯 ②あなたの記録＋設定(PC 2カラム)
 *           ③ログイン連携(素の table/button を account.module.css の :global() で意匠化)
 *           ④サポート導線。
 * 表示は Me / Wallet / AccountStats の実データのみ(架空値なし)。
 * データ取得層 page.tsx・AccountLinking・TradeAutoTile・PwaSetupTile は変更しない。
 * ========================================================================== */

export interface Me { id: string; email: string; created_at: string; stable_name?: string | null }
export interface Wallet { wallet_address: string; created_at: string }
export interface AccountStats {
  racing: number;      // 出走中(手動出品中を除くACTIVE)
  listed: number;      // 手動出品中
  champions: number;   // DAY7_CLEARED + MEMORIALIZED
  burned: number;      // BURNED
  pendingReservations: number; // 割当待ちの購入予約
}

export function AccountView({
  me,
  wallets,
  stats,
  trade,
}: {
  me: Me;
  wallets: Wallet[];
  stats: AccountStats;
  trade: TradeSettings | null;
}) {
  // ウォレットログインのみのユーザーは合成メール(@user.sevendays)を持つ → 未設定扱い
  const emailUnset = me.email.endsWith('@user.sevendays');
  const days = Math.max(1, Math.floor((Date.now() - new Date(me.created_at).getTime()) / 86400000) + 1);
  const hue = avatarHue(me.email);

  const cells: Array<{ v: number; k: string; cls: string; glyph: string; href: string }> = [
    { v: stats.racing, k: '出走中', cls: s.stCyan!, glyph: '◈', href: '/horses' },
    { v: stats.listed, k: '出品中', cls: s.stWarn!, glyph: '↗', href: '/market' },
    { v: stats.champions, k: 'チャンピオン', cls: s.stGold!, glyph: '◆', href: '/horses' },
    { v: stats.burned, k: '消滅', cls: s.stMag!, glyph: '✕', href: '/horses' },
    { v: stats.pendingReservations, k: '割当待ち予約', cls: s.stCyan!, glyph: '⟳', href: '/market' },
  ];

  return (
    <div className={s.wrap}>
      <div className={s.h1}>アカウント</div>

      {/* ① アイデンティティ帯 */}
      <div className={s.profileCard}>
        <span
          className={s.avatar}
          style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 40%))` }}
        >
          {(emailUnset ? 'W' : me.email[0] ?? '?').toUpperCase()}
        </span>
        <div className={s.profileBody}>
          <div className={s.profileEmail}>
            {emailUnset ? <span className={s.vUnset}>(メール未設定 — ウォレットログイン)</span> : me.email}
          </div>
          {/* 厩舎名(Decision 097): 公開アイデンティティ */}
          <StableNameForm current={me.stable_name ?? null} />
          <div className={s.profileMeta}>
            <span>登録 {localDate(me.created_at)}</span>
            <span className={s.dayPill}>プレイ {days}日目</span>
          </div>
          <div className={s.profileId}>ID {me.id}</div>
        </div>
      </div>

      {/* ② あなたの記録 ＋ 設定(PC 2カラム) */}
      <div className={s.recordGrid}>
        <section className={`${s.sec} ${s.cy}`}>
          <div className={s.secLabel}>あなたの記録 <span className={s.en}>· RECORD</span></div>
          <div className={s.statGrid}>
            {cells.map((c) => (
              <Link key={c.k} href={c.href} className={`${s.statCell} ${c.cls}`}>
                <span className={s.statGlyph}>{c.glyph}</span>
                <span className={s.statV}>{c.v}</span>
                <span className={s.statK}>{c.k}</span>
              </Link>
            ))}
          </div>
          <div className={s.statNote}>
            数字をタップすると各ページへ移動します。報酬の受け取り状況は{' '}
            <Link href="/champion" className={s.inlineLink}>CHAMPION</Link>、入出金の履歴は{' '}
            <Link href="/wallet" className={s.inlineLink}>WALLET</Link> で確認できます。
          </div>
        </section>

        <section className={s.sec}>
          <div className={s.secLabel}>設定 <span className={s.en}>· SETTINGS</span></div>
          <div className={s.settingsStack}>
            {trade ? <TradeAutoTile settings={trade} /> : null}
            <PwaSetupTile />
          </div>
        </section>
      </div>

      {/* ③ ログイン方法の連携(既存 AccountLinking を内包 → CSSの :global() で意匠化) */}
      <section className={s.sec}>
        <div className={s.secLabel}>ログイン方法の連携 <span className={s.en}>· LINKING</span></div>
        <div className={s.lead}>
          連携すると、どのログイン方法でも同じアカウント(残高・馬)にアクセスできます。
          1つのウォレットは1つのアカウントにのみ紐づけできます。
        </div>
        <div className={s.linkBody}>
          <AccountLinking userId={me.id} wallets={wallets.map((w) => w.wallet_address)} />
        </div>
      </section>

      {/* ④ サポート導線 */}
      <section className={s.sec}>
        <div className={s.secLabel}>サポート <span className={s.en}>· SUPPORT</span></div>
        <div className={s.lead}>
          ゲームのルール・アカウント・入出金など、お困りのことがあればお気軽にご連絡ください。
          ご登録のメールアドレスへ返信します。
        </div>
        <div className={s.supportRow}>
          <Link href="/guide" className={s.supportGhost}>使い方を見る →</Link>
          <Link href="/contact" className={s.supportBtn}>お問い合わせフォームへ →</Link>
        </div>
      </section>
    </div>
  );
}
