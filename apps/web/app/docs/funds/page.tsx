import type { Metadata } from 'next';
import Link from 'next/link';
import s from '../docs.module.css';

export const metadata: Metadata = {
  title: 'How Funds Are Handled',
  description:
    'How Seven Days Derby holds player balances: USDT deposits, full withdrawability, book-entry settlement, and what the operator never does with player funds.',
};

/**
 * 事実の開示のみ(Decision 091)。数値は本体UIで公開済みのものに限る:
 * ミント102=100+2 / 出品成約は98%受取(手数料2%) / 出金は実費ネットワーク手数料 /
 * 1,000 USDT以上は管理者審査 / 1頭あたり最大177.16ロック。
 */
export default function FundsPage() {
  return (
    <>
      <p className={s.eyebrow}>Documentation / Funds</p>
      <h1>How Funds Are Handled</h1>
      <p className={s.lede}>
        Seven Days Derby uses a simple custody model: USDT comes in when you deposit, sits as a
        balance on an auditable internal ledger while you play, and goes out on-chain when you
        withdraw. This page describes exactly what happens at each step — and what never happens.
      </p>

      <h2>Deposits</h2>
      <p>
        Each player is issued a <strong>dedicated deposit address</strong>. You deposit{' '}
        <span className={s.figure}>USDT on the Polygon network</span> to that address; after
        on-chain confirmations, the same amount is credited to your in-game balance. Nothing is
        converted — your balance is denominated in USDT, one for one.
      </p>

      <h2>Your balance is withdrawable — in full</h2>
      <p>
        Your available balance can be withdrawn <strong>at any time, in full</strong>, to a wallet
        address you specify. If you deposit 100 USDT and buy nothing, you can withdraw 100 USDT.
        There is no lock-up period, no minimum holding time, and no exit penalty.
      </p>
      <ul>
        <li>
          Funds are only ever locked while <strong>you</strong> commit them — for example, a
          purchase reservation locks up to{' '}
          <span className={s.figure}>177.16 USDT per horse</span> until it settles, and any
          difference is automatically refunded.
        </li>
        <li>
          The withdrawal deducts the <strong>actual network fee</strong> (gas) — passed through at
          cost, with no markup. The operator does not earn revenue on withdrawals.
        </li>
        <li>
          Withdrawals of <span className={s.figure}>1,000 USDT or more</span> undergo a manual
          review by administrators before broadcast. This is a security control against account
          takeover, not a discretionary gate on your funds.
        </li>
      </ul>

      <h2>What the operator never does with player funds</h2>
      <ul>
        <li>
          Player funds are <strong>never invested, lent, staked, or otherwise deployed</strong>.
          They are held to be paid back out.
        </li>
        <li>
          Balances earn <strong>no interest and no yield</strong>. A balance of 100 USDT stays 100
          USDT.
        </li>
        <li>
          There is <strong>no currency exchange</strong>. USDT is the only currency: USDT in, USDT
          out.
        </li>
        <li>
          Your USDT leaves the platform <strong>only through your own withdrawal request</strong>.
        </li>
      </ul>

      <h2>Trades settle as book entries</h2>
      <p>
        When horses change hands between players, no on-chain transfer happens per trade. Instead,
        the trade settles on the platform&apos;s <strong>double-entry internal ledger</strong>:
        the buyer&apos;s balance goes down, the seller&apos;s goes up, atomically. On-chain
        movement is reserved for the two boundary events — deposit and withdrawal.
      </p>
      <p>
        This is why trading is instant and free of gas costs. The seller pays a{' '}
        <span className={s.figure}>2% marketplace fee</span> on a completed sale (the seller
        receives 98% of the sale price); a newly minted Day 0 horse is charged{' '}
        <span className={s.figure}>102 USDT</span> (price 100 + fee 2). All fees are shown before
        you act.
      </p>

      <h2>The ledger is double-entry and immutable</h2>
      <p>
        Every movement of value — deposits, locks, purchases, prizes, fees, withdrawals — is a
        posted transaction on a double-entry ledger. Posted entries{' '}
        <strong>cannot be edited or deleted</strong>; the database itself enforces this, along
        with balance consistency (debits always equal credits) and a ban on negative player
        balances.
      </p>
      <div className={s.callout}>
        Aggregate platform data is published live on the{' '}
        <Link href="/ledger">Transparency Ledger</Link>, including CSV export — real figures from
        the same ledger described above.
      </div>

      <p className={s.footerMeta}>LAST UPDATED · JULY 13, 2026</p>
    </>
  );
}
