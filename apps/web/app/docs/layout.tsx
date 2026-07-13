import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsNav } from '@/components/DocsNav';
import s from './docs.module.css';

export const metadata: Metadata = {
  title: { default: 'Documentation | Seven Days Derby', template: '%s | Seven Days Derby Docs' },
  description:
    'How Seven Days Derby works: fund handling, deterministic race fairness, and risk disclosure.',
};

/**
 * 公開ドキュメント(Decision 091)。英語のみ・白基調(APIドキュメント調)。
 * 掲載は「事実の開示」に限る — 法的論証(〜に該当しない等)は書かない。
 * 内容を増やすときは LEGAL_REVIEW_MEMO.md の方針に従い弁護士確認を経ること。
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`docs-bleed ${s.root}`}>
      <header className={s.header}>
        <Link href="/" className={s.brand}>
          <span className={s.b1}>SEVEN&nbsp;DAYS</span>
          <span className={s.b2}>DERBY</span>
        </Link>
        <span className={s.hbadge}>Docs</span>
        <Link href="/dashboard" className={s.appLink}>
          Open App →
        </Link>
      </header>
      <div className={s.shell}>
        <DocsNav />
        <article className={s.content}>{children}</article>
      </div>
    </div>
  );
}
