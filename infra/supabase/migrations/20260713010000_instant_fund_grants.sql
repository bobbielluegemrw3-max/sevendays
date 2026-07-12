-- Decision 089 (2026-07-13): 小口ファンドグラントの即時付与。
-- 出金レビューの閾値思想(Decision 060-064)を管理者付与にも適用:
--   ≤1,000 USDT は1名の FINANCE_ADMIN/SUPER_ADMIN で即時付与(監査ログ必須)、
--   それ超は従来どおり二重承認(申請者≠承認者)。
-- 旧制約は無条件に approved_by <> requested_by を要求していたため、
-- 小口の自己承認(=即時付与の記録として正直な形)を許すよう緩和する。
-- 上限値は packages/ledger/src/admin.ts の
-- SINGLE_APPROVAL_ADJUSTMENT_LIMIT_USDT (=1000) と一致させること。

alter table admin_fund_grants
  drop constraint admin_fund_grants_distinct_approver;

alter table admin_fund_grants
  add constraint admin_fund_grants_distinct_approver
  check (approved_by is null or approved_by <> requested_by or amount <= 1000);
