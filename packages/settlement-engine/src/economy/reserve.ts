import type { SqlClient } from '@sevendays/shared';

/**
 * 施策C (FUN_V3): 1頭非売指定のスライド。
 *
 * 保護中(users.reserved_horse_id)の馬がBURNされたら、そのオーナーの最古の
 * アクティブ馬へ保護を移す(アクティブ馬が無ければ null)。BURN処理の中から
 * 呼ぶ。決定論(created_at, id 昇順)かつ冪等 — 実行後は reserved_horse_id が
 * 焼けた馬を指さないため、バッチ再開での再実行は何もしない。
 */
export async function slideReservedHorsesAfterBurn(
  client: SqlClient,
  burnedHorseIds: readonly string[],
): Promise<void> {
  if (burnedHorseIds.length === 0) return;
  await client.query(
    `update users u set reserved_horse_id = (
       select ho.id from horses ho
       where ho.owner_user_id = u.id and ho.status = 'ACTIVE'
       order by ho.created_at asc, ho.id asc
       limit 1
     )
     where u.reserved_horse_id = any($1)`,
    [burnedHorseIds as string[]],
  );
}
