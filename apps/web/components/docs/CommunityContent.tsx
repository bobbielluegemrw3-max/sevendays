import Link from 'next/link';
import s from '@/app/docs/docs.module.css';

/**
 * /docs/community の本文(創設者メッセージ+運営主体の開示)。
 * ドラフト段階: 写真はプレースホルダー・名前は仮置き。オーナーGO後に
 * 実写真(/docs/founder.jpg 等)・表記名・確定文面に差し替えて
 * app/docs/community/page.tsx から公開する(DocsNav にも追加)。
 *
 * 文面の規律(R1/R3): earn/profit/invest/return・保証・リクルート調は使わない。
 * 約束するのは「フェアなルール」だけ。運営主体は事実記載のみ
 * (「〜に該当しない」式の法的論証は書かない — Decision 091 の編集方針)。
 */
export function CommunityContent() {
  return (
    <>
      <p className={s.eyebrow}>Documentation / Community</p>
      <h1>The Community</h1>
      <p className={s.lede}>
        Seven Days Derby is built and run by a community, not a corporation. This page is where
        you meet the people behind it.
      </p>

      <div className={s.founder}>
        <img
          src="/docs/founder.jpg"
          alt="Arturas Tsalei, founder of the Seven Days Derby Community"
          className={s.portrait}
        />
        <p className={s.pullquote}>
          &ldquo;Fair rules, verifiable by anyone — that is the only promise we make.&rdquo;
        </p>
      </div>

      <h2>A message from the founder</h2>
      <p>Hello, and welcome to Seven Days Derby.</p>
      <p>
        I have loved games my whole life — and I have watched what quietly ruins them: rules that
        bend, odds that favor the house, operators no one can question. We built Seven Days Derby
        to be the opposite. Every race is decided by a deterministic engine, sealed before the
        race begins and open for anyone to verify after it ends — because a game is only worth
        playing when everyone, including the operator, stands under the same rules.
      </p>
      <p>
        Seven days is a short story with a real ending. Some horses will reach it; many will not.
        What we promise is never an outcome — it is a fair track.
      </p>
      <p>
        So come race with us. Watch the 20:00 derby, read the ledger, question everything. That
        is exactly what this community is for.
      </p>

      <div className={s.signature}>
        <p className={s.sigName}>Arturas Tsalei</p>
        <p className={s.sigMeta}>Founder, Seven Days Derby Community</p>
      </div>

      <h2>How Seven Days Derby is operated</h2>
      <p>
        Seven Days Derby is operated by the <strong>Seven Days Derby Community</strong>
        {' — '}the
        builders and players who run it together — not by a corporation. The community&apos;s
        administrators carry out day-to-day operation: the nightly settlement, player support,
        and platform maintenance.
      </p>
      <p>
        What an operator can and cannot do here is written into the system itself, not into
        promises: race seeds are cryptographically committed before every race, posted results
        and ledger entries are immutable, and every night&apos;s aggregate numbers are published
        with CSV export. Where trust would normally be required, we replaced it with
        verification.
      </p>

      <div className={s.callout}>
        See how that works in practice: <Link href="/docs/fairness">Fairness &amp; Determinism</Link>{' '}
        and the <Link href="/ledger">Transparency Ledger</Link>.
      </div>

      <p className={s.footerMeta}>DRAFT FOR REVIEW · JULY 14, 2026</p>
    </>
  );
}
