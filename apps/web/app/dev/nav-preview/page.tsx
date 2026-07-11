import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { TopNav } from '@/components/TopNav';

/**
 * Dev-only preview of the signed-in header (the real one only renders for
 * authenticated sessions). The negative margin cancels <main>'s padding so
 * the nav spans the full viewport exactly like in the real layout.
 */
export default async function NavPreview() {
  await requireDevPreviewAccess();
  return (
    <div style={{ margin: '-1.5rem -1.1rem 0' }}>
      <TopNav unread={3} />
      <div style={{ height: 300 }} />
    </div>
  );
}
