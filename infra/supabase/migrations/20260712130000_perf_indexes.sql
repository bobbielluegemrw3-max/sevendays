-- 20時スパイク対策のインデックス(2026-07-12)
-- derby status / market place / GET horses のホットクエリを範囲条件+索引化した
-- 変更に対応する。既存: idx_assignments_batch/buyer/seller,
-- idx_horses_owner/status_day/last_listed, idx_listings_status_listed/seller/batch,
-- idx_notifications_user_created/unread。

-- 当日の成約集計・ティッカー・直近成約(order by created_at desc limit N)
create index idx_assignments_created on ownership_assignments (created_at desc);

-- 当日の新規発行カウント(created_at範囲)
create index idx_horses_created on horses (created_at);

-- GET /horses(owner絞り+created_at desc並び・最大500件)
create index idx_horses_owner_created on horses (owner_user_id, created_at desc);

-- 当日の手動出品カウント(created_at範囲・MANUALのみ)
create index idx_listings_manual_created on market_listings (created_at)
  where source = 'MANUAL';
