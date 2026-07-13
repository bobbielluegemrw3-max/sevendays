-- Decision 090 (2026-07-13, Owner): 運営ルートチェーン(縦一列)の構築。
--
--   1段目 goldbenchan+7@gmail.com  ← 最上位(運営ルート)
--   2段目 goldbenchan+6@gmail.com
--   3段目 goldbenchan+5@gmail.com
--   4段目 goldbenchan+4@gmail.com
--   5段目 goldbenchan+3@gmail.com
--   6段目 goldbenchan+2@gmail.com
--   7段目 goldbenchan@gmail.com   ← 本体(無紹介登録者の既定スポンサー)
--   8段目 kusanokiyoshi1@gmail.com
--   9段目 guri.baggio@gmail.com
--
-- 狙い: 無紹介登録者を本体直下に自動帰属させると、そのBURNボーナス
-- (上位7ティア: 本体+2〜+7)が全額運営チェーンに収まる(=プール)。
-- エイリアス行はGoogleが+付きを同一アカウント扱いするためログイン不能な
-- 「構造ノード」— 残高は後日、管理者調整(二重承認)で本体/準備金へ移す運用。
--
-- ガード: goldbenchan@gmail.com が存在する環境(=本番)でのみ実行。
-- テストDB(PGlite)や新環境では何もしない。冪等(+7が居れば再実行スキップ)。
-- referral_code はINSERTトリガーが決定論生成、placed_at はplacementトリガーが設定。

do $$
declare
  root7 uuid; a6 uuid; a5 uuid; a4 uuid; a3 uuid; a2 uuid;
  gold uuid; kusano uuid; guri uuid;
begin
  select id into gold from users where email = 'goldbenchan@gmail.com';
  if gold is null then
    return; -- 本番以外では何もしない
  end if;
  if exists (select 1 from users where email = 'goldbenchan+7@gmail.com') then
    return; -- 構築済み(冪等)
  end if;

  select id into kusano from users where email = 'kusanokiyoshi1@gmail.com';
  select id into guri from users where email = 'guri.baggio@gmail.com';

  insert into users (id, email)
    values (gen_random_uuid(), 'goldbenchan+7@gmail.com') returning id into root7;
  insert into users (id, email, direct_referrer_user_id, placement_parent_user_id)
    values (gen_random_uuid(), 'goldbenchan+6@gmail.com', root7, root7) returning id into a6;
  insert into users (id, email, direct_referrer_user_id, placement_parent_user_id)
    values (gen_random_uuid(), 'goldbenchan+5@gmail.com', a6, a6) returning id into a5;
  insert into users (id, email, direct_referrer_user_id, placement_parent_user_id)
    values (gen_random_uuid(), 'goldbenchan+4@gmail.com', a5, a5) returning id into a4;
  insert into users (id, email, direct_referrer_user_id, placement_parent_user_id)
    values (gen_random_uuid(), 'goldbenchan+3@gmail.com', a4, a4) returning id into a3;
  insert into users (id, email, direct_referrer_user_id, placement_parent_user_id)
    values (gen_random_uuid(), 'goldbenchan+2@gmail.com', a3, a3) returning id into a2;

  -- 既存アカウントの帰属(null→設定は許可されている)
  update users set direct_referrer_user_id = a2, placement_parent_user_id = a2 where id = gold;
  if kusano is not null then
    update users set direct_referrer_user_id = gold, placement_parent_user_id = gold where id = kusano;
  end if;
  if guri is not null and kusano is not null then
    update users set direct_referrer_user_id = kusano, placement_parent_user_id = kusano where id = guri;
  end if;

  -- 監査痕跡(actor=本体・Decision 090)
  insert into placement_audit (user_id, old_parent_user_id, new_parent_user_id, actor_user_id, action, reason)
  values
    (a6, null, root7, gold, 'PLACE', 'Decision 090: operator root chain'),
    (a5, null, a6, gold, 'PLACE', 'Decision 090: operator root chain'),
    (a4, null, a5, gold, 'PLACE', 'Decision 090: operator root chain'),
    (a3, null, a4, gold, 'PLACE', 'Decision 090: operator root chain'),
    (a2, null, a3, gold, 'PLACE', 'Decision 090: operator root chain'),
    (gold, null, a2, gold, 'PLACE', 'Decision 090: operator root chain');
  if kusano is not null then
    insert into placement_audit (user_id, old_parent_user_id, new_parent_user_id, actor_user_id, action, reason)
    values (kusano, null, gold, gold, 'PLACE', 'Decision 090: operator root chain');
  end if;
  if guri is not null and kusano is not null then
    insert into placement_audit (user_id, old_parent_user_id, new_parent_user_id, actor_user_id, action, reason)
    values (guri, null, kusano, gold, 'PLACE', 'Decision 090: operator root chain');
  end if;
end $$;
