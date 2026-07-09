-- レース条件v2(Decision 082): パチスロ的な「アイテム設定1〜6」を廃止し、
-- 競馬の言葉(天候×馬場状態×コース)へ置換する。
--   ・天候/馬場状態は既存のエンジン中核(シード由来・スコア影響あり)をそのまま使用
--   ・コース(芝/ダート)を新設 — アイテム効果係数のみに影響(経済中立)
--   ・アイテム係数はカタログ公開の「適性」×当夜条件で決まる(x0.5..x1.5、EV~1.0)
-- ローンチ前のため item_setting はクリーンに撤去する。

create type surface as enum ('TURF', 'DIRT');

-- 開示された条件はracesにも記録する(公開API/管理画面の参照面。
-- 検証の正はスナップショット+シード導出)。
alter table races add column weather weather;
alter table races add column track_condition track_condition;
alter table races add column surface surface;
alter table races drop column item_setting;

-- ---------------------------------------------------------------------------
-- カタログv2(Decision 082 総入替): 26種継続 + 9種を条件テーマ装備に交代。
-- 退役キーは active=false(保有在庫のFK/リプレイは温存 — 効果コードも残置)。
-- ---------------------------------------------------------------------------

update item_catalog set active = false where key in (
  'iron_horseshoe', 'morning_dew', 'carrot_bundle',
  'endurance_wrap', 'sprint_spurs', 'veteran_blanket', 'twin_horseshoes',
  'war_banner', 'golden_charm'
);

insert into item_catalog (key, name_ja, name_en, band, price, sellable, giftable, usable_day_min, usable_day_max)
values
  ('turf_spikes',         '芝用スパイク',        'Turf Spikes',            'BASIC',    2, true, true, null, null),
  ('dirt_shoes',          'ダート蹄鉄',          'Dirt Shoes',             'BASIC',    2, true, true, null, null),
  ('rain_hood',           '雨天フード',          'Rain Hood',              'BASIC',    2, true, true, null, null),
  ('firm_plates',         '高速馬場プレート',    'Fast-Track Plates',      'STANDARD', 4, true, true, null, null),
  ('mud_guards',          '泥除けガード',        'Mud Guards',             'STANDARD', 4, true, true, null, null),
  ('turf_master_saddle',  '芝の名手の鞍',        'Turf Master Saddle',     'STANDARD', 4, true, true, null, null),
  ('dirt_master_saddle',  'ダートの名手の鞍',    'Dirt Master Saddle',     'STANDARD', 4, true, true, null, null),
  ('storm_emperor_cloak', '嵐帝のマント',        'Storm Emperor''s Cloak', 'PREMIUM',  7, true, true, null, null),
  ('mudlord_crown',       '泥王の冠',            'Mudlord''s Crown',       'PREMIUM',  6, true, true, null, null)
on conflict (key) do nothing;
