import { WalletHistory, type HistoryEntry } from '@/components/WalletHistory';
import { WithdrawForm } from '@/components/WithdrawForm';
import { OnrampGuide } from '@/components/OnrampGuide';
import { TotalAssetsCard } from '@/components/TotalAssetsCard';
import { Stat } from '@/components/ui/Stat';
import type { JSX } from 'react';
import type { AppDict } from '@/lib/i18n';
import { fill } from '@/lib/i18n-shared';
import s from '../app/wallet.module.css';

/** テンプレの {v} の位置に太字の語を差し込む(語順の言語差を吸収)。
 *  馬詳細の boldV と同じ考え方 — 強調する語だけを言語側に決めさせる。 */
function boldPart(tpl: string, value: string, cls?: string): JSX.Element {
  const [head, tail] = tpl.split('{v}');
  return (
    <>
      {head}
      <b className={cls ?? ''}>{value}</b>
      {tail}
    </>
  );
}

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
  wallet, deposit, history, stableValue, uncollected = 0, assetsCopy, t,
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
  /** /wallet 固有の文言(2026-07-22 i18n化)。 */
  t: AppDict['walletPage'];
}) {
  const hasLocked = Number(wallet.locked) > 0;

  return (
    <div className={s.wrap}>
      <div className={s.h1}>{t.h1}</div>

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
          <Stat label={t.bal_avail_k} value={Number(wallet.available)} unit="USDT" digits={2} group size="lg" tone="cyan" />
          <div className={s.balNote}>{t.bal_avail_note}</div>
        </div>
        <div className={s.balLocked}>
          <Stat label={t.bal_locked_k} value={Number(wallet.locked)} unit="USDT" digits={2} group size="lg" />
          <div className={s.balNote}>{hasLocked ? t.bal_locked_on : t.bal_locked_off}</div>
        </div>
      </div>

      {/* 入金 */}
      <section className={s.card}>
        <div className={s.cardHead}>
          <span className={s.cardLabel}>{t.dep_label}</span>
          {deposit ? <span className={s.chip}>{deposit.chain_id} · {deposit.asset}</span> : null}
        </div>
        {deposit ? (
          <>
            <div className={s.depLead}>{t.dep_lead}</div>
            <div className={s.addrBox}>
              <span className={s.addr}>{deposit.address}</span>
              <a href={`https://polygonscan.com/address/${deposit.address}`} target="_blank" rel="noreferrer" className={s.copy}>{t.dep_check}</a>
            </div>
            {/* 誤送金は資産の喪失に直結する。語順が言語ごとに違うので、
                太字にする語をテンプレの {v} で受けて言語側に決めさせる */}
            <div className={s.warn}>
              <span className={s.warnIcon}>⚠</span>
              <span className={s.warnText}>
                {boldPart(t.dep_confirm_tpl, fill(t.dep_confirm_blocks_tpl, { n: deposit.confirmations_required }))}
                {' '}
                {boldPart(t.dep_lost_tpl, t.dep_lost_word, s.bad)}
              </span>
            </div>
          </>
        ) : (
          <div className={s.depLead}>{t.dep_preparing}</div>
        )}
      </section>

      {/* USDT入手ガイド(上の入金アドレスへ送る USDT の入手先)。入金アドレスがある時に表示 */}
      {deposit ? <OnrampGuide address={deposit.address} t={t} /> : null}

      {/* 出金(既存 WithdrawForm を内包) */}
      <section className={s.withdraw}>
        <div className={s.withdrawLabel}>{t.wd_label}</div>
        <div className={s.withdrawForm}><WithdrawForm t={t} /></div>
      </section>

      {/* 履歴 */}
      <div>
        <div className={s.histHead}>
          <span className={s.cardLabel}>{t.hist_label}</span>
          <span className={s.histCount}>{history.length}</span>
        </div>
        <WalletHistory entries={history} t={t} />
      </div>
    </div>
  );
}
