import Link from 'next/link';
import { AccountLinking } from '@/components/AccountLinking';
import { PwaSetupTile } from '@/components/PwaSetupTile';
import { TradeAutoTile, type TradeSettings } from '@/components/TradeAutoControls';
import { avatarHue } from '@/lib/support-tree';
import s from '../app/account.module.css';

/* ============================================================================
 * /account(アカウント)— 「設定とあなたの記録のハブ」化(2026-07-12)。
 * ①プロフィール ②あなたの記録(実データの集計のみ・架空値なし)
 * ③設定(AUTO=Decision 086 / 通知=PWAタイルの再配置) ④ログイン連携 ⑤サポート。
 * データ取得層 page.tsx は依頼側で結線。
 * ========================================================================== */

export interface Me { id: string; email: string; created_at: string }
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

  return (
    <div className={s.wrap}>
      <div className={s.h1}>アカウント</div>

      {/* ① プロフィール */}
      <div className={s.profileCard}>
        <span className={s.avatar} style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 40%))` }}>
          {(emailUnset ? 'W' : me.email[0] ?? '?').toUpperCase()}
        </span>
        <div className={s.profileBody}>
          <div className={s.profileEmail}>
            {emailUnset ? <span className={s.vUnset}>(メール未設定 — ウォレットログイン)</span> : me.email}
          </div>
          <div className={s.profileMeta}>
            登録 {me.created_at.slice(0, 10)} · プレイ {days}日目
          </div>
          <div className={s.profileId}>ID {me.id}</div>
        </div>
      </div>

      {/* ② あなたの記録(実データの集計のみ) */}
      <section className={s.linking}>
        <div className={s.linkLabel}>あなたの記録 · RECORD</div>
        <div className={s.statGrid}>
          <Link href="/horses" className={`${s.statCell} ${s.stCyan}`}>
            <span className={s.statV}>{stats.racing}</span>
            <span className={s.statK}>出走中</span>
          </Link>
          <Link href="/market" className={`${s.statCell} ${s.stWarn}`}>
            <span className={s.statV}>{stats.listed}</span>
            <span className={s.statK}>出品中</span>
          </Link>
          <Link href="/horses" className={`${s.statCell} ${s.stGold}`}>
            <span className={s.statV}>{stats.champions}</span>
            <span className={s.statK}>チャンピオン</span>
          </Link>
          <Link href="/horses" className={`${s.statCell} ${s.stMag}`}>
            <span className={s.statV}>{stats.burned}</span>
            <span className={s.statK}>消滅</span>
          </Link>
          <Link href="/market" className={`${s.statCell} ${s.stCyan}`}>
            <span className={s.statV}>{stats.pendingReservations}</span>
            <span className={s.statK}>割当待ち予約</span>
          </Link>
        </div>
        <div className={s.statNote}>数字をタップすると各ページへ移動します。報酬の受け取り状況は <Link href="/champion" className={s.inlineLink}>CHAMPION</Link>、入出金の履歴は <Link href="/wallet" className={s.inlineLink}>WALLET</Link> で確認できます。</div>
      </section>

      {/* ③ 設定(AUTO + 通知) */}
      <section className={s.linking}>
        <div className={s.linkLabel}>設定 · SETTINGS</div>
        <div className={s.settingsStack}>
          {trade ? <TradeAutoTile settings={trade} /> : null}
          <PwaSetupTile />
        </div>
      </section>

      {/* ④ ログイン方法の連携(既存 AccountLinking を内包) */}
      <section className={s.linking}>
        <div className={s.linkLabel}>ログイン方法の連携 · LINKING</div>
        <div className={s.linkLead}>
          連携すると、どのログイン方法でも同じアカウント(残高・馬)にアクセスできます。
          1つのウォレットは1つのアカウントにのみ紐づけできます。
        </div>
        <div className={s.linkBody}>
          <AccountLinking userId={me.id} wallets={wallets.map((w) => w.wallet_address)} />
        </div>
      </section>

      {/* ⑤ サポート導線 */}
      <section className={s.linking}>
        <div className={s.linkLabel}>サポート · SUPPORT</div>
        <div className={s.linkLead}>
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
