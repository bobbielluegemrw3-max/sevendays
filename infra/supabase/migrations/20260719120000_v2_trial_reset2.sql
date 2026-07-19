-- V2テストネット試運転リセット第2弾(2026-07-19, オーナー指示:
-- 「デバッグ体験中なのでどのようなリセットスタートでもOK・完全な状態を望む」)。
--
-- 背景: 7/19朝の複合障害(V1遺物invariantでバッチFAILED→リカバリのslot欠落バグで
-- 夜バッチを12時間前倒し実行・ジャックポットまで早期抽選)により、LVと生存レース数が
-- 1ズレた変則状態になった。根本修正3件(buffs invariantのV2ゲート d08311b/
-- リカバリslot引き継ぎ 45ef2de/調教ターゲットのFINALIZED基準 45ef2de)を
-- デプロイ済みの上で、クリーンな0から再スタートする。
--
-- 内容は 20260718100000_v2_trial_reset.sql と同一思想:
-- 消すもの: ゲーム/経済の記録すべて。残すもの: users・権限・設定・カタログ・口座行。
-- +今回: 障害対応で使った診断キー(debug:*)の掃除。
--
-- ガード: goldbenchan@gmail.com が存在する環境(=本番テストネット)でのみ実行。

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

  -- エンジンは既に race_engine_v2.0 有効(7/18切替) — 冪等に再保証
  update race_engine_versions
     set deactivated_at = now()
   where activated_at is not null and deactivated_at is null
     and version <> 'race_engine_v2.0';
  update race_engine_versions
     set activated_at = coalesce(activated_at, now()), deactivated_at = null
   where version = 'race_engine_v2.0';

  -- アイテム棚(Decision 109)— 冪等に再保証
  update item_catalog set active = (item_class <> 'V1');

  -- 広告費テスト原資1,000シード(単一の貸借一致トランザクション)
  select id into v_clearing from ledger_accounts
   where owner_type = 'PLATFORM' and account_type = 'PLATFORM_DEPOSIT_CLEARING';
  select id into v_marketing from ledger_accounts
   where owner_type = 'PLATFORM' and account_type = 'PLATFORM_MARKETING_BUDGET';
  insert into ledger_transactions (transaction_type, idempotency_key, reference_type)
  values ('ADMIN_ADJUSTMENT', 'v2-trial-marketing-seed:2026-07-19', 'v2_trial_reset2')
  returning id into v_tx;
  insert into ledger_entries (transaction_id, account_id, direction, amount)
  values (v_tx, v_clearing, 'DEBIT', 1000),
         (v_tx, v_marketing, 'CREDIT', 1000);

  -- ジャックポット有効化(週100 USDT×1名)— 冪等に再保証
  update system_settings
     set value = jsonb_build_object('enabled', true, 'prize_usdt', '100.00000000', 'winners', 1),
         updated_at = now()
   where key = 'jackpot';

  -- 障害対応の診断キーを掃除(instrumentationは残る — エラー時のみ書き込み)
  delete from system_settings where key like 'debug:%';
end;
$$;
