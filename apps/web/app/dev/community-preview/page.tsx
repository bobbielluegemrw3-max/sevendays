import Link from 'next/link';
import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { DocsNav } from '@/components/DocsNav';
import { CommunityContent } from '@/components/docs/CommunityContent';
import s from '@/app/docs/docs.module.css';

/**
 * /docs/community(創設者メッセージ+運営主体の開示)の視覚QA(本番404)。
 * docsレイアウトのシェル(ヘッダー+サイドナビ)を再現してプレビューする。
 * オーナーGO後: app/docs/community/page.tsx を作り DocsNav に追加して公開。
 */
export default async function CommunityPreviewPage() {
  await requireDevPreviewAccess();
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
        <article className={s.content}>
          <CommunityContent />
        </article>
      </div>
    </div>
  );
}
