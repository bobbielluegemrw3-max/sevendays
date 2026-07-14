-- Decision 094: 馬のユーザー間転送(ギフト)。
--
-- 法務整理: USDTのユーザー間送金は不可のまま。馬は「ゲーム内資産の移動」として
-- 転送可能だが、譲渡された馬は手動出品不可(gifted_atで恒久マーク)。
-- 換金経路はレース結果(チャンピオン/BURN)かスマート出品(エンジン選定)のみ —
-- どちらも本人が制御できず毎晩BURNリスクを負う = 換金手段にならない。
-- スマート出品の対象からは除外しない(「送り合って売却回避」のメタを防ぐ)。
--
-- user_transfers は Decision 079 の汎用資産転送テーブル — HORSE を追加。
-- 冪等キーは horse-gift:{horseId}:{batchDate}(同じ馬の転送は1日1回 =
-- 同日中のA→B→C式の連鎖も構造的に不可)。

alter table horses add column gifted_at timestamptz;

alter table user_transfers add column horse_id uuid references horses (id);

alter table user_transfers drop constraint user_transfers_asset;
alter table user_transfers drop constraint user_transfers_asset_type_check;
alter table user_transfers add constraint user_transfers_asset_type_check
  check (asset_type in ('ITEM', 'USDT', 'HORSE'));
alter table user_transfers add constraint user_transfers_asset check (
  (asset_type = 'ITEM' and user_item_id is not null and amount is null and horse_id is null)
  or (asset_type = 'USDT' and user_item_id is null and amount > 0 and horse_id is null)
  or (asset_type = 'HORSE' and horse_id is not null and user_item_id is null and amount is null)
);
