-- FUN改修 B層(FUN_V2_PLAN.md §4): 運営広告費口座のenum追加。
-- (ALTER TYPE ADD VALUE はコミット後でないと使用できない — 口座行の作成と
--  移動申請テーブルは次のマイグレーション 20260717020000 で行う。
--  20260702200124_buff_applied_enum.sql と同じ流儀。)

alter type account_type add value if not exists 'PLATFORM_MARKETING_BUDGET';
