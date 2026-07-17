import {
  Money,
  addDays,
  generateSecureSeedHex,
  insertNotification,
  mytWeekStart,
  mytWeekdayIndex,
  newUuid,
  sha256Hex,
  sha256Parts,
} from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  JACKPOT_DEFAULTS_V2,
  JACKPOT_SETTINGS_KEY,
  renderNotification,
  type JackpotDrawStatusV2,
  type JackpotSettingsV2,
  type RaceSlotV2,
} from '@sevendays/domain';
import { getBalance, getPlatformAccountId, jackpotPayout } from '@sevendays/ledger';

/**
 * Weekly jackpot (Decision 106/108).
 *
 * 週 = 月曜MORNING〜日曜NIGHTのレースサイクル(MYT)。チケット = その週の
 * サイクルへ帰属する調教確定(training_sessions の effective_race_date が
 * 週の範囲に入る行・枚数比例)。抽選はレースと同じ commit-reveal:
 * 週の最初のV2バッチがシードをコミット(エスクロー保管)し、日曜NIGHTバッチが
 * reveal(DBガードがSHA-256検証を強制)→ 当選チケット番号を決定論導出する。
 *
 * 冪等性: すべての書き込みは再実行で無害(コミット作成は週ユニーク・reveal は
 * null時のみ・払い出しはLedger冪等キー・当選行は on conflict・終端マーカーは
 * resolved_at null 条件)。実効パラメータ(賞金/人数)は支払い前に行へ凍結する
 * ので、クラッシュ再試行中に設定が変わっても結果は変わらない。
 */

export interface JackpotTicketEntry {
  userId: string;
  tickets: number;
}

export interface JackpotWinnerPick {
  userId: string;
  ticketIndex: number;
}

/**
 * Pure winner selection — reproducible by anyone from the revealed seed and
 * the ticket list (entries MUST be sorted by userId ascending; ticket index
 * space is the cumulative count walk in that order).
 * Distinct users per draw: a nonce that lands on an already-picked user is
 * skipped deterministically.
 */
export function pickJackpotWinners(
  seed: string,
  entries: readonly JackpotTicketEntry[],
  winnersTarget: number,
): JackpotWinnerPick[] {
  const total = entries.reduce((sum, e) => sum + e.tickets, 0);
  if (total <= 0 || winnersTarget < 1) return [];
  const distinctUsers = entries.filter((e) => e.tickets > 0).length;
  const target = Math.min(winnersTarget, distinctUsers);
  const winners: JackpotWinnerPick[] = [];
  const won = new Set<string>();
  // 60ビットあれば偏りは無視できる(total は現実的に 2^40 未満)。
  for (let nonce = 0; winners.length < target && nonce < 10_000; nonce++) {
    const hash = sha256Parts(seed, 'jackpot-winner', String(nonce));
    const ticketIndex = Number(BigInt(`0x${hash.slice(0, 15)}`) % BigInt(total));
    let cursor = 0;
    let userId = '';
    for (const e of entries) {
      cursor += e.tickets;
      if (ticketIndex < cursor) {
        userId = e.userId;
        break;
      }
    }
    if (!userId || won.has(userId)) continue;
    won.add(userId);
    winners.push({ userId, ticketIndex });
  }
  return winners;
}

/** system_settings のジャックポット設定(欠損・型崩れはDecision 106の仮値に落とす)。 */
export async function loadJackpotSettings(client: SqlClient): Promise<JackpotSettingsV2> {
  const r = await client.query<{ value: Partial<JackpotSettingsV2> | null }>(
    `select value from system_settings where key = $1`,
    [JACKPOT_SETTINGS_KEY],
  );
  const v = r.rows[0]?.value;
  return {
    enabled: v?.enabled === true,
    prize_usdt: typeof v?.prize_usdt === 'string' && v.prize_usdt.length > 0 ? v.prize_usdt : JACKPOT_DEFAULTS_V2.prizeUsdt,
    winners: typeof v?.winners === 'number' && Number.isInteger(v.winners) && v.winners >= 1 ? v.winners : JACKPOT_DEFAULTS_V2.winners,
  };
}

