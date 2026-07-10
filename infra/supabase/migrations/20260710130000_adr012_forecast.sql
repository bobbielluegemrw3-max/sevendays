-- ADR-012 フェーズ2b: 天気予報のシード・ライフサイクル
--
-- 今夜のバッチ(CREATE_RACES)で「翌夜の条件シード」を生成し、
--   - commit_hash を即時公開(後出し防止のコミット)
--   - 予報3軸(deriveNightForecastV1(seed).forecast)を保存(ショー最終幕で発表)
--   - seed 本体はこの行に秘匿(race_seed_escrow と同じ考え方)
-- 翌夜のバッチはこの seed から実際の条件(actual)を導出し、
-- レース後の REVEAL_RACE_SEEDS で revealed_at を打って seed を公開扱いにする。
-- 行が無い日(初日・移行期)はレースシード由来の従来導出にフォールバックする。

create table night_forecasts (
  id uuid primary key default gen_random_uuid(),
  forecast_date date not null unique,
  seed text not null,
  commit_hash text not null,
  forecast_weather weather not null,
  forecast_track track_condition not null,
  forecast_surface surface not null,
  created_at timestamptz not null default now(),
  revealed_at timestamptz
);

-- 秘匿: サービスロールのみ(公開はAPI経由で commit_hash・予報値・リビール後のseedに限る)
alter table night_forecasts enable row level security;

create trigger trg_night_forecasts_no_delete
before delete on night_forecasts
for each row execute function forbid_delete();
