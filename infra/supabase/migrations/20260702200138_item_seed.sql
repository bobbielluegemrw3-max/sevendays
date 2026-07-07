-- Item System v1 seed (separate file: uses enum values added in 137)

insert into ledger_accounts (owner_type, owner_id, account_type, currency)
values ('PLATFORM', null, 'PLATFORM_ITEM_CLEARING', 'USDT');

insert into item_catalog (key, name_ja, name_en, band, price, sellable, giftable, usable_day_min, usable_day_max)
values
  ('speed_feed', 'スピードフィード', 'Speed Feed', 'BASIC', 2, true, true, null, null),
  ('power_feed', 'パワーフィード', 'Power Feed', 'BASIC', 2, true, true, null, null),
  ('recovery_feed', 'リカバリーフィード', 'Recovery Feed', 'BASIC', 2, true, true, null, null),
  ('sugar_cube', '角砂糖', 'Sugar Cube', 'BASIC', 1, true, true, null, null),
  ('mint_herb', 'ミントハーブ', 'Mint Herb', 'BASIC', 1, true, true, null, null),
  ('salt_lick', '岩塩ブロック', 'Salt Lick', 'BASIC', 2, true, true, null, null),
  ('cool_towel', 'クールタオル', 'Cool Towel', 'BASIC', 1, true, true, null, null),
  ('chamomile', 'カモミールの束', 'Chamomile Bundle', 'BASIC', 2, true, true, null, null),
  ('four_leaf_clover', '四つ葉のクローバー', 'Four-Leaf Clover', 'BASIC', 2, true, true, null, null),
  ('iron_horseshoe', '鉄の蹄鉄', 'Iron Horseshoe', 'BASIC', 2, true, true, null, null),
  ('morning_dew', '朝露の雫', 'Morning Dew', 'BASIC', 1, true, true, null, null),
  ('carrot_bundle', 'にんじん束', 'Carrot Bundle', 'BASIC', 1, true, true, null, null),
  ('lucky_charm', 'ラッキーチャーム', 'Lucky Charm', 'STANDARD', 3, true, true, null, null),
  ('double_feed', 'ダブルフィード', 'Double Feed', 'STANDARD', 4, true, true, null, null),
  ('deep_rest_kit', '深休みキット', 'Deep Rest Kit', 'STANDARD', 3, true, true, null, null),
  ('spa_treatment', 'スパトリートメント', 'Spa Treatment', 'STANDARD', 4, true, true, null, null),
  ('focus_bridle', '集中の頭絡', 'Focus Bridle', 'STANDARD', 3, true, true, null, null),
  ('comeback_tonic', 'カムバックトニック', 'Comeback Tonic', 'STANDARD', 3, true, true, null, null),
  ('storm_cloak', 'ストームクローク', 'Storm Cloak', 'STANDARD', 3, true, true, null, null),
  ('sunny_visor', 'サニーバイザー', 'Sunny Visor', 'STANDARD', 3, true, true, null, null),
  ('endurance_wrap', '持久のラップ', 'Endurance Wrap', 'STANDARD', 4, true, true, null, null),
  ('sprint_spurs', '疾走の拍車', 'Sprint Spurs', 'STANDARD', 4, true, true, null, null),
  ('veteran_blanket', '古馬の毛布', 'Veteran''s Blanket', 'STANDARD', 4, true, true, null, null),
  ('twin_horseshoes', '双子の蹄鉄', 'Twin Horseshoes', 'STANDARD', 4, true, true, null, null),
  ('champion_saddle', 'チャンピオンの鞍', 'Champion''s Saddle', 'PREMIUM', 7, true, true, 5, 6),
  ('royal_feast', 'ロイヤルフィースト', 'Royal Feast', 'PREMIUM', 6, true, true, null, null),
  ('miracle_water', 'ミラクルウォーター', 'Miracle Water', 'PREMIUM', 5, true, true, null, null),
  ('golden_charm', 'ゴールデンチャーム', 'Golden Charm', 'PREMIUM', 6, true, true, null, null),
  ('war_banner', '戦旗', 'War Banner', 'PREMIUM', 7, true, true, null, null),
  ('phoenix_feather', '不死鳥の羽根', 'Phoenix Feather', 'PREMIUM', 5, true, true, null, null),
  ('memento_horseshoe', '形見の蹄鉄', 'Memento Horseshoe', 'BURN_DROP', 0, false, true, null, null),
  ('memorial_wreath', '追悼の花冠', 'Memorial Wreath', 'BURN_DROP', 0, false, true, null, null),
  ('legacy_mane', '遺志のたてがみ', 'Legacy Mane', 'BURN_DROP', 0, false, true, null, null),
  ('spirit_roar', '咆哮の魂', 'Spirit Roar', 'BURN_DROP', 0, false, true, null, null),
  ('stardust_sand', '星霜の砂', 'Stardust Sand', 'BURN_DROP', 0, false, true, null, null);
