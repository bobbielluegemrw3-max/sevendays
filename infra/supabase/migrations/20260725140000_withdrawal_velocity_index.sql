-- B (WALLET_HARDENING_AND_R1_BRIEF.md §3, オーナー確定 2026-07-25): 出金の連射防止。
-- 出金エンドポイントは「直近の自分の出金(max(created_at))」を引いて5分間隔を判定する。
-- その user 単位の参照を効率化する索引。純追加。
create index if not exists idx_withdrawals_user_created
  on blockchain_withdrawals (user_id, created_at);
