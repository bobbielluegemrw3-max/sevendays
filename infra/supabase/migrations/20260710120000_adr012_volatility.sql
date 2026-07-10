-- ADR-012(承認 2026-07-10): 予報と荒れ相場 — フェーズ2(BURN率ジッター)
--
-- 1) races.burn_rate — その夜に採用した実効BURN率(v1.1+はシード由来の対称
--    ジッター後の値)。台帳・検証ページでの公開用。過去レースはNULLのまま。
-- 2) race_engine_v1.1 の登録 — バッチはポリシーロックで最新版を掴むため、
--    この行の追加で「次のバッチから」ジッターが有効になる。過去レースは
--    保存済みバージョン(v1.0=固定率)でリプレイされ互換が保たれる。
--    スコア式は v1.0 と同一。変わるのはBURN率の導出のみ。

alter table races add column if not exists burn_rate numeric(6, 4);

-- ポリシー不変則: ACTIVEは常に各テーブル1件 — v1.0を退役させてからv1.1を活性化
update race_engine_versions set deactivated_at = now()
 where version = 'race_engine_v1.0' and deactivated_at is null;

insert into race_engine_versions (version, policy_json, activated_at)
values ('race_engine_v1.1', '{
  "formula": "final_score = base_ability_score + horse_type_modifier + rarity_modifier + dna_modifier + training_modifier + weather_modifier + track_modifier + condition_modifier + fatigue_modifier + revenge_buff_modifier + random_modifier",
  "burn_rate_source": "volatility_v1.0",
  "burn_rate_rule": "rate = BURN_TARGET_RATE_V1[economy_status] + symmetric_jitter(race_seed); envelope [0.080, 0.135] fixed; amplitude <= 0.027 (narrow-only); mean preserved at the status base rate (ADR-012)",
  "burn_count_rule": "floor(eligible * rate) — constitution rule unchanged"
}'::jsonb, now())
on conflict (version) do nothing;
