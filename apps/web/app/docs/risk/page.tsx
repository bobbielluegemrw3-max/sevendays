import type { Metadata } from 'next';
import s from '../docs.module.css';

export const metadata: Metadata = {
  title: 'Risk Disclosure',
  description:
    'What players of Seven Days Derby can lose, how elimination works, and the digital-asset risks that apply to deposits and withdrawals.',
};

export default function RiskPage() {
  return (
    <>
      <p className={s.eyebrow}>Documentation / Risk</p>
      <h1>Risk Disclosure</h1>
      <p className={s.lede}>
        Seven Days Derby is an entertainment product. Horses can be eliminated, and money spent on
        a horse can be lost. This page states the risks plainly, so that every player decides with
        the same facts.
      </p>

      <h2>You can lose what you spend on a horse</h2>
      <ul>
        <li>
          Every night, some horses are <strong>eliminated (BURN)</strong> under the published
          deterministic rules. An eliminated horse is permanently retired — its purchase value is
          not returned.
        </li>
        <li>
          A horse&apos;s value follows a published day-by-day price table; nothing guarantees that
          a horse survives long enough to recover what you paid for it.
        </li>
        <li>
          <strong>Do not spend more than you can afford to lose.</strong> The appropriate mindset
          is the cost of entertainment, not an investment outlay.
        </li>
      </ul>

      <h2>No promised returns</h2>
      <ul>
        <li>
          The platform makes <strong>no promise of profit</strong> and pays no interest or yield on
          balances. Champion rewards and sale proceeds depend entirely on how your horses fare
          under the published rules.
        </li>
        <li>
          Past results do not predict future outcomes. Nightly conditions (weather, track,
          surface) change, and every horse faces elimination risk every night it races.
        </li>
        <li>
          Nothing on this site is financial, investment, or legal advice.
        </li>
      </ul>

      <h2>Digital-asset risks</h2>
      <ul>
        <li>
          The platform uses <strong>USDT on the Polygon network</strong>. Sending funds on the
          wrong network, or to a mistyped address, can make them{' '}
          <strong>permanently unrecoverable</strong>. Always verify the network and address before
          sending.
        </li>
        <li>
          USDT is a third-party stablecoin; its value and redeemability depend on its issuer, not
          on Seven Days Derby.
        </li>
        <li>
          On-chain transactions incur network fees and confirmation delays that are outside the
          platform&apos;s control.
        </li>
      </ul>

      <h2>Account security</h2>
      <ul>
        <li>
          Sign-in is via Google. Anyone who controls your Google account controls your Seven Days
          Derby account and its balance — protect it with strong credentials and two-factor
          authentication.
        </li>
        <li>
          Withdrawals of 1,000 USDT or more are manually reviewed by administrators as a safeguard
          against account takeover.
        </li>
      </ul>

      <h2>Service availability</h2>
      <ul>
        <li>
          The nightly settlement runs at a fixed time (20:00 MYT). Maintenance, network incidents,
          or third-party outages may delay features such as deposits, withdrawals, or the live
          broadcast; recovery procedures are designed so that no posted balance or result is ever
          altered.
        </li>
      </ul>

      <p className={s.footerMeta}>LAST UPDATED · JULY 13, 2026</p>
    </>
  );
}
