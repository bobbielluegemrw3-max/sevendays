import type { SqlClient } from '@sevendays/shared';
import { BUYBACK_TOTAL } from '@sevendays/domain';

/**
 * Batch Step 30 — Create Memorial NFTs.
 * A Memorial NFT is created ONLY after all seven Buyback payments are PAID
 * (03_GAME_DESIGN.md). Memorialized horses never return to P2P circulation.
 * The on-chain mint (Decision 049, Polygon PoS / ERC-721) is performed by a
 * dedicated worker afterwards; this records the memorial and freezes the
 * horse in MEMORIALIZED status.
 */

export async function createMemorialNfts(client: SqlClient): Promise<number> {
  const eligible = await client.query<{
    schedule_id: string;
    horse_id: string;
    user_id: string;
    horse_name: string;
    day7_clear_date: string;
  }>(
    `select s.id as schedule_id, s.horse_id, s.user_id, h.name as horse_name,
            s.day7_clear_date::text as day7_clear_date
     from buyback_schedules s
     join horses h on h.id = s.horse_id
     where s.status = 'COMPLETED'
       and not exists (select 1 from memorial_nfts m where m.horse_id = s.horse_id)
       and (select count(*) from buyback_schedule_payments p
            where p.buyback_schedule_id = s.id and p.status = 'PAID') = 7`,
  );

  let created = 0;
  for (const row of eligible.rows) {
    const metadata = {
      horse_name: row.horse_name,
      day7_clear_date: row.day7_clear_date,
      buyback_total: BUYBACK_TOTAL,
      achievement: 'DAY7_CLEAR',
    };
    const inserted = await client.query<{ id: string }>(
      `insert into memorial_nfts (horse_id, user_id, buyback_schedule_id, metadata_json)
       values ($1, $2, $3, $4)
       on conflict (horse_id) do nothing
       returning id`,
      [row.horse_id, row.user_id, row.schedule_id, JSON.stringify(metadata)],
    );
    if (inserted.rows.length === 0) continue;
    created += 1;
    await client.query(
      `update horses set status = 'MEMORIALIZED' where id = $1 and status = 'DAY7_CLEARED'`,
      [row.horse_id],
    );
  }
  return created;
}
