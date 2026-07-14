-- Decision 098: メンテナンスモード。
--
-- 運用スイッチ: ONの間、一般ユーザー(未ログイン含む)は画面もAPIも遮断され
-- メンテナンス画面だけが出る。管理者(admin_role_grants保持者)はログイン
-- 含め全機能を通常どおり使える。ワーカー(internal認証)と/healthzは対象外
-- — 20:00バッチはメンテナンス中も走る(止めたい場合は別の判断)。
--
-- system_settings は汎用のキー値ストア(サービス専用・RLSポリシーなし)。
-- 将来の運用フラグもここに足す。

create table system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table system_settings enable row level security; -- ポリシーなし = サービスロール専用

insert into system_settings (key, value)
values ('maintenance', jsonb_build_object('enabled', false, 'message', ''));
