/* ============================================================================
 * クライアント安全な i18n ヘルパー(2026-07-16 パフォーマンス改修)。
 *
 * このファイルは辞書データ(APP_COPY / LANDING_COPY)を一切 import しない。
 * クライアントコンポーネントが lib/i18n.ts(5言語辞書入り・raw 136KB)を
 * import すると全ページのクライアントバンドルに辞書が混入するため、
 *   - クライアント: ここから fill / 型だけを import し、文言は使うセクションを
 *     サーバー親から props(t)で受け取る
 *   - サーバー: 従来どおり lib/i18n.ts の APP_COPY[lang] を参照
 * という分離を守ること。type import は実行時に消えるので辞書は混入しない。
 * ========================================================================== */

export type { Lang } from '@/lib/landing-i18n';
export type { AppDict } from '@/lib/i18n';

/** テンプレ文字列の {name} を値で埋める(多言語の語順差を吸収)。 */
export function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m: string, k: string) => String(vars[k] ?? ''));
}

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** 'YYYY-MM-DD' → 言語ごとの「◯月✕日」表記(結果ラベル等の日付面)。 */
export function formatMonthDay(lang: string, isoDate: string): string {
  const m = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(m) || !Number.isFinite(d)) return isoDate;
  switch (lang) {
    case 'en': return `${MONTH_EN[m - 1]} ${d}`;
    case 'ms': return `${d} ${MONTH_EN[m - 1]}`;
    case 'ko': return `${m}월 ${d}일`;
    default: return `${m}月${d}日`; // ja / zh
  }
}


/**
 * V2実装-7b(Decision 102): DAY表記→LV表記の表示置換。
 * 「Day 7」「DAY0」「Day {d}」等の馬の日数トークンだけを LV.〜 に変える
 * (数字かプレースホルダが続く場合のみ — "Daily" や "Day of play" は不変)。
 * クライアント・サーバー両用の純関数。
 */
export function toLvText(s: string): string {
  return s.replace(/\b[Dd][Aa][Yy]\.? ?(?=\{|\d)/g, 'LV.');
}
