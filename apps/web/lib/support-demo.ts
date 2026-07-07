import type { SupportTreeInput } from '@/lib/support-tree';

/**
 * TEAMページのデモ組織(オーナー指示 2026-07-07: UIレビュー用)。
 * 実ネットワークが空の間だけ /support/map がこれを表示する(明示ラベル付き)。
 * 決定論生成(Math.random不使用)・約60名・7ティア・系列の形はバラバラ
 * (深いA系列/中規模B/横に広いC/成長中D/1人だけのE)。
 */

const NAMES = [
  'yu', 'mi', 'ta', 'sa', 'ke', 'jo', 'an', 'li', 'pe', 'ha',
  'ry', 'no', 'fu', 'so', 'da', 'ai', 'mo', 'sh', 'ka', 'hi',
  'ma', 'na', 'ri', 'to', 'ku', 'se', 'wa', 'ho', 'tu', 'ne',
];
const DOMAINS = ['gmail.com', 'yahoo.co.jp', 'outlook.com', 'icloud.com', 'proton.me'];

function display(i: number): string {
  if (i % 6 === 4) {
    const hex = ((i * 2654435761) >>> 0).toString(16).padStart(8, '0');
    return `0x${hex.slice(0, 4)}…${hex.slice(4, 8)}`;
  }
  return `${NAMES[i % NAMES.length]}***@${DOMAINS[i % DOMAINS.length]}`;
}

export interface DemoSupportData {
  network: SupportTreeInput[];
  pool: { user_id: string; display: string; joined_at: string }[];
}

export function demoSupportNetwork(): DemoSupportData {
  const nodes: SupportTreeInput[] = [];
  let seq = 0;
  const iso = (d: number, h: number) =>
    new Date(Date.UTC(2026, 5, 1 + (d % 28), h % 24)).toISOString();
  const add = (parent: string | null, tier: number): string => {
    seq += 1;
    const id = `demo-${seq}`;
    nodes.push({
      user_id: id,
      parent_user_id: parent,
      tier,
      display: display(seq),
      placed_at: iso(seq, seq * 7),
      horses: (seq * 5) % 7,
    });
    return id;
  };

  // ティア1: 直下5系列(横並び無制限)
  const [a, b, c, d, e] = [add(null, 1), add(null, 1), add(null, 1), add(null, 1), add(null, 1)];

  // A系列: ティア7まで一直線に深い+途中に枝
  let cur = a;
  for (let tier = 2; tier <= 7; tier += 1) {
    const next = add(cur, tier);
    if (tier <= 5) add(cur, tier); // 兄弟
    if (tier === 3) {
      const side = add(cur, tier);
      add(side, tier + 1);
      add(side, tier + 1);
    }
    cur = next;
  }

  // B系列: 中規模(2系列×孫まで)
  for (let i = 0; i < 2; i += 1) {
    const child = add(b, 2);
    const g1 = add(child, 3);
    add(child, 3);
    add(g1, 4);
    if (i === 0) {
      const g2 = add(g1, 4);
      add(g2, 5);
    }
  }

  // C系列: 横に広い(直下8名・一部に孫)
  const cKids: string[] = [];
  for (let i = 0; i < 8; i += 1) cKids.push(add(c, 2));
  cKids.slice(0, 5).forEach((kid, i) => {
    add(kid, 3);
    if (i < 3) add(kid, 3);
    if (i === 0) {
      const g = add(kid, 3);
      add(g, 4);
      add(g, 4);
    }
  });

  // D系列: 成長中
  const d1 = add(d, 2);
  const d2 = add(d, 2);
  const d11 = add(d1, 3);
  add(d1, 3);
  add(d2, 3);
  const d111 = add(d11, 4);
  add(d11, 4);
  add(d111, 5);

  // E系列: まだ1人
  add(e, 2);

  return {
    network: nodes,
    pool: [
      { user_id: 'demo-pool-1', display: 'sh***@gmail.com', joined_at: iso(20, 10) },
      { user_id: 'demo-pool-2', display: '0xbb42…91cd', joined_at: iso(22, 14) },
      { user_id: 'demo-pool-3', display: 'mo***@proton.me', joined_at: iso(24, 9) },
      { user_id: 'demo-pool-4', display: 'ri***@icloud.com', joined_at: iso(26, 18) },
    ],
  };
}
