import { PRICE_TABLE_V1 } from '@sevendays/domain';
import s from '../app/stable.module.css';

/* ============================================================================
 * stable-shared — /horses の純粋ヘルパ(サーバー/クライアント両方から import 可)。
 * JSX を含まないので 'use client' は不要。CSS Modules のクラス名は文字列として
 * 参照するだけなのでサーバーからでも安全。
 * ========================================================================== */

export const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

export function money(v: string | number): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function pct(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(6, Math.min(100, n)) : 60;
}
/** その馬の本日の P2P 価値 — 不変の価格テーブルから(Day0=100 → Day6=177.16)。 */
export function horseValue(currentDay: number): string {
  return PRICE_TABLE_V1[Math.max(0, Math.min(6, currentDay))] ?? PRICE_TABLE_V1[0]!;
}
export function rarClass(rarity: string): string {
  return s[`rar${RARITIES.includes(rarity) ? rarity : 'COMMON'}`]!;
}
