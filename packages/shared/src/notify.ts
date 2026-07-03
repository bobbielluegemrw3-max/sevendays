import type { SqlClient } from './sql.js';

/**
 * In-App notification insert (Decision 065). Deterministic `dedupeKey`
 * makes every emission idempotent — batch retries and crash re-runs
 * conflict away instead of duplicating. `userId: null` is a broadcast row
 * (readable by every authenticated user).
 *
 * Type/template knowledge lives in @sevendays/domain
 * (NOTIFICATION_TEMPLATES_V1); this helper only persists what the caller
 * rendered.
 */
export async function insertNotification(
  client: SqlClient,
  args: {
    userId: string | null;
    type: string;
    dedupeKey: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `insert into notifications (user_id, notification_type, payload_json, dedupe_key)
     values ($1, $2, $3, $4)
     on conflict (dedupe_key) where dedupe_key is not null do nothing`,
    [args.userId, args.type, JSON.stringify(args.payload), args.dedupeKey],
  );
}
