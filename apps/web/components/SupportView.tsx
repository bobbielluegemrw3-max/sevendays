/**
 * サポートボーナスAPIのレスポンス型(Decision 074)。
 * 旧・単一ページ版の SupportView コンポーネントはリデザイン(2026-07-07)で
 * SupportDashboardView(/support)+ SupportMapView(/support/map)に分割され、
 * このモジュールは両者と page.tsx が共有する型定義のみを提供する。
 */

export interface SupportSummary {
  referral_code: string;
  has_sponsor: boolean;
  is_placed: boolean;
  unlocked_tiers: number;
  volume: string;
  max_tiers: number;
  tier_amounts: readonly string[];
  tier_thresholds: readonly string[];
  pool_count: number;
  bonuses_received_total: string;
  bonuses_received_count: number;
}

export interface PoolMember {
  user_id: string;
  display: string;
  joined_at: string;
}

export interface NetworkNode {
  user_id: string;
  parent_user_id: string | null;
  tier: number;
  display: string;
  placed_at: string | null;
}

export interface BonusRow {
  amount: string;
  tier: number | null;
  burn_event_id: string | null;
  created_at: string;
}
