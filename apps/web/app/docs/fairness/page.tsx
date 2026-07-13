import type { Metadata } from 'next';
import Link from 'next/link';
import s from '../docs.module.css';

export const metadata: Metadata = {
  title: 'Fairness & Determinism',
  description:
    'Race outcomes in Seven Days Derby are deterministic, cryptographically pre-committed, and independently verifiable after every race.',
};

export default function FairnessPage() {
  return (
    <>
      <p className={s.eyebrow}>Documentation / Fairness</p>
      <h1>Fairness &amp; Determinism</h1>
      <p className={s.lede}>
        Every race result in Seven Days Derby is computed by a deterministic engine from inputs
        that are fixed — and cryptographically committed — before the race begins. The operator
        cannot steer an outcome, and anyone can re-verify one after the fact.
      </p>

      <h2>Deterministic outcomes</h2>
      <p>
        The race engine is a pure function: the same inputs always produce the same results,
        bit-for-bit. All in-race variation derives from a nightly <strong>race seed</strong>{' '}
        through SHA-256 hashing — there is no live randomness, no dice roll at race time, and no
        human in the loop when results are computed. Weather, track condition, scores, rankings,
        and eliminations all come from the same seeded computation.
      </p>
      <p>
        No machine-learning model or language model participates in any outcome. Where the product
        says &quot;engine&quot; or &quot;system&quot;, it means published, deterministic rules.
      </p>

      <h2>Commit–reveal: the seed is locked before the race</h2>
      <p>Each night follows the same sequence:</p>
      <ul>
        <li>
          <strong>Commit.</strong> Before the race, the platform publishes a SHA-256 commitment
          (hash) of the race seed. At this point the seed — and therefore every result — is fixed.
        </li>
        <li>
          <strong>Race.</strong> Results are computed from that seed and recorded.
        </li>
        <li>
          <strong>Reveal.</strong> After the race, the seed itself is published. Anyone can hash
          the revealed seed and confirm it matches the prior commitment.
        </li>
      </ul>
      <p>
        Each race page includes a <strong>verification panel</strong> showing the commitment, the
        revealed seed, and the check between them. If the platform ever altered a seed after the
        commit, the hashes would not match — publicly and permanently.
      </p>

      <h2>Results are frozen</h2>
      <p>
        Race results, eliminations, and the ledger entries they produce are{' '}
        <strong>immutable once posted</strong> — enforced by the database, not by policy. An
        eliminated horse can never be quietly restored; a posted payout can never be quietly
        edited.
      </p>

      <h2>Everyone is in the same queue</h2>
      <p>
        Purchases and trades settle in a single nightly first-come queue under published rules.
        There is no way to hand-pick a specific listed horse, and no priority lane — the queue
        order is deterministic and applies to every participant equally, including the operator.
      </p>

      <div className={s.callout}>
        The aggregate outcome of every night — entries, eliminations, payouts, fees — is published
        on the <Link href="/ledger">Transparency Ledger</Link> with CSV export.
      </div>

      <p className={s.footerMeta}>LAST UPDATED · JULY 13, 2026</p>
    </>
  );
}
