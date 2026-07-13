import { burnSlotRangeV1, raceNightNameV2 } from '@sevendays/domain';
import { addDays, batchDateFor } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { ApiError } from '../errors.js';
import type { ApiRegistry } from '../router.js';

/**
 * Daily Derby live-status API (ADR-008, DAILY_DERBY_HANDOVER R1).
 *
 * Read-only, no idempotency concerns. Drives the /races live mode: phase,
 * clock sync, tonight's aggregate counts, an anonymized ticker and the
 * authenticated user's personal result. Counts are REAL numbers; the log
 * flood itself stays deterministic client-side generation (owner-approved
 * plan A — full per-horse logs would be tens of thousands of rows).
 */

const RACE_HOUR_UTC = 12; // 20:00 MYT

function nextDerbyAt(now: Date): string {
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RACE_HOUR_UTC, 0, 0, 0),
  );
  if (candidate.getTime() <= now.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate.toISOString();
}

export function registerDerbyEndpoints(registry: ApiRegistry): void {
  // Hall of Champions (ADR-011): every Day7 clearer, newest first. Owner is
  // masked (R3 display rules); no balances.
  registry.register({
    method: 'GET',
    path: '/api/v1/champions/hall',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query<{
        id: string;
        name: string;
        dna_hash: string;
        horse_type: string;
        rarity: string;
        email: string;
        day7_clear_date: string | null;
      }>(
        `select h.id, h.name, h.dna_hash, h.horse_type::text as horse_type,
                h.rarity::text as rarity, u.email,
                bb.day7_clear_date::text as day7_clear_date
         from horses h
         join users u on u.id = h.owner_user_id
         left join buybacks bb on bb.horse_id = h.id
         where h.status in ('DAY7_CLEARED', 'MEMORIALIZED')
         order by bb.day7_clear_date desc nulls last, h.id
         limit 60`,
        [],
      );
      return {
        champions: rows.rows.map((r) => ({
          horse_id: r.id,
          name: r.name,
          dna_hash: r.dna_hash,
          horse_type: r.horse_type,
          rarity: r.rarity,
          owner: r.email.endsWith('@user.sevendays')
            ? 'ウォレットユーザー'
            : `${r.email.slice(0, 2)}***`,
          cleared_at: r.day7_clear_date,
        })),
      };
    },
  });

  // ---- 20時スパイク対策(2026-07-12) --------------------------------------
  // status はショー窓(±10分)で全視聴者が5秒間隔でポーリングする最ホットパス。
  //  - 共有部分(バッチ状態・レース・集計・ティッカー・予報)は全ユーザー共通なので
  //    プロセス内キャッシュ(既定2秒 TTL・env DERBY_STATUS_CACHE_MS で調整/テストは0)。
  //    毎秒何百リクエスト来てもDBへは約2秒に1回になる。
  //  - 旧 `personal`(完了後の個人結果・毎ポーリング4〜5クエリ)はクライアント未使用
  //    だったため撤去(互換のため常に null を返す)。個人の夜結果は
  //    /daily-derby/my-results/:date が担う(ショー完了時に1回だけ取得される)。
  //  - 個人依存で残るのは YOUハイライト用の my_horses のみ(インデックス1クエリ)。
  //  - 日付絞りは created_at::date=… (非サージャブル) をやめ、範囲条件に変更。
  let statusShared: { key: string; at: number; body: Record<string, unknown> } | null = null;

  async function computeSharedStatus(
    client: SqlClient,
    now: Date,
    today: string,
  ): Promise<Record<string, unknown>> {
    const batch = await client.query<{
      id: string;
      status: string;
      created_at: string;
    }>(
      `select id, status::text as status, created_at::text as created_at
       from batch_runs where batch_date = $1`,
      [today],
    );
    const batchRow = batch.rows[0] ?? null;
    const phase = !batchRow
      ? 'WAITING'
      : batchRow.status === 'COMPLETED'
        ? 'COMPLETED'
        : batchRow.status === 'FAILED' || batchRow.status === 'PARTIAL_FAILED'
          ? 'FAILED_SAFE_MODE'
          : 'LIVE';

    // Tonight's race (if the batch exists).
    const race = batchRow
      ? await client.query<{
          id: string;
          participant_count: number | null;
          weather: string | null; track_condition: string | null; surface: string | null;
          status: string;
        }>(
          `select id, participant_count, weather::text as weather,
                  track_condition::text as track_condition, surface::text as surface,
                  status::text as status
           from races where batch_run_id = $1 limit 1`,
          [batchRow.id],
        )
      : null;
    const raceRow = race?.rows[0] ?? null;

    let counts = null;
    let ticker: string[] = [];

    if (raceRow) {
      const agg = await client.query<{
        burns: number;
        listed: number;
        assignments: number;
        mints: number;
      }>(
        `select
           (select count(*)::int from horse_burns where race_id = $1) as burns,
           (select count(*)::int from market_listings where batch_run_id = $2
              or (source = 'MANUAL'
                  and created_at >= $3::date and created_at < $3::date + interval '1 day')) as listed,
           (select count(*)::int from ownership_assignments
              where status = 'SETTLED'
                and created_at >= $3::date and created_at < $3::date + interval '1 day') as assignments,
           (select count(*)::int from horses
              where created_at >= $3::date and created_at < $3::date + interval '1 day') as mints`,
        [raceRow.id, batchRow!.id, today],
      );
      const a = agg.rows[0]!;
      counts = {
        horses: raceRow.participant_count ?? 0,
        burns: a.burns,
        buffs: a.burns,
        listed: a.listed,
        assignments: a.assignments,
        mints: a.mints,
      };

      // Anonymized ticker: recent settled matches / burns / day7 clears.
      const tick = await client.query<{ line: string; at: string }>(
        `(
          select 'SOLD — ' || h.name || ' ' || a.assigned_price::text || ' USDT' as line,
                 a.created_at::text as at
          from ownership_assignments a join horses h on h.id = a.horse_id
          where a.status = 'SETTLED'
            and a.created_at >= $2::date and a.created_at < $2::date + interval '1 day'
          order by a.created_at desc limit 8
        )
        union all
        (
          select 'BURN — ' || h.name, hb.created_at::text
          from horse_burns hb join horses h on h.id = hb.horse_id
          where hb.race_id = $1
          order by hb.created_at desc limit 6
        )
        union all
        (
          select 'DAY7 — ' || h.name || ' CLEARED', s.created_at::text
          from race_participant_snapshots s join horses h on h.id = s.horse_id
          where s.race_id = $1 and h.status = 'DAY7_CLEARED'
          limit 4
        )
        order by at desc limit 14`,
        [raceRow.id, today],
      );
      ticker = tick.rows.map((r) => r.line);
    }

    // ADR-012の予報を1クエリで2つ拾う:
    //  - 今夜分(=today)… 日中の待機パドックの掲示板用(2026-07-13追加。前夜の
    //    バッチが発表済みの「今夜の予報」— 従来は誰にも見えていなかった)
    //  - 明日分(=today+1)… ショー最終幕の「明日の予報」発表用
    const fc = await client.query<{
      forecast_date: string;
      forecast_weather: string;
      forecast_track: string;
      forecast_surface: string;
    }>(
      `select forecast_date::text as forecast_date,
              forecast_weather::text as forecast_weather,
              forecast_track::text as forecast_track,
              forecast_surface::text as forecast_surface
       from night_forecasts
       where forecast_date in ($1::date, $1::date + 1)`,
      [today],
    );
    const forecastOf = (date: string) => {
      const row = fc.rows.find((r) => r.forecast_date === date);
      return row
        ? { weather: row.forecast_weather, track: row.forecast_track, surface: row.forecast_surface }
        : null;
    };
    const tonightForecast = forecastOf(today);
    const tomorrowForecast = forecastOf(addDays(today, 1));

    // 次のレースの「全体の出走枠」(Decision 093候補・少頭数有利の可視化):
    // ACTIVE馬 − 手動出品中(Market Lockは欠場)。今夜の購入予約で生まれる馬は
    // 明晩からの出走なので、この数は日中に増えない(減るのは手動出品のみ)。
    // BURN枠は憲法のfloor則と率の器[8.0%,13.5%]だけから導く(常に真の上限)。
    const field = await client.query<{ entrants: number }>(
      `select count(*)::int as entrants from horses h
       where h.status = 'ACTIVE'
         and not exists (select 1 from market_listings ml
                         where ml.horse_id = h.id and ml.status = 'LISTED' and ml.source = 'MANUAL')`,
    );
    const entrants = field.rows[0]!.entrants;
    const slots = burnSlotRangeV1(entrants);

    return {
      tonight_field: { entrants, burn_slots_min: slots.min, burn_slots_max: slots.max },
      next_derby_at: nextDerbyAt(now),
      phase,
      live_started_at: batchRow?.created_at ?? null,
      conditions: raceRow?.surface
        ? {
            weather: raceRow.weather,
            track: raceRow.track_condition,
            surface: raceRow.surface,
            night_name: raceNightNameV2({
              weather: raceRow.weather as never,
              track: raceRow.track_condition as never,
              surface: raceRow.surface as never,
            }),
          }
        : null,
      counts,
      ticker,
      tonight_forecast: tonightForecast,
      tomorrow_forecast: tomorrowForecast,
    };
  }

  registry.register({
    method: 'GET',
    path: '/api/v1/daily-derby/status',
    auth: 'user',
    handler: async (ctx) => {
      const now = new Date();
      const today = batchDateFor(now);

      const ttl = Number(process.env.DERBY_STATUS_CACHE_MS ?? 2000);
      let shared: Record<string, unknown>;
      if (statusShared && statusShared.key === today && Date.now() - statusShared.at < ttl) {
        shared = statusShared.body;
      } else {
        shared = await computeSharedStatus(ctx.client, now, today);
        statusShared = { key: today, at: Date.now(), body: shared };
      }

      // For the YOU-highlight in the log flood (owner plan A). 個人依存はこの1クエリのみ。
      // trained_for_next_race(2026-07-13 待機パドック): 追加往復なしのEXISTSで
      // 「次のレースに向けて調教済みか」を同じ1クエリに載せる。効力日は
      // GET /horses と同じ規則(当日バッチ完了後は翌日扱い)— sharedのphaseで判定。
      const effectiveRaceDate = shared.phase === 'COMPLETED' ? addDays(today, 1) : today;
      const myHorses = await ctx.client.query<{
        name: string; dna_hash: string; current_day: number; trained_for_next_race: boolean;
      }>(
        `select h.name, h.dna_hash, h.current_day,
                exists(
                  select 1 from training_sessions t
                  where t.horse_id = h.id and t.effective_race_date = $2
                ) as trained_for_next_race
         from horses h where h.owner_user_id = $1 and h.status = 'ACTIVE' limit 200`,
        [ctx.userId, effectiveRaceDate],
      );

      return {
        ...shared,
        server_time: now.toISOString(),
        next_derby_at: nextDerbyAt(now), // server_timeと同時刻基準(キャッシュより新鮮に)
        personal: null, // 旧フィールド互換(2026-07-12撤去 — 実個人結果は my-results/:date)
        my_horse_names: myHorses.rows.map((r) => r.name),
        my_horses: myHorses.rows,
      };
    },
  });

  // あなたのレース記録(オーナー指示 2026-07-10): 日付ごとの自分の
  // BURN(使用アイテム+ドロップ込み)/生存(DAY7込み)/P2P売却・購入/新規発行の
  // アーカイブ — 審判演出の記録版。:date は 'latest' か YYYY-MM-DD。
  // 相手ユーザーは Hall of Champions と同じマスク規則(R3)。
  registry.register({
    method: 'GET',
    path: '/api/v1/daily-derby/my-results/:date',
    auth: 'user',
    handler: async (ctx) => {
      const datesQ = await ctx.client.query<{ batch_date: string }>(
        `select distinct b.batch_date::text as batch_date
         from batch_runs b
         join races r on r.batch_run_id = b.id
         where r.status = 'FINALIZED'
         order by batch_date desc
         limit 30`,
        [],
      );
      const dates = datesQ.rows.map((r) => r.batch_date);
      const requested = ctx.params.date === 'latest' ? dates[0] : ctx.params.date;
      const empty = { dates, conditions: null, burned: [], survived: [], sold: [], bought: [] };
      if (!requested) return { date: null, ...empty };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
        throw new ApiError('VALIDATION_FAILED', 'date must be YYYY-MM-DD or latest');
      }

      const race = await ctx.client.query<{
        id: string;
        batch_run_id: string;
        weather: string | null;
        track_condition: string | null;
        surface: string | null;
      }>(
        `select r.id, r.batch_run_id, r.weather::text as weather,
                r.track_condition::text as track_condition, r.surface::text as surface
         from races r join batch_runs b on b.id = r.batch_run_id
         where b.batch_date = $1 and r.status = 'FINALIZED'
         limit 1`,
        [requested],
      );
      const raceRow = race.rows[0] ?? null;
      if (!raceRow) return { date: requested, ...empty };
      // その日のレース条件(オーナー指示 2026-07-10: 記録カレンダーに必ず表示)
      const dayConditions = raceRow.surface
        ? {
            weather: raceRow.weather,
            track: raceRow.track_condition,
            surface: raceRow.surface,
            night_name: raceNightNameV2({
              weather: raceRow.weather as never,
              track: raceRow.track_condition as never,
              surface: raceRow.surface as never,
            }),
          }
        : null;

      const mask = (email: string | null): string =>
        !email
          ? '—'
          : email.endsWith('@user.sevendays')
            ? 'ウォレットユーザー'
            : `${email.slice(0, 2)}***`;

      const burned = await ctx.client.query<{
        name: string;
        dna_hash: string;
        day: number | null;
        used_item_key: string | null;
        drop_item_key: string | null;
      }>(
        `select h.name, h.dna_hash, s.current_day as day,
                iu.item_key as used_item_key, ui.item_key as drop_item_key
         from horse_burns hb
         join horses h on h.id = hb.horse_id
         left join race_participant_snapshots s on s.race_id = hb.race_id and s.horse_id = hb.horse_id
         left join item_usages iu on iu.horse_id = hb.horse_id
           and iu.effective_race_date = $2::date and iu.status <> 'CANCELLED'
         left join user_items ui on ui.source_burn_event_id = hb.burn_event_id
         where hb.race_id = $3 and hb.owner_user_id_at_snapshot = $1
         order by h.name`,
        [ctx.userId, requested, raceRow.id],
      );

      const survived = await ctx.client.query<{
        name: string;
        dna_hash: string;
        from_day: number;
      }>(
        `select h.name, h.dna_hash, s.current_day as from_day
         from race_participant_snapshots s
         join horses h on h.id = s.horse_id
         left join horse_burns hb on hb.race_id = s.race_id and hb.horse_id = s.horse_id
         where s.race_id = $2 and s.owner_user_id = $1 and hb.id is null
         order by s.current_day desc, h.name`,
        [ctx.userId, raceRow.id],
      );

      const sold = await ctx.client.query<{
        name: string;
        dna_hash: string;
        price: string;
        day: number | null;
        buyer_email: string | null;
      }>(
        `select h.name, h.dna_hash, a.assigned_price::text as price,
                l.current_day as day, u.email as buyer_email
         from ownership_assignments a
         join horses h on h.id = a.horse_id
         join users u on u.id = a.buyer_user_id
         left join market_listings l on l.id = a.market_listing_id
         where a.seller_user_id = $1 and a.status = 'SETTLED' and a.batch_run_id = $2
         order by h.name`,
        [ctx.userId, raceRow.batch_run_id],
      );

      const bought = await ctx.client.query<{
        name: string;
        dna_hash: string;
        price: string;
        day: number | null;
        is_mint: boolean;
        seller_email: string | null;
      }>(
        `select h.name, h.dna_hash, a.assigned_price::text as price,
                coalesce(l.current_day, 0) as day,
                (a.market_listing_id is null) as is_mint,
                u.email as seller_email
         from ownership_assignments a
         join horses h on h.id = a.horse_id
         left join users u on u.id = a.seller_user_id
         left join market_listings l on l.id = a.market_listing_id
         where a.buyer_user_id = $1 and a.status = 'SETTLED' and a.batch_run_id = $2
         order by h.name`,
        [ctx.userId, raceRow.batch_run_id],
      );

      return {
        date: requested,
        dates,
        conditions: dayConditions,
        burned: burned.rows.map((r) => ({
          name: r.name,
          dna_hash: r.dna_hash,
          day: r.day,
          used_item_key: r.used_item_key,
          drop_item_key: r.drop_item_key,
        })),
        survived: survived.rows.map((r) => ({
          name: r.name,
          dna_hash: r.dna_hash,
          from_day: r.from_day,
          to_day: Math.min(7, r.from_day + 1),
          day7: r.from_day === 6,
        })),
        sold: sold.rows.map((r) => ({
          name: r.name,
          dna_hash: r.dna_hash,
          price: r.price,
          day: r.day,
          counterpart: mask(r.buyer_email),
        })),
        bought: bought.rows.map((r) => ({
          name: r.name,
          dna_hash: r.dna_hash,
          price: r.price,
          day: r.day,
          is_mint: r.is_mint,
          counterpart: r.is_mint ? null : mask(r.seller_email),
        })),
      };
    },
  });

  /* ---- 透明性台帳(オーナー承認 2026-07-10) --------------------------------
     BURN率の宣言をやめ、毎晩の実データそのものを公開する。数値は全て実テーブル由来・
     率は返さない(見る側が算出する)。ユーザーは匿名ID(uuidのmd5先頭4桁)のみ。
     アイテム使用・運営ウォレット・メール・実IDは出さない。 */

  // 日次集計(直近60日)。台帳カレンダーと月次CSVの元データ。
  registry.register({
    method: 'GET',
    path: '/api/v1/transparency/summary',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query<{
        date: string;
        race_id: string;
        participants: number;
        burned: number;
        day7: number;
        matched: number;
        matched_volume: string;
        mints: number;
        weather: string | null;
        track_condition: string | null;
        surface: string | null;
        burn_rate: string | null;
      }>(
        `select b.batch_date::text as date, r.id as race_id,
                r.participant_count as participants,
                r.weather::text as weather, r.track_condition::text as track_condition,
                r.surface::text as surface,
                r.burn_rate::text as burn_rate,
                (select count(*)::int from horse_burns hb where hb.race_id = r.id) as burned,
                (select count(*)::int from race_participant_snapshots s
                   left join horse_burns hb2 on hb2.race_id = s.race_id and hb2.horse_id = s.horse_id
                  where s.race_id = r.id and hb2.id is null and s.current_day = 6) as day7,
                (select count(*)::int from ownership_assignments a
                  where a.batch_run_id = b.id and a.status = 'SETTLED') as matched,
                (select coalesce(sum(a.assigned_price), 0)::text from ownership_assignments a
                  where a.batch_run_id = b.id and a.status = 'SETTLED') as matched_volume,
                (select count(*)::int from ownership_assignments a
                  where a.batch_run_id = b.id and a.status = 'SETTLED'
                    and a.market_listing_id is null) as mints
         from batch_runs b
         join races r on r.batch_run_id = b.id
         where r.status = 'FINALIZED'
         order by b.batch_date desc
         limit 60`,
        [],
      );
      return {
        days: rows.rows.map((r) => ({
          ...r,
          survived: Math.max(0, (r.participants ?? 0) - r.burned),
        })),
      };
    },
  });

  // 日次詳細: 集計+匿名の成約一覧(高額順・上限500)。
  registry.register({
    method: 'GET',
    path: '/api/v1/transparency/day/:date',
    auth: 'user',
    handler: async (ctx) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.params.date ?? '')) {
        throw new ApiError('VALIDATION_FAILED', 'date must be YYYY-MM-DD');
      }
      const race = await ctx.client.query<{ id: string; batch_run_id: string }>(
        `select r.id, r.batch_run_id
         from races r join batch_runs b on b.id = r.batch_run_id
         where b.batch_date = $1 and r.status = 'FINALIZED' limit 1`,
        [ctx.params.date],
      );
      const raceRow = race.rows[0] ?? null;
      if (!raceRow) return { date: ctx.params.date, race_id: null, trades: [] };
      const trades = await ctx.client.query<{
        horse_name: string;
        price: string;
        is_mint: boolean;
        day: number;
        buyer_anon: string;
        seller_anon: string | null;
      }>(
        `select h.name as horse_name, a.assigned_price::text as price,
                (a.market_listing_id is null) as is_mint,
                coalesce(l.current_day, 0) as day,
                'U-' || substr(encode(digest(a.buyer_user_id::text, 'md5'), 'hex'), 1, 4) as buyer_anon,
                case when a.seller_user_id is null then null
                     else 'U-' || substr(encode(digest(a.seller_user_id::text, 'md5'), 'hex'), 1, 4)
                end as seller_anon
         from ownership_assignments a
         join horses h on h.id = a.horse_id
         left join market_listings l on l.id = a.market_listing_id
         where a.batch_run_id = $1 and a.status = 'SETTLED'
         order by a.assigned_price desc, h.name
         limit 500`,
        [raceRow.batch_run_id],
      );
      return { date: ctx.params.date, race_id: raceRow.id, trades: trades.rows };
    },
  });

  // 日次CSV用: 全馬の結果(順位・馬名・Day・スコア・BURN)。上限5000。
  registry.register({
    method: 'GET',
    path: '/api/v1/transparency/day/:date/results',
    auth: 'user',
    handler: async (ctx) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.params.date ?? '')) {
        throw new ApiError('VALIDATION_FAILED', 'date must be YYYY-MM-DD');
      }
      const race = await ctx.client.query<{ id: string }>(
        `select r.id from races r join batch_runs b on b.id = r.batch_run_id
         where b.batch_date = $1 and r.status = 'FINALIZED' limit 1`,
        [ctx.params.date],
      );
      const raceRow = race.rows[0] ?? null;
      if (!raceRow) return { date: ctx.params.date, results: [], total: 0 };
      const total = await ctx.client.query<{ n: number }>(
        `select count(*)::int as n from race_results where race_id = $1`,
        [raceRow.id],
      );
      const rows = await ctx.client.query<{
        final_rank: number;
        horse_name: string;
        day: number;
        final_score: string;
        is_burned: boolean;
      }>(
        `select rr.final_rank, h.name as horse_name, s.current_day as day,
                rr.final_score::text as final_score, rr.is_burned
         from race_results rr
         join horses h on h.id = rr.horse_id
         left join race_participant_snapshots s on s.race_id = rr.race_id and s.horse_id = rr.horse_id
         where rr.race_id = $1
         order by rr.final_rank
         limit 5000`,
        [raceRow.id],
      );
      return { date: ctx.params.date, results: rows.rows, total: total.rows[0]!.n };
    },
  });
}
