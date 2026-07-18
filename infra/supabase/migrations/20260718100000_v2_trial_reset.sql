-- V2テストネット試運転リセット(2026-07-18, オーナーGO・最終確認済み)。
--
-- V2実装(-1a〜-7)完走を受けて「クリーンな0からV2シーズン開始」。
-- 消すもの: ゲーム/経済の記録すべて(7/13リセットと同一+ジャックポット系)。
-- 残すもの: users(配置ツリー含む)・admin_role_grants・user_wallets・
-- user_trade_settings・placement_audit・push_subscriptions/push_broadcasts・
-- CS・item_catalog・全ポリシー表・ledger_accounts(口座行)。
--
-- リセットと同一トランザクションで切り替えるもの:
--  1. race_engine_v2.0 有効化(切替の一点 — Decision 102/憲法)
--  2. アイテム棚: 旧35種(item_class='V1')→新35種(Decision 109)
--  3. ジャックポット有効化: 週100 USDT×1名(Decision 106仮値・オーナーGO)
--     + 広告費口座にテスト原資1,000 USDTをシード(テストネット限定・
--     入金クリアリング相手方=既存のテストfund-grantと同じ経路思想)
--
-- ガード: goldbenchan@gmail.com が存在する環境(=本番テストネット)でのみ実行。
-- 帳簿の不変性ガードはFOR EACH ROWトリガーのためTRUNCATEは素通し(7/13で確認済み)。

do $$
declare
  v_clearing uuid;
  v_marketing uuid;
  v_tx uuid;
begin
  if not exists (select 1 from users where email = 'goldbenchan@gmail.com') then
    return; -- 本番テストネット以外では何もしない
  end if;

  truncate table
    admin_fund_grants,
    audit_logs,
    batch_runs,
    batch_steps,
    blockchain_deposits,
    blockchain_withdrawals,
    chain_scan_cursors,
    buyback_schedule_payments,
    buyback_schedules,
    deposit_addresses,
    economy_status_evaluations,
    horse_burns,
    horses,
    item_usages,
    jackpot_draws,
    jackpot_seed_escrow,
    jackpot_winners,
    ledger_account_balances,
    ledger_entries,
    ledger_transactions,
    liquidity_reports,
    mail_claims,
    market_listings,
    marketplace_status,
    memorial_nfts,
    night_forecasts,
    notifications,
    ownership_assignments,
    purchase_sessions,
    race_participant_snapshots,
    race_results,
    race_seed_escrow,
    races,
    randomness_commits,
    recovery_logs,
    recovery_snapshots,
    revenge_buffs,
    stress_test_results,
    training_sessions,
    user_items,
    user_transfers,
    withdrawal_review_approvals
  cascade;

  -- marketplace_status はシングルトン行が前提(TRUNCATEで消えるため再シード)
  insert into marketplace_status (id, state) values (true, 'OPEN');

  -- 1. エンジン切替(activatePolicyと同じ操作): 現行を退役→v2.0を有効化
  update race_engine_versions
     set deactivated_at = now()
   where activated_at is not null and deactivated_at is null;
  update race_engine_versions
     set activated_at = now(), deactivated_at = null
   where version = 'race_engine_v2.0';

  -- 2. アイテム棚の切替(Decision 109)
  update item_catalog set active = (item_class <> 'V1');

  -- 3. 広告費テスト原資1,000シード(単一の貸借一致トランザクション)
  select id into v_clearing from ledger_accounts
   where owner_type = 'PLATFORM' and account_type = 'PLATFORM_DEPOSIT_CLEARING';
  select id into v_marketing from ledger_accounts
   where owner_type = 'PLATFORM' and account_type = 'PLATFORM_MARKETING_BUDGET';
  insert into ledger_transactions (transaction_type, idempotency_key, reference_type)
  values ('ADMIN_ADJUSTMENT', 'v2-trial-marketing-seed:2026-07-18', 'v2_trial_reset')
  returning id into v_tx;
  insert into ledger_entries (transaction_id, account_id, direction, amount)
  values (v_tx, v_clearing, 'DEBIT', 1000),
         (v_tx, v_marketing, 'CREDIT', 1000);

  -- ジャックポット有効化(週100 USDT×1名・Decision 106仮値)
  update system_settings
     set value = jsonb_build_object('enabled', true, 'prize_usdt', '100.00000000', 'winners', 1),
         updated_at = now()
   where key = 'jackpot';
end;
$$;
