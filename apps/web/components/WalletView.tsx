import { WalletHistory, type HistoryEntry } from '@/components/WalletHistory';
import { WithdrawForm } from '@/components/WithdrawForm';
import { OnrampGuide } from '@/components/OnrampGuide';
import { TotalAssetsCard } from '@/components/TotalAssetsCard';
import { Stat } from '@/components/ui/Stat';
import type { AppDict } from '@/lib/i18n';
import s from '../app/wallet.module.css';

/* ============================================================================
 * /wallet(ウォレット)再設計 — ダッシュボード Option 1c と同じ部品言語。
 * 純粋な表示コンポーネント。残高・入金アドレス・USDT入手ガイド・出金・履歴。
 * 履歴一覧は client の <WalletHistory> に委譲。データ取得層 page.tsx は依頼側で結線。
 * 表示数値は各 API の値のみ(架空値なし)。
 *
 * OnrampGuide(USDT入手ガイド)は入金アドレスがある時に常時表示(オーナー判断
 * 2026-07-15: テスターは信頼できる少人数のため誤送金の懸念なし)。
 * ========================================================================== */

export interface Wallet { available: string; locked: string }
export interface DepositInfo { address: string; chain_id: string; asset: string; confirmations_required: number }

export function WalletView({
  wallet, deposit, history, stableValue, uncollected = 0, assetsCopy,
}: {
  wallet: Wallet;
  deposit: DepositInfo | null;
  history: HistoryEntry[];
  /** 現役馬の評価額合計(公開価格テーブル基準)。総資産カード用。 */
  stableValue: number;
  /** 未回収(利確待ち)の上昇分 — A2(FUN_V2_PLAN §3)。 */
  uncollected?: number;
  /** 総資産カードの文言(dashセクション共用)。 */
  assetsCopy: AppDict['dash'];
}) {
  const hasLocked = Number(wallet.locked) > 0;

  return (
    <div className={s.wrap}>
      <div className={s.h1}>ウォレット</div>

      {/* 総資産(残高+評価額+ロック) — 「増えたか減ったか」への一目回答 */}
      <TotalAssetsCard
        available={wallet.available}
        locked={wallet.locked}
        stableValue={stableValue}
        uncollected={uncollected}
        t={assetsCopy}
      />

      {/* 残高(2026-07-21・1-1: Stat 部品へ。値が変わると登る) */}
      <div className={s.balances}>
        <div className={s.balAvail}>
          <Stat label="利用可能 · AVAILABLE" value={Number(wallet.available)} unit="USDT" digits={2} group size="lg" tone="cyan" />
          <div className={s.balNote}>出金・馬の購入に使えます</div>
        </div>
        <div className={s.balLocked}>
          <Stat label="ロック中 · LOCKED" value={Number(wallet.locked)} unit="USDT" digits={2} group size="lg" />
          <div className={s.balNote}>{hasLocked ? '購入・チャンピオン報酬で一時的に確保中' : 'ロック中の資金はありません'}</div>
        </div>
      </div>

      {/* 入金 */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <span className={s.cardLabel}>入金 · DEPOSIT</span>
          {deposit ? <span className={s.chip}>{deposit.chain_id} · {deposit.asset}</span> : null}
        </div>
        {deposit ? (
          <>
            <div className={s.depLead}>あなた専用の入金アドレス:</div>
            <div className={s.addrBox}>
              <span className={s.addr}>{deposit.address}</span>
              <a href={`https://polygonscan.com/address/${deposit.address}`} target="_blank" rel="noreferrer" className={s.copy}>確認</a>
            </div>
            <div className={s.warn}>
              <span className={s.warnIcon}>⚠</span>
              <span className={s.warnText}>
                <b>{deposit.confirmations_required}ブロック確認後</b>に残高へ反映されます。
                USDT以外・他チェーンからの送金は<b className={s.bad ?? ''}>失われます</b>。
              </span>
            </div>
          </>
        ) : (
          <div className={s.depLead}>入金アドレスを準備中です。しばらくしてから再度お試しください。</div>
        )}
      </section>

      {/* USDT入手ガイド(上の入金アドレスへ送る USDT の入手先)。入金アドレスがある時に表示 */}
      {deposit ? <OnrampGuide address={deposit.address} /> : null}

      {/* 出金(既存 WithdrawForm を内包) */}
      <section className={s.withdraw}>
        <div className={s.withdrawLabel}>出金 · WITHDRAW</div>
        <div className={s.withdrawForm}><WithdrawForm /></div>
      </section>

      {/* 履歴 */}
      <div>
        <div className={s.histHead}>
          <span className={s.cardLabel}>履歴 · HISTORY</span>
          <span className={s.histCount}>{history.length}</span>
        </div>
        <WalletHistory entries={history} />
      </div>
    </div>
  );
}
