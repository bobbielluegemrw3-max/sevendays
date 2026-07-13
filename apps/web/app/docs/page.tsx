import type { Metadata } from 'next';
import Link from 'next/link';
import s from './docs.module.css';

export const metadata: Metadata = {
  title: 'Documentation | Seven Days Derby',
  description:
    'Official documentation for Seven Days Derby: how player funds are handled, how race outcomes are made verifiable, and what risks players should understand.',
};

export default function DocsOverviewPage() {
  return (
    <>
      <p className={s.eyebrow}>Documentation</p>
      <h1>Seven Days Derby Documentation</h1>
      <p className={s.lede}>
        Seven Days Derby is an online horse-racing survival game. Players acquire digital
        racehorses, train them, and race every night at 20:00 (MYT). A horse that survives seven
        consecutive nights becomes a Champion. This documentation explains, in plain language, how
        the platform actually works.
      </p>

      <p>
        These pages describe <strong>facts about the system as it is built</strong> — how money
        moves, how race results are computed, and what can be independently verified. They are
        written for players, partners, and anyone evaluating the platform.
      </p>

      <div className={s.cards}>
        <Link href="/docs/funds" className={s.card}>
          <p className={s.cardTitle}>How Funds Are Handled</p>
          <p className={s.cardDesc}>
            Deposits, withdrawals, the internal ledger, and what the operator never does with
            player funds.
          </p>
        </Link>
        <Link href="/docs/fairness" className={s.card}>
          <p className={s.cardTitle}>Fairness &amp; Determinism</p>
          <p className={s.cardDesc}>
            Every race outcome is deterministic, pre-committed, and verifiable by anyone after the
            race.
          </p>
        </Link>
        <Link href="/docs/risk" className={s.card}>
          <p className={s.cardTitle}>Risk Disclosure</p>
          <p className={s.cardDesc}>
            What players can lose, how elimination works, and the digital-asset risks that apply.
          </p>
        </Link>
        <Link href="/ledger" className={s.card}>
          <p className={s.cardTitle}>Transparency Ledger ↗</p>
          <p className={s.cardDesc}>
            Live, real platform data — published inside the app with CSV export.
          </p>
        </Link>
      </div>

      <h2>The design in one paragraph</h2>
      <p>
        Seven Days Derby runs on a <strong>double-entry internal ledger</strong>: player balances
        are book entries, trades between players settle as book entries, and USDT moves on-chain
        only when a player deposits or withdraws. Race outcomes are computed by a{' '}
        <strong>deterministic engine</strong> from a seed that is cryptographically committed
        before the race and revealed after it — the operator has no way to steer a result, and
        anyone can re-verify one. Player funds are never invested, lent, or staked, and balances
        earn no interest.
      </p>

      <p className={s.footerMeta}>LAST UPDATED · JULY 13, 2026</p>
    </>
  );
}
