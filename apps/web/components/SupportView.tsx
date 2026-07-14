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
  /** 配置ツリー配下7段の稼働馬価値(全ティアの主条件、Decision 077)。 */
  org_volume: string;
  /** 直接紹介のみの稼働馬価値(T5以上で追加要求)。 */
  direct_volume: string;
  /** 現在のティア1単価(Decision 099 スターターレート: clamp(150000/組織, 3, 8))。 */
  starter_rate: string;
  max_tiers: number;
  tier_amounts: readonly string[];
  org_thresholds: readonly string[];
  direct_thresholds: readonly string[];
  direct_required_from_tier: number;
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
  horses?: number;
}

export interface BonusRow {
  amount: string;
  tier: number | null;
  burn_event_id: string | null;
  created_at: string;
}