/**
 * 今週(batchDate の属する週)の抽選行+シードコミットを作成する(冪等)。
 * 週の最初のV2バッチで走るので、チケットが積み上がる前にコミットが立つ。
 */
export async function ensureJackpotDraw(client: SqlClient, input: { batchDate: string }): Promise<string> {
  const weekStart = mytWeekStart(input.batchDate);
  const existing = await client.query<{ id: string }>(
    `select id from jackpot_draws where week_start_date = $1`,
    [weekStart],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const drawId = newUuid();
  const seed = generateSecureSeedHex();
  await client.query('begin');
  try {
    const commit = await client.query<{ id: string }>(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('JACKPOT', $1, $2) returning id`,
      [drawId, sha256Hex(seed)],
    );
    await client.query(
      `insert into jackpot_draws (id, week_start_date, week_end_date, seed_commit_id)
       values ($1, $2, $3, $4)`,
      [drawId, weekStart, addDays(weekStart, 6), commit.rows[0]!.id],
    );
    await client.query(`insert into jackpot_seed_escrow (draw_id, seed) values ($1, $2)`, [drawId, seed]);
    await client.query('commit');
    return drawId;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    // 週ユニークの並行作成に負けた場合は勝者の行を使う
    const retry = await client.query<{ id: string }>(
      `select id from jackpot_draws where week_start_date = $1`,
      [weekStart],
    );
    if (retry.rows[0]) return retry.rows[0].id;
    throw error;
  }
}

export interface JackpotResolveResult {
  drawId: string;
  status: JackpotDrawStatusV2;
  totalTickets: number;
  winners: { userId: string; ticketIndex: number; amount: string }[];
}

/**
 * 日曜NIGHTバッチでのみ抽選を解決する(それ以外は no-op で null)。
 * Decision 108: 無効化中= SKIPPED_DISABLED / チケット0 = VOID_NO_TICKETS /
 * 広告費残高 < 必要総額 = CANCELLED_BUDGET(アラートのみ・繰越なし)。
 */
export async function resolveJackpotDrawIfDue(
  client: SqlClient,
  input: { batchDate: string; slot: RaceSlotV2; batchRunId: string },
): Promise<JackpotResolveResult | null> {
  if (input.slot !== 'NIGHT' || mytWeekdayIndex(input.batchDate) !== 6) return null;
  const drawId = await ensureJackpotDraw(client, { batchDate: input.batchDate });

  const drawRow = await client.query<{
    id: string;
    week_start_date: string;
    week_end_date: string;
    seed_commit_id: string;
    status: JackpotDrawStatusV2;
    prize_amount: string | null;
    winners_target: number;
    total_tickets: number | null;
    resolved_at: string | null;
  }>(
    `select id, week_start_date::text as week_start_date, week_end_date::text as week_end_date,
            seed_commit_id, status, prize_amount::text as prize_amount, winners_target,
            total_tickets, resolved_at::text as resolved_at
     from jackpot_draws where id = $1`,
    [drawId],
  );
  const draw = drawRow.rows[0]!;

  const finish = async (status: JackpotDrawStatusV2, totalTickets: number): Promise<JackpotResolveResult> => {
    await client.query(
      `update jackpot_draws
       set status = $2, total_tickets = coalesce(total_tickets, $3),
           resolved_batch_run_id = $4, resolved_at = now()
       where id = $1 and resolved_at is null`,
      [drawId, status, totalTickets, input.batchRunId],
    );
    return { drawId, status, totalTickets, winners: [] };
  };

  const loadWinners = async (): Promise<JackpotResolveResult['winners']> => {
    const rows = await client.query<{ user_id: string; ticket_index: number; amount: string }>(
      `select user_id, ticket_index, amount::text as amount
       from jackpot_winners where draw_id = $1 order by ticket_index`,
      [drawId],
    );
    return rows.rows.map((r) => ({ userId: r.user_id, ticketIndex: r.ticket_index, amount: r.amount }));
  };

  // 再実行: 終端済みならそのまま報告
  if (draw.resolved_at) {
    return { drawId, status: draw.status, totalTickets: draw.total_tickets ?? 0, winners: await loadWinners() };
  }

  // チケット集計(週の全14サイクルへの調教確定・ユーザーID昇順=当選番号空間の定義)
  const tickets = await client.query<{ user_id: string; n: number }>(
    `select user_id, count(*)::int as n
     from training_sessions
     where effective_race_date between $1 and $2
     group by user_id
     order by user_id`,
    [draw.week_start_date, draw.week_end_date],
  );
  const entries: JackpotTicketEntry[] = tickets.rows.map((r) => ({ userId: r.user_id, tickets: r.n }));
  const totalTickets = entries.reduce((sum, e) => sum + e.tickets, 0);

  // 実効パラメータの凍結(フェーズ1)。クラッシュ再試行で設定変更が効かないように、
  // 支払いに入る前に行へ書き切る。既に凍結済みならそれが正。
  let prize: Money;
  let winnersTarget: number;
  if (draw.prize_amount === null) {
    const settings = await loadJackpotSettings(client);
    if (!settings.enabled) return finish('SKIPPED_DISABLED', totalTickets);
    if (totalTickets === 0) return finish('VOID_NO_TICKETS', 0);

    prize = Money.of(settings.prize_usdt);
    winnersTarget = settings.winners;
    const effectiveWinners = Math.min(winnersTarget, entries.length);
    let needed = Money.of('0');
    for (let i = 0; i < effectiveWinners; i++) needed = needed.add(prize);
    const balance = Money.of(
      await getBalance(client, await getPlatformAccountId(client, 'PLATFORM_MARKETING_BUDGET')),
    );
    if (balance.lt(needed)) {
      // Decision 108: 中止・繰越なし。運用は残高アラートで事前回避する。
      console.warn(
        `JACKPOT_BUDGET_LOW: PLATFORM_MARKETING_BUDGET ${balance.toFixed8()} USDT cannot cover draw ${drawId} (${needed.toFixed8()} USDT for ${effectiveWinners} winner(s)) — cancelling this week`,
      );
      return finish('CANCELLED_BUDGET', totalTickets);
    }
    await client.query(
      `update jackpot_draws set prize_amount = $2, winners_target = $3, total_tickets = $4
       where id = $1 and prize_amount is null`,
      [drawId, prize.toFixed8(), winnersTarget, totalTickets],
    );
  } else {
    prize = Money.of(draw.prize_amount);
    winnersTarget = draw.winners_target;
  }

  // reveal(冪等・DBガードが SHA-256(seed) == commit_hash を強制)
  const escrow = await client.query<{ seed: string }>(
    `select seed from jackpot_seed_escrow where draw_id = $1`,
    [drawId],
  );
  const seed = escrow.rows[0]?.seed;
  if (!seed) throw new Error(`RACE_SEED_VERIFICATION_FAILED: jackpot draw ${drawId} has no escrowed seed`);
  await client.query(
    `update randomness_commits set reveal_seed = $2 where id = $1 and reveal_seed is null`,
    [draw.seed_commit_id, seed],
  );

  const picks = pickJackpotWinners(seed, entries, winnersTarget);
  for (const pick of picks) {
    const posted = await jackpotPayout(client, {
      userId: pick.userId,
      amount: prize,
      idempotencyKey: `jackpot:${drawId}:${pick.userId}`,
      referenceType: 'jackpot_draw',
      referenceId: drawId,
    });
    // 通知は当選行マーカーの前(Decision 065: dedupe がリプレイを吸収)
    const rendered = renderNotification('JACKPOT_WON', { amount: prize.toFixed8() });
    await insertNotification(client, {
      userId: pick.userId,
      type: 'JACKPOT_WON',
      dedupeKey: `notif:JACKPOT_WON:${drawId}:${pick.userId}`,
      payload: { ...rendered, draw_id: drawId, week_start_date: draw.week_start_date },
    });
    await client.query(
      `insert into jackpot_winners (draw_id, user_id, ticket_index, amount, ledger_transaction_id)
       values ($1, $2, $3, $4, $5)
       on conflict (draw_id, user_id) do nothing`,
      [drawId, pick.userId, pick.ticketIndex, prize.toFixed8(), posted.transactionId],
    );
  }

  await finish('PAID', totalTickets);
  return { drawId, status: 'PAID', totalTickets, winners: await loadWinners() };
}
