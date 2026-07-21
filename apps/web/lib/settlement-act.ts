/**
 * SETTLEMENT — 「あなたの一日の決算」幕(FUN_V3 施策G 後半・2026-07-21)。
 *
 * 置き換える対象: 62〜96.5秒の P2P/リワードのログ濁流(LIST/BID/MATCH/MINT/
 * MLM/ITEM)。これらの行は makeLine() が index から作る決定論ダミーであり、
 * 馬名・U-xxxx・価格のすべてが作り物である(実数なのは行数だけ)。
 *
 * レビュー側の判定(2026-07-21・コード確認済み):
 *   「62〜97秒は2つの別物が混ざっている。(a)他人のダミー取引の濁流と、
 *     (b)その中に散らばって発火している自分の実際の精算。
 *     (a)を全部消しても、自分の本物のデータは1件も失われない。」
 *
 * したがってここでやるのは「P2Pターンの削除」ではなく、
 * **偽物を消して、埋もれていた本物を主役にする**ことである。
 *
 * 帯レースと同じ構造がここにもある — 自動出品もプール予約も、プレイヤーは
 * 前日までに手を打ち終えている。今夜わかるのは「選ばれて売れたか、いくらで」
 * 「何頭来たか」だけ。つまり *既に手を打ち終えて見届けるだけ* であり、
 * 機能していなかったのは構造が無かったからではなく、他人の洪水に
 * 埋もれて自分がどこにいるか分からなかったからである。
 */

/* ---- タイムライン(幕ローカル秒) ------------------------------------------ */

/** 今夜の市場を実カウントだけで1行に凝縮する(個別行=フィクションは出さない)。 */
export const PULSE_SECONDS = 3;
/** 自分の決算(出ていった馬 → 入ってきた馬 → 締め)。 */
export const HARVEST_SECONDS = 12;
/** 幕全体。帯レース(32秒)に対してここは短い — 「売れた/9頭来た」は
 *  「生か死か」より劇性が一段低く、35秒は持たない(レビュー側の指摘)。 */
export const SETTLEMENT_TOTAL = PULSE_SECONDS + HARVEST_SECONDS;

export type SettlementPhase = 'PULSE' | 'HARVEST' | 'CLOSING';

/** 締めの1行に入るまでの時刻。 */
const T_HARVEST = PULSE_SECONDS;
const T_CLOSING = SETTLEMENT_TOTAL - 2;

/* ---- 入力 ---------------------------------------------------------------- */

/** 今夜の市場ぜんたい(DerbyCounts の実数。ここは自分事ではない)。 */
export interface MarketPulse {
  /** P2P成約数(ミント割当を含まない)。 */
  trades: number;
  /** 新規発行された頭数。 */
  mints: number;
  /** 出品された頭数。 */
  listed: number;
}

/** 自分の厩舎から出ていった/入ってきた1頭。 */
export interface HarvestRow {
  kind: 'out' | 'in';
  name: string;
  dnaHash: string;
  /** 売値(out) / 支払額(in)。 */
  price: string;
  day: number | null;
  totalValue: number | null;
  /** in のうち新規発行。 */
  isMint?: boolean;
  /** out のとき: 取得実支出と手取り(施策E の利確フレーミング)。 */
  acquired?: string | null;
  net?: string | null;
}

export interface SettlementInput {
  pulse: MarketPulse;
  rows: readonly HarvestRow[];
  /** 精算前の保有頭数(締めの「8頭 → 9頭」に使う)。null=不明なら出さない。 */
  stableBefore?: number | null;
}

/* ---- フレーム ------------------------------------------------------------ */

export interface SettlementFrame {
  phase: SettlementPhase;
  pulse: MarketPulse;
  /** ここまでに開示された行(1件ずつ中央に出る)。 */
  revealed: readonly HarvestRow[];
  /** 今この瞬間に出たばかりの行(ヒットストップ等の演出フック)。 */
  current: HarvestRow | null;
  /** 締めの収支(out の手取り合計 − in の支払合計)。null=算出不能。 */
  netTotal: number | null;
  stableBefore: number | null;
  stableAfter: number | null;
  showClosing: boolean;
}

/** 自分の精算が1件も無い夜(多くの夜がそう)。幕を丸ごと畳んでよい。 */
export function hasHarvest(input: SettlementInput): boolean {
  return input.rows.length > 0;
}

/**
 * この夜に必要な幕の尺。
 *
 * 作り物で尺を埋めるのをやめる、というのがこの改修の芯である。
 * 自分の活動が無い夜は PULSE の3秒で終わる。
 */
export function settlementLength(input: SettlementInput): number {
  return hasHarvest(input) ? SETTLEMENT_TOTAL : PULSE_SECONDS;
}

export function settlementFrame(input: SettlementInput, elapsed: number): SettlementFrame {
  const rows = input.rows;
  const harvest = rows.length > 0;
  const phase: SettlementPhase =
    elapsed < T_HARVEST || !harvest ? 'PULSE'
      : elapsed < T_CLOSING ? 'HARVEST'
        : 'CLOSING';

  // 出ていった馬 → 入ってきた馬 の順に1件ずつ。
  const ordered = [...rows].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'out' ? -1 : 1));
  let shown = 0;
  if (harvest && elapsed >= T_HARVEST) {
    const span = Math.max(0.001, T_CLOSING - T_HARVEST);
    const per = span / ordered.length;
    shown = Math.min(ordered.length, Math.floor((elapsed - T_HARVEST) / per) + 1);
  }
  const revealed = ordered.slice(0, shown);

  // 収支: 売却の手取り合計 − 購入の支払合計。手取り不明の行があれば null。
  let netTotal: number | null = 0;
  for (const r of ordered) {
    if (r.kind === 'out') {
      const v = r.net ?? null;
      if (v === null) { netTotal = null; break; }
      netTotal += Number(v);
    } else {
      netTotal -= Number(r.price);
    }
  }
  if (netTotal !== null) netTotal = Math.round(netTotal * 100) / 100;

  const before = input.stableBefore ?? null;
  const delta = ordered.reduce((n, r) => n + (r.kind === 'in' ? 1 : -1), 0);

  return {
    phase,
    pulse: input.pulse,
    revealed,
    current: shown > 0 ? ordered[shown - 1]! : null,
    netTotal,
    stableBefore: before,
    stableAfter: before === null ? null : before + delta,
    showClosing: harvest && elapsed >= T_CLOSING,
  };
}

/* ---- フィクスチャ(プレビュー用) ------------------------------------------ */

export function fixtureSettlement(): SettlementInput {
  return {
    pulse: { trades: 22372, mints: 1938, listed: 26248 },
    stableBefore: 8,
    rows: [
      {
        kind: 'out', name: 'Thunder Grail', dnaHash: `0x${'a1'.repeat(32)}`,
        price: '177.16', day: 6, totalValue: 84, acquired: '146.41', net: '173.62',
      },
      {
        kind: 'in', name: 'Golden Storm', dnaHash: `0x${'4c'.repeat(32)}`,
        price: '102.00', day: 0, totalValue: 57, isMint: true,
      },
      {
        kind: 'in', name: 'Azure Comet', dnaHash: `0x${'7e'.repeat(32)}`,
        price: '133.10', day: 3, totalValue: 71,
      },
    ],
  };
}
