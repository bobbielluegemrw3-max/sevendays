-- 調教・適性再設計(TRAINING_APTITUDE_REDESIGN.md)— アイテムカタログ V4。
-- コード版数は item_policy_v4.0(packages/domain/src/items-v4.ts)。engine は race_engine_v3.0 と対。
--
-- すべて追加のみ・稼働中(V3=item_policy_v3.0)不変:
--  - item_catalog.catalog_version: カタログ世代の識別子。既存 V1 legacy = 'legacy'、
--    現行 V3(TRAINING/RACE)= 'v3'、本 V4 = 'v4'。item_class だけでは V3/V4 を区別できない
--    ため新設(両方 TRAINING/RACE のため)。
--  - V4 の26行は **active=false でシード** — 現行シーズンのショップには一切出ない。
--
-- ★リセット時の有効化コマンドが変わる(§7 チェックリストの更新が必要):
--    旧: update item_catalog set active = (item_class <> 'V1');   -- V3 と V4 を両方点けてしまう
--    新: update item_catalog set active = (catalog_version = 'v4'); -- V4 だけを点ける
--  engine も同時に activatePolicy('race_engine_v3.0') へ。V3(v3.0 catalog)は active=false へ落ちる。
--
-- キーは既存 item_catalog(79キー)と非衝突を確認済み(feed_*/shield_*/*_weak|mid|strong/full_ready_*)。
-- 効果値(hit/miss/growth)はコード(items-v4.ts)が正 — DB はメタデータ(名前・価格・band・class)のみ。
-- 価格は EV中立起点(§14.7・弱5/中6/強8 ほか)。最終値は engine 結線後の RTP 再突合で確定しうる。

alter table item_catalog
  add column catalog_version text not null default 'legacy'
    check (catalog_version in ('legacy', 'v3', 'v4'));

-- 既存の V3(082以降の TRAINING/RACE 世代)を 'v3' に確定(V1 legacy は 'legacy' のまま)。
update item_catalog set catalog_version = 'v3' where item_class in ('TRAINING', 'RACE');

-- V4 catalog seed(26行 = 調教6 + レース20・active=false until the reset switch)。
-- ↓ この INSERT は packages/domain/src/items-v4.ts の ITEM_CATALOG_V4 から生成(コード↔DB一致)。
insert into item_catalog
  (key, name_ja, name_en, band, price, sellable, giftable, usable_day_min, usable_day_max, active, item_class, catalog_version)
values
  ('feed_s', '高原の干し草〔強化・小〕', 'Highland Hay', 'BASIC', 2, true, true, null, null, false, 'TRAINING', 'v4'),
  ('feed_m', 'にんじんキューブ〔強化・中〕', 'Carrot Cube', 'STANDARD', 4, true, true, null, null, false, 'TRAINING', 'v4'),
  ('feed_l', '秘伝の飼い葉〔強化・大〕', 'Secret Feed', 'STANDARD', 6, true, true, null, null, false, 'TRAINING', 'v4'),
  ('feed_xl', '黄金の飼い葉〔強化・特大〕', 'Golden Feed', 'PREMIUM', 10, true, true, null, null, false, 'TRAINING', 'v4'),
  ('shield_1', '星霜の砂〔減衰よけ・1走〕', 'Aeon Sand', 'BASIC', 3, true, true, null, null, false, 'TRAINING', 'v4'),
  ('shield_3', '長期の休養〔減衰よけ・3走〕', 'Long Rest', 'STANDARD', 6, true, true, null, null, false, 'TRAINING', 'v4'),
  ('rain_cape_weak', '雨合羽〔雨・弱〕', 'Rain Cape (弱)', 'STANDARD', 5, true, true, null, null, false, 'RACE', 'v4'),
  ('rain_cape_mid', '雨合羽〔雨・中〕', 'Rain Cape (中)', 'STANDARD', 6, true, true, null, null, false, 'RACE', 'v4'),
  ('rain_cape_strong', '雨合羽〔雨・強〕', 'Rain Cape (強)', 'PREMIUM', 8, true, true, null, null, false, 'RACE', 'v4'),
  ('sun_hat_weak', '日よけ帽〔晴・弱〕', 'Sun Hat (弱)', 'STANDARD', 5, true, true, null, null, false, 'RACE', 'v4'),
  ('sun_hat_mid', '日よけ帽〔晴・中〕', 'Sun Hat (中)', 'STANDARD', 6, true, true, null, null, false, 'RACE', 'v4'),
  ('sun_hat_strong', '日よけ帽〔晴・強〕', 'Sun Hat (強)', 'PREMIUM', 8, true, true, null, null, false, 'RACE', 'v4'),
  ('mud_shoes_weak', '泥よけ蹄鉄〔道悪・弱〕', 'Mud Shoes (弱)', 'STANDARD', 5, true, true, null, null, false, 'RACE', 'v4'),
  ('mud_shoes_mid', '泥よけ蹄鉄〔道悪・中〕', 'Mud Shoes (中)', 'STANDARD', 6, true, true, null, null, false, 'RACE', 'v4'),
  ('mud_shoes_strong', '泥よけ蹄鉄〔道悪・強〕', 'Mud Shoes (強)', 'PREMIUM', 8, true, true, null, null, false, 'RACE', 'v4'),
  ('speed_shoes_weak', '快速蹄鉄〔良馬場・弱〕', 'Speed Shoes (弱)', 'STANDARD', 5, true, true, null, null, false, 'RACE', 'v4'),
  ('speed_shoes_mid', '快速蹄鉄〔良馬場・中〕', 'Speed Shoes (中)', 'STANDARD', 6, true, true, null, null, false, 'RACE', 'v4'),
  ('speed_shoes_strong', '快速蹄鉄〔良馬場・強〕', 'Speed Shoes (強)', 'PREMIUM', 8, true, true, null, null, false, 'RACE', 'v4'),
  ('turf_shoes_weak', '芝蹄鉄〔芝・弱〕', 'Turf Shoes (弱)', 'STANDARD', 5, true, true, null, null, false, 'RACE', 'v4'),
  ('turf_shoes_mid', '芝蹄鉄〔芝・中〕', 'Turf Shoes (中)', 'STANDARD', 6, true, true, null, null, false, 'RACE', 'v4'),
  ('turf_shoes_strong', '芝蹄鉄〔芝・強〕', 'Turf Shoes (強)', 'PREMIUM', 8, true, true, null, null, false, 'RACE', 'v4'),
  ('dirt_shoes_weak', '砂蹄鉄〔ダート・弱〕', 'Dirt Shoes (弱)', 'STANDARD', 5, true, true, null, null, false, 'RACE', 'v4'),
  ('dirt_shoes_mid', '砂蹄鉄〔ダート・中〕', 'Dirt Shoes (中)', 'STANDARD', 6, true, true, null, null, false, 'RACE', 'v4'),
  ('dirt_shoes_strong', '砂蹄鉄〔ダート・強〕', 'Dirt Shoes (強)', 'PREMIUM', 8, true, true, null, null, false, 'RACE', 'v4'),
  ('full_ready_std', '万全の備え〔全天候・並〕', 'Full Ready', 'STANDARD', 4, true, true, null, null, false, 'RACE', 'v4'),
  ('full_ready_max', '万全の備え・極〔全天候・上〕', 'Full Ready+', 'PREMIUM', 7, true, true, null, null, false, 'RACE', 'v4')
;
