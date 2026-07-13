import { Money, insertNotification } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { SUPPORT_BONUS_TIER_AMOUNTS_V1, renderNotification } from '@sevendays/domain';
import { getBalance, getPlatformAccountId, supportBonusPayment } from '@sevendays/ledger';
import { resolveAncestorChains, resolveUnlockedTiers } from '../burn/support-bonus.js';

/**
 * チャンピオン祝い金 (Decision 092) — サポートボーナスの支払いトリガーを
 * BURNからチャンピオン誕生(7日間走破)へ変更。
 *
 * 財源は不変: ミント時のRESERVE_ALLOCATION(5.40/頭)+ BURN馬のアイテム代
 * (ITEM_SUPPORT_FUNDING)が PLATFORM_MLM_RESERVE(=サポートプール)に積まれる。
 *
 * 支払い: DAY7_CLEARED確定時に1チャンピオン×7ティア=7行のキューを起票し、
 * プール残高を上限にFIFO(champion_date, created_at, horse_id, tier)で支払う。
 *   - 該当ティアの祖先が不在/非ACTIVE/ティア未解放 → UNCLAIMED(最終・
 *     資金はプールに残る — 旧設計の「未達分は準備金滞留」と同じ)
 *   - プール残高不足 → PENDINGのまま繰越(モンテカルロ実証は
 *     SUPPORT_POOL_SIMULATION.md — 本番規模では実質発生しない)
 *
 * 冪等: キューはunique(horse_id, tier)、台帳キーは celeb:{horseId}:t{tier}、
 * 通知dedupeも同型 — ステップ再試行は収束する。
 */

export interface CelebrationEnqueueResult {
  championsEnqueued: number;
}

/**
 * DAY7_CLEAREDでまだキューにないチャンピオンを起票する(7行/頭)。
 * リトライではUPDATE...RETURNINGが空でも取りこぼさないよう、馬のステータス
 * から導出する(テストネットリセット後はレガシーDAY7_CLEAREDは存在しない)。
 */
export async function enqueueChampionCelebrations(
  client: SqlClient,
  input: { batchDate: string },
): Promise<CelebrationEnqueueResult> {
  const champions = await client.query<{ id: string; owner_user_id: string }>(
    `select h.id, h.owner_user_id from horses h
     where h.status = 'DAY7_CLEARED'
       and not exists (select 1 from support_celebrations c where c.horse_id = h.id)
     order by h.id`,
  );
  for (const horse of champions.rows) {
    for (let tier = 1; tier <= SUPPORT_BONUS_TIER_AMOUNTS_V1.length; tier += 1) {
      await client.query(
        `insert into support_celebrations (horse_id, champion_user_id, tier, amount, champion_date)
         values ($1, $2, $3, $4, $5)
         on conflict (horse_id, tier) do nothing`,
        [horse.id, horse.owner_user_id, tier, SUPPORT_BONUS_TIER_AMOUNTS_V1[tier - 1], input.batchDate],
      );
    }
  }
  return { championsEnqueued: champions.rows.length };
}

export interface CelebrationPayResult {
  paid: number;
  unclaimed: number;
  carriedOver: number;
}

/**
 * PENDINGの祝い金をFIFOで支払う。プール残高を使い切ったら停止(順序保存の
 * ため後続はスキップではなく打ち切り)。バッチはadvisoryロックで単一実行者
 * のため、残高の事前チェックとFIFO消化は競合しない。
 */
export async function payPendingCelebrations(client: SqlClient): Promise<CelebrationPayResult> {
  const pending = await client.query<{
    id: string;
    horse_id: string;
    champion_user_id: string;
    tier: number;
    amount: string;
  }>(
    `select id, horse_id, champion_user_id, tier, amount::text as amount
     from support_celebrations where status = 'PENDING'
     order by champion_date, created_at, horse_id, tier`,
  );
  if (pending.rows.length === 0) return { paid: 0, unclaimed: 0, carriedOver: 0 };

  const ownerIds = [...new Set(pending.rows.map((r) => r.champion_user_id))];
  const chains = await resolveAncestorChains(client, ownerIds);
  const ancestorIds = [...new Set([...chains.values()].flat().map((a) => a.id))];
  const unlockedById = await resolveUnlockedTiers(client, ancestorIds);

  const horseNames = await client.query<{ id: string; name: string }>(
    `select id, name from horses where id = any($1)`,
    [[...new Set(pending.rows.map((r) => r.horse_id))]],
  );
  const nameById = new Map(horseNames.rows.map((r) => [r.id, r.name]));

  const poolId = await getPlatformAccountId(client, 'PLATFORM_MLM_RESERVE');
  let remaining = Money.of(await getBalance(client, poolId));

  let paid = 0;
  let unclaimed = 0;
  let carriedOver = 0;
  let halted = false;

  for (const row of pending.rows) {
    if (halted) {
      carriedOver += 1;
      continue;
    }
    const ancestor = (chains.get(row.champion_user_id) ?? []).find((a) => a.tier === row.tier);
    const qualifies =
      ancestor !== undefined &&
      ancestor.status === 'ACTIVE' &&
      (unlockedById.get(ancestor.id) ?? 1) >= row.tier;

    if (!qualifies) {
      await client.query(
        `update support_celebrations set status = 'UNCLAIMED', settled_at = now()
         where id = $1 and status = 'PENDING'`,
        [row.id],
      );
      unclaimed += 1;
      continue;
    }

    const amount = Money.of(row.amount);
    if (remaining.lt(amount)) {
      // プール不足 — FIFO保存のためここで打ち切り(以降は繰越)
      halted = true;
      carriedOver += 1;
      console.warn(
        `SUPPORT_RESERVE_LOW: PLATFORM_MLM_RESERVE ${remaining.toFixed8()} USDT cannot cover pending celebration ${row.id} (${amount.toFixed8()} USDT) — carrying over`,
      );
      continue;
    }

    const payment = await supportBonusPayment(client, {
      userId: ancestor.id,
      amount,
      idempotencyKey: `celeb:${row.horse_id}:t${row.tier}`,
      referenceType: 'support_celebration',
      referenceId: row.id,
    });
    remaining = remaining.sub(amount);
    await client.query(
      `update support_celebrations
       set status = 'PAID', beneficiary_user_id = $2, ledger_transaction_id = $3, settled_at = now()
       where id = $1 and status = 'PENDING'`,
      [row.id, ancestor.id, payment.transactionId],
    );
    if (!payment.alreadyPosted) paid += 1;

    const rendered = renderNotification('SUPPORT_CELEBRATION_PAID', {
      amount: String(Number(row.amount)),
      tier: row.tier,
      horse_name: nameById.get(row.horse_id) ?? '',
    });
    await insertNotification(client, {
      userId: ancestor.id,
      type: 'SUPPORT_CELEBRATION_PAID',
      dedupeKey: `notif:SUPPORT_CELEBRATION_PAID:${row.horse_id}:${row.tier}`,
      payload: { ...rendered, horse_id: row.horse_id, tier: row.tier },
    });
  }
  return { paid, unclaimed, carriedOver };
}
