import { WalletHistory, type HistoryEntry } from '@/components/WalletHistory';
import { WithdrawForm } from '@/components/WithdrawForm';
import { OnrampGuide } from '@/components/OnrampGuide';
import s from '../app/wallet.module.css';

/* ============================================================================
 * /wallet(ウォレット)再設計 — ダッシュボード Option 1c と同じ部品言語。
 * 純粋な表示コンポーネント。残高・入金アドレス・USDT入手ガイド・出金・履歴。
 * 履歴一覧は client の <WalletHistory> に委譲。データ取得層 page.tsx は依頼側で結線。
 * 表示数値は各 API の値のみ(架空値なし)。
 *
 * OnrampGuide(USDT入手ガイド)の表示ゲート:
 *   env `ONRAMP_ENABLED` を page.tsx(動的サーバー)で読み onrampEnabled prop で受ける。
 *   true のときだけ入金アドレス直下に出す。deposit.chain_id は DEFAULT_CHAIN 定数なので
 *   常に 'POLYGON_POS' を返し testnet/mainnet を判別できないため、明示フラグで制御する。
 *   ※ env はビルド時インライン化を避けるため page.tsx でブラケット記法で実行時読取。
 * ========================================================================== */

export interface Wallet { available: string; locked: string }
export interface DepositInfo { address: string; chain_id: string; asset: string; confirmations_required: number }

function money(v: string): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function WalletView({
  wallet, deposit, history, onrampEnabled = false,
}: { wallet: Wallet; deposit: DepositInfo | null; history: HistoryEntry[]; onrampEnabled?: boolean }) {
  const hasLocked = Number(wallet.locked) > 0;

  return (
    <div className={s.wrap}>
      <div className={s.h1}>ウォレット</div>

      {/* 残高 */}
      <div className={s.balances}>
        <div className={s.balAvail}>
          <div className={s.balK}>利用可能 · AVAILABLE</div>
          <div className={s.balV}>{money(wallet.available)}<small>USDT</small></div>
          <div className={s.balNote}>出金・馬の購入に使えます</div>
        </div>
        <div className={s.balLocked}>
          <div className={s.balK}>ロック中 · LOCKED</div>
          <div className={s.balV}>{money(wallet.locked)}<small>USDT</small></div>
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

      {/* USDT入手ガイド(上の入金アドレスへ送る USDT の入手先)。
          env ゲート ON かつ 入金アドレスがある時だけ表示 */}
      {onrampEnabled && deposit ? <OnrampGuide address={deposit.address} /> : null}

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
