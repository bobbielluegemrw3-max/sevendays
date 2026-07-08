import { batchDateFor } from '@sevendays/shared';
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

  registry.register({
    method: 'GET',
    path: '/api/v1/daily-derby/status',
    auth: 'user',
    handler: async (ctx) => {
      const now = new Date();
      const today = batchDateFor(now);

      const batch = await ctx.client.query<{
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
        ? await ctx.client.query<{
            id: string;
            participant_count: number | null;
            item_setting: number | null;
            status: string;
          }>(
            `select id, participant_count, item_setting, status::text as status
             from races where batch_run_id = $1 limit 1`,
            [batchRow.id],
          )
        : null;
      const raceRow = race?.rows[0] ?? null;

      let counts = null;
      let ticker: string[] = [];
      let personal: Record<string, unknown> | null = null;

      if (raceRow) {
        const agg = await ctx.client.query<{
          burns: number;
          listed: number;
          assignments: number;
          mints: number;
        }>(
          `select
             (select count(*)::int from horse_burns where race_id = $1) as burns,
             (select count(*)::int from market_listings where batch_run_id = $2
                or (source = 'MANUAL' and created_at::date = $3::date)) as listed,
             (select count(*)::int from ownership_assignments
                where status = 'SETTLED' and created_at::date = $3::date) as assignments,
             (select count(*)::int from horses where created_at::date = $3::date) as mints`,
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
        const tick = await ctx.client.query<{ line: string; at: string }>(
          `(
            select 'SOLD — ' || h.name || ' ' || a.assigned_price::text || ' USDT' as line,
                   a.created_at::text as at
            from ownership_assignments a join horses h on h.id = a.horse_id
            where a.status = 'SETTLED' and a.created_at::date = $2::date
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

        // Personal result — priority DAY7 > SOLD > BURNED > SURVIVED.
        if (phase === 'COMPLETED') {
          const day7 = await ctx.client.query<{ name: string; dna_hash: string }>(
            `select h.name, h.dna_hash
             from race_participant_snapshots s join horses h on h.id = s.horse_id
             where s.race_id = $2 and s.owner_user_id = $1 and h.status = 'DAY7_CLEARED'
             limit 1`,
            [ctx.userId, raceRow.id],
          );
          const sold = await ctx.client.query<{
            name: string;
            dna_hash: string;
            current_day: number;
            price: string;
          }>(
            `select h.name, h.dna_hash, l.current_day, a.assigned_price::text as price
             from ownership_assignments a
             join market_listings l on l.id = a.market_listing_id
             join horses h on h.id = a.horse_id
             where l.seller_user_id = $1 and a.status = 'SETTLED' and a.created_at::date = $2::date
             limit 1`,
            [ctx.userId, today],
          );
          const bought = await ctx.client.query<{
            name: string;
            dna_hash: string;
            current_day: number;
          }>(
            `select h.name, h.dna_hash, h.current_day
             from ownership_assignments a join horses h on h.id = a.horse_id
             where a.buyer_user_id = $1 and a.status = 'SETTLED' and a.created_at::date = $2::date
             limit 1`,
            [ctx.userId, today],
          );
          const burned = await ctx.client.query<{
            name: string;
            dna_hash: string;
            buff: string | null;
          }>(
            `select h.name, h.dna_hash,
                    (select rb.buff_rarity::text from revenge_buffs rb
                      where rb.user_id = $1 and rb.status in ('ACTIVE','APPLIED')
                      limit 1) as buff
             from horse_burns hb join horses h on h.id = hb.horse_id
             where hb.owner_user_id_at_snapshot = $1 and hb.race_id = $2
             limit 1`,
            [ctx.userId, raceRow.id],
          );
          const survived = await ctx.client.query<{
            name: string;
            dna_hash: string;
            current_day: number;
          }>(
            `select h.name, h.dna_hash, h.current_day
             from race_participant_snapshots s
             join horses h on h.id = s.horse_id
             where s.race_id = $2 and s.owner_user_id = $1 and h.status = 'ACTIVE'
             order by h.current_day desc limit 1`,
            [ctx.userId, raceRow.id],
          );
          if (day7.rows[0]) {
            personal = {
              kind: 'DAY7',
              horseName: day7.rows[0].name,
              buybackTotal: '200.00',
              dnaHash: day7.rows[0].dna_hash,
            };
          } else if (sold.rows[0]) {
            personal = {
              kind: 'SOLD',
              horseName: sold.rows[0].name,
              fromDay: sold.rows[0].current_day,
              soldPrice: sold.rows[0].price,
              dnaHash: sold.rows[0].dna_hash,
              ...(bought.rows[0]
                ? {
                    newHorseName: bought.rows[0].name,
                    newHorseDay: bought.rows[0].current_day,
                    newDnaHash: bought.rows[0].dna_hash,
                  }
                : { newHorseName: '', newHorseDay: 0 }),
            };
          } else if (burned.rows[0]) {
            personal = {
              kind: 'BURNED',
              horseName: burned.rows[0].name,
              buffRarity: burned.rows[0].buff ?? 'N',
              dnaHash: burned.rows[0].dna_hash,
            };
          } else if (survived.rows[0]) {
            personal = {
              kind: 'SURVIVED',
              horseName: survived.rows[0].name,
              fromDay: Math.max(0, survived.rows[0].current_day - 1),
              dnaHash: survived.rows[0].dna_hash,
            };
          }
        }
      }

      // For the YOU-highlight in the log flood (owner plan A).
      const myHorses = await ctx.client.query<{ name: string }>(
        `select name from horses where owner_user_id = $1 and status = 'ACTIVE' limit 50`,
        [ctx.userId],
      );

      return {
        server_time: now.toISOString(),
        next_derby_at: nextDerbyAt(now),
        phase,
        live_started_at: batchRow?.created_at ?? null,
        item_setting: raceRow?.status === 'FINALIZED' ? raceRow.item_setting : null,
        counts,
        ticker,
        personal,
        my_horse_names: myHorses.rows.map((r) => r.name),
      };
    },
  });
}
