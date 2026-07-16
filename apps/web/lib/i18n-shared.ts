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
