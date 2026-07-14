-- Decision 095: セミナー特典馬(プロモ配布)。
--
-- 運営厩舎(通常の購入予約で仕入れた馬)から、セミナー参加者へ1人1頭を配布する。
-- 配布経路は2つ: ①管理者の直接配布 ②引換コード(参加者がセルフ入力)。
-- 配布馬はDecision 094のgifted_atが付く=手動出品不可(ボーナスチップ性質)。
-- 割当は若いDAY優先(残った古株は運営で走り切らせて自己清算)。

create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  campaign text not null,
  created_by uuid not null references users (id),
  expires_at timestamptz,
  redeemed_by uuid references users (id),
  redeemed_at timestamptz,
  horse_id uuid references horses (id),
  created_at timestamptz not null default now(),
  constraint chk_promo_redeemed check ((redeemed_by is null) = (redeemed_at is null))
);

-- 1ユーザー1回/キャンペーン(コード使い回し・複数コード取得の両方を防ぐ)
create unique index uq_promo_redeemer_per_campaign
  on promo_codes (campaign, redeemed_by) where redeemed_by is not null;
create index idx_promo_codes_campaign on promo_codes (campaign, created_at desc);
