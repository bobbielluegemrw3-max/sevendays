-- Decision 097: 厩舎名(stable name)。
--
-- 馬は毎日P2Pで入れ替わるが厩舎は残る — ユーザーの公開アイデンティティ。
-- アカウントページから設定(2〜20文字・一意・1日1回変更)。表示は
-- ①マイ厩舎タイトル ②成約/ギフト等の人物表示 ③組織マップ(厩舎名+マスクメール。
-- メールは全段マスク — 配置により面識のない直紹介があり得るためオーナー決定)。

alter table users add column stable_name text
  check (stable_name is null or char_length(stable_name) between 2 and 20);
alter table users add column stable_name_changed_on date;

-- 一意(大文字小文字区別なし)。「同名厩舎が2つ」は世界観を壊す。
create unique index uq_users_stable_name
  on users (lower(stable_name)) where stable_name is not null;
