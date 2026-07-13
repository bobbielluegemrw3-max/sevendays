-- テストネット全ゲームデータリセット(2026-07-13, オーナーGO)。
--
-- 経緯: テストで7日間クリアした馬2頭のチャンピオン報酬(残285.71 USDT)が
-- 買戻準備金(74.91)を上回り、ミント担保ゲート(Decision 069)が全Day0ミントを
-- 正しくブロック。さらに2晩後には準備金枯渇でStep 20がCOMMIT時に失敗し
-- バッチ全体が停止する状態だった。オーナー判断で「クリーンな0から再テスト」。
--
-- 消すもの: ゲーム/経済の記録すべて(馬・レース・台帳・購入予約・買戻・
-- 通知・アイテム・バッチ実行記録・監査ログ)。
-- 残すもの: users(運営ルートチェーン=配置ツリーはusersのカラム)・
-- admin_role_grants・user_wallets・user_trade_settings・placement_audit・
-- push_subscriptions/push_broadcasts・CS・item_catalog・全ポリシー表・
-- ledger_accounts(口座行。残高キャッシュは消してもエントリINSERT時にupsert再生成)。
--
-- 実装ノート: 帳簿の不変性ガードはFOR EACH ROWトリガーのため、TRUNCATEは
-- 発火せず素通しできる(TRUNCATEトリガーは全テーブルに存在しないことを確認済み)。
-- CASCADEはFK参照元を巻き込むが、対象は全てこのリスト内(marketplace_statusは
-- batch_runs参照のため巻き込まれる → 直後にOPENの1行を再シード)。
--
-- ガード: goldbenchan@gmail.com が存在する環境(=本番テストネット)でのみ実行。
-- PGliteテストDBや新環境では何もしない。メインネットには絶対に到達しない
-- (本マイグレーションはこのpushで一度だけ適用され、以後の環境はクリーン)。

do $$
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
end;
$$;
