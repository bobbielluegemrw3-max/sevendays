import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { SupportMapView } from '@/components/SupportMapView';
import type { SupportTreeInput } from '@/lib/support-tree';

/**
 * Dev-only visual preview of the ORGANIZATION MAP (design submission).
 * 25名・5ティアの不均衡ツリー+配置待ち3名。配置モードはローカル動作
 * (プールの「配置」→ ツリー上のノードをクリック → 確定で実際に生える)。
 * 404 in production.
 */
export default async function SupportMapPreview() {
  await requireDevPreviewAccess();
  const iso = (d: number) => new Date(Date.UTC(2026, 5, d, 12)).toISOString();
  const n = (
    id: string,
    parent: string | null,
    tier: number,
    display: string,
    day: number,
  ): SupportTreeInput => ({
    user_id: id,
    parent_user_id: parent,
    tier,
    display,
    placed_at: iso(day),
  });
  const network: SupportTreeInput[] = [
    // Tier 1(直下4系列・横並び無制限)
    n('a', null, 1, 'yu***@gmail.com', 1),
    n('b', null, 1, '0x12ab…88ff', 2),
    n('c', null, 1, 'mi***@yahoo.co.jp', 3),
    n('d', null, 1, 'ta***@proton.me', 4),
    // Aの系列(深い)
    n('a1', 'a', 2, 'sa***@gmail.com', 5),
    n('a2', 'a', 2, '0x9fe3…12aa', 6),
    n('a11', 'a1', 3, 'jo***@outlook.com', 8),
    n('a12', 'a1', 3, 'ke***@gmail.com', 9),
    n('a13', 'a1', 3, '0x77cd…09be', 10),
    n('a111', 'a11', 4, 'li***@gmail.com', 12),
    n('a112', 'a11', 4, 'an***@icloud.com', 13),
    n('a1111', 'a111', 5, 'pe***@gmail.com', 15),
    // Bの系列
    n('b1', 'b', 2, 'ha***@gmail.com', 7),
    n('b11', 'b1', 3, '0x3c11…7d2e', 11),
    n('b12', 'b1', 3, 'ry***@gmail.com', 11),
    // Cの系列(横に広い)
    n('c1', 'c', 2, 'no***@gmail.com', 8),
    n('c2', 'c', 2, 'fu***@yahoo.co.jp', 8),
    n('c3', 'c', 2, '0xaa10…3e77', 9),
    n('c4', 'c', 2, 'so***@gmail.com', 10),
    n('c21', 'c2', 3, 'da***@outlook.com', 14),
    n('c22', 'c2', 3, 'ep***@gmail.com', 14),
    // Dは1人だけ
    n('d1', 'd', 2, 'ai***@gmail.com', 16),
  ];
  return (
    <SupportMapView
      preview
      data={{
        selfUserId: '00000000-0000-4000-8000-000000000000',
        selfDisplay: 'go***@gmail.com',
        network,
        pool: [
          { user_id: 'p1', display: 'sh***@gmail.com', joined_at: iso(20) },
          { user_id: 'p2', display: '0xbb42…91cd', joined_at: iso(22) },
          { user_id: 'p3', display: 'mo***@proton.me', joined_at: iso(24) },
        ],
        tierAmounts: ['3.00', '2.00', '1.00', '1.00', '1.00', '1.00', '1.00'],
      }}
    />
  );
}
