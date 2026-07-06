/**
 * 組織マップのツリーレイアウト(純関数・React/IOなし)。
 * 親ポインタのノード列から古典的なtidy tree(葉に等間隔スロット、内部ノードは
 * 子の中点、深さ=ティア)を計算し、絶対配置カード+SVGコネクタ用の座標を返す。
 */

export interface SupportTreeInput {
  user_id: string;
  parent_user_id: string | null;
  tier: number;
  display: string;
  placed_at: string | null;
}

export interface LaidOutNode extends SupportTreeInput {
  x: number;
  y: number;
  directCount: number;
  isSelf: boolean;
}

export interface TreeEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface TreeLayout {
  nodes: LaidOutNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
  maxTier: number;
}

export const NODE_W = 118;
export const NODE_H = 96;
export const GAP_X = 18;
export const LEVEL_H = 132;
const SLOT = NODE_W + GAP_X;

/** self を根(tier 0)に、APIの nodes(tier 1..7)をツリー化して座標を計算。 */
export function layoutSupportTree(
  selfDisplay: string,
  nodes: readonly SupportTreeInput[],
): TreeLayout {
  const childrenOf = new Map<string | null, SupportTreeInput[]>();
  for (const n of nodes) {
    // tier 1 の親は自分(APIでは parent_user_id が自分のID) — null に正規化
    const key = n.tier === 1 ? null : n.parent_user_id;
    const list = childrenOf.get(key) ?? [];
    list.push(n);
    childrenOf.set(key, list);
  }

  const placed: LaidOutNode[] = [];
  const edges: TreeEdge[] = [];
  let nextLeafX = 0;
  let maxTier = 0;

  const layout = (node: SupportTreeInput | null, id: string | null, tier: number): number => {
    const kids = childrenOf.get(id === 'SELF' ? null : id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = nextLeafX;
      nextLeafX += SLOT;
    } else {
      const xs = kids.map((k) => layout(k, k.user_id, k.tier));
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    const y = tier * LEVEL_H;
    if (node) {
      placed.push({ ...node, x, y, directCount: kids.length, isSelf: false });
      maxTier = Math.max(maxTier, node.tier);
    } else {
      placed.push({
        user_id: 'SELF',
        parent_user_id: null,
        tier: 0,
        display: selfDisplay,
        placed_at: null,
        x,
        y,
        directCount: kids.length,
        isSelf: true,
      });
    }
    for (const k of kids) {
      const kn = placed.find((p) => p.user_id === k.user_id)!;
      edges.push({ fromX: x + NODE_W / 2, fromY: y + NODE_H, toX: kn.x + NODE_W / 2, toY: kn.y });
    }
    return x;
  };

  layout(null, 'SELF', 0);

  const width = Math.max(nextLeafX - GAP_X, NODE_W);
  const height = (maxTier + 1) * LEVEL_H + NODE_H;
  return { nodes: placed, edges, width, height, maxTier };
}

/** 表示名から決定論的にアバター色相を選ぶ(見分けやすさのため)。 */
export function avatarHue(display: string): number {
  let h = 0;
  for (let i = 0; i < display.length; i += 1) h = (h * 31 + display.charCodeAt(i)) >>> 0;
  return h % 360;
}
