import { insertNotification } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { renderNotification } from '@sevendays/domain';

/**
 * 施策D (FUN_V3): 育成者クレジット。
 *
 * 育てた分の総合値は売値に乗らず次の所有者へ無償で移転する。金銭で報いられない
 * なら【名誉】で報いる — この馬を育てた過去の育成者に、チャンピオン到達を通知する。
 *
 * - 貢献度 = その育成者の delta_v2 合計 / 馬全体の delta_v2 合計(スキルの純粋指標。
 *   アイテム上乗せ item_bonus_v3 は含めない — 課金額ランキングに近づくため)。
 * - training_sessions.user_id は所有権移転でも書き換わらず、V2行は削除不可
 *   (guard_training_delete)なので、育成者の帰属は恒久的に残る。
 * - 現所有者は通知に一切出さない(馬名のみ公開・ADR-007/Decision 073/076)。
 * - dedupeKey で冪等(バッチ再開でも二重送信しない)。
 */
export async function notifyBreedersOfChampion(
  client: SqlClient,
  input: { horseId: string; currentOwnerId: string },
): Promise<number> {
  const rows = await client.query<{ user_id: string; delta_sum: number }>(
    `select ts.user_id, coalesce(sum(ts.delta_v2), 0)::float8 as delta_sum
     from training_sessions ts
     where ts.horse_id = $1 and ts.menus_v2 is not null
     group by ts.user_id`,
    [input.horseId],
  );
  if (rows.rows.length === 0) return 0;

  // 貢献度の母数は「正の貢献の合計」。負の回(不調な回)は0扱いで割合を歪ませない。
  const total = rows.rows.reduce((acc, r) => acc + Math.max(0, r.delta_sum), 0);
  const named = await client.query<{ name: string }>(`select name from horses where id = $1`, [
    input.horseId,
  ]);
  const horseName = named.rows[0]?.name ?? '';

  let sent = 0;
  for (const r of rows.rows) {
    // 現所有者は買戻し通知で既に知る。過去の育成者だけに名誉を届ける。
    if (r.user_id === input.currentOwnerId) continue;
    const pct = total > 0 ? Math.round((Math.max(0, r.delta_sum) / total) * 100) : 0;
    const rendered = renderNotification('BREEDER_CHAMPION', { horse_name: horseName, pct });
    await insertNotification(client, {
      userId: r.user_id,
      type: 'BREEDER_CHAMPION',
      dedupeKey: `notif:BREEDER_CHAMPION:${input.horseId}:${r.user_id}`,
      payload: { ...rendered, horse_id: input.horseId, pct },
    });
    sent += 1;
  }
  return sent;
}
