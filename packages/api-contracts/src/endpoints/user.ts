import { z } from 'zod';
import { Money, batchDateFor, addDays, insertNotification } from '@sevendays/shared';
import {
  MIN_WITHDRAWAL_AMOUNT,
  DEFAULT_CHAIN,
  TRAINING_TYPES,
  PURCHASE_MAX_PER_REQUEST,
  PURCHASE_LOCK_AMOUNT,
  TRAINING_COMBO_SIZE_V2,
  TRAINING_MENU_KEYS_V2,
  isRaceEngineV2,
  recommendedTrainingV1,
  renderNotification,
  type TrainingMenuV2,
} from '@sevendays/domain';
import { ensureUserAccounts, withdrawalFundLock } from '@sevendays/ledger';
import {
  cancelPurchaseSession,
  createOrUpdatePoolSession,
  createPurchaseSession,
  getMarketplaceState,
  verifyReplayInputs,
} from '@sevendays/settlement-engine';
import { verifyWalletLink } from '@sevendays/blockchain';
import { evaluateHiddenBadges } from '../hidden/achievements.js';
import { computeHiddenLooks } from '../hidden/looks.js';
import {
  hiddenPreferencesV2,
  resolveTrainingItemV3,
  resolveTrainingRollV2,
  tonightBand,
  totalValueV0,
  trainingItemEligibilityV3,
  type TotalValueInputV0,
} from '@sevendays/race-engine';
import type { HorseType, Rarity, TrainingType } from '@sevendays/domain';
import { ApiError } from '../errors.js';
import { sendCsEmail } from '../cs/mail.js';
import type { ApiRegistry } from '../router.js';

/** 馬転送の送り手上限(Decision 094・24時間ローリング)。 */
const HORSE_TRANSFERS_PER_DAY = 3;

/** 総合値V0の入力をDB行から組み立てる(FUN_V2_PLAN.md §3 A1)。 */
function totalValueInputFromRow(r: {
  ability_json: Record<string, number>;
  horse_type: string;
  rarity: string;
  dna_modifier: string;
  condition: string;
  fatigue: string;
  tonight_training: string | null;
}): TotalValueInputV0 {
  return {
    abilityJson: r.ability_json,
    horseType: r.horse_type as HorseType,
    rarity: r.rarity as Rarity,
    dnaModifier: Number(r.dna_modifier),
    condition: Number(r.condition),
    fatigue: Number(r.fatigue),
    training: (r.tonight_training as TrainingType | null) ?? null,
  };
}

/** User APIs (07_API.md) — JWT auth; reads are RLS-shaped (own rows only). */
export function registerUserEndpoints(registry: ApiRegistry): void {
  // 「今夜の安全圏」用: 今夜の出走馬(ACTIVE・手動出品を除く)の総合値分布。
  // 全ユーザー共通なのでプロセス内キャッシュ(既定60秒・テストは env で 0 に)。
  // FUN_V2_PLAN.md §3 A1 — 順位は目安(BURN選定には運が絡む)。降順ソート済み。
  let tonightDist: { key: string; at: number; values: number[] } | null = null;
  async function tonightDistribution(
    client: import('@sevendays/shared').SqlClient,
    effectiveRaceDate: string,
  ): Promise<number[]> {
    const ttl = Number(process.env.TOTAL_VALUE_DIST_CACHE_MS ?? 60000);
    if (tonightDist && tonightDist.key === effectiveRaceDate && Date.now() - tonightDist.at < ttl) {
      return tonightDist.values;
    }
    const rows = await client.query<{
      ability_json: Record<string, number>;
      horse_type: string;
      rarity: string;
      dna_modifier: string;
      condition: string;
      fatigue: string;
      tonight_training: string | null;
    }>(
      `select h.ability_json, h.horse_type::text as horse_type, h.rarity::text as rarity,
              h.dna_modifier::text as dna_modifier, h.condition::text as condition,
              h.fatigue::text as fatigue,
              (select t.training_type::text from training_sessions t
                where t.horse_id = h.id and t.effective_race_date = $1 limit 1) as tonight_training
         from horses h
        where h.status = 'ACTIVE'
          and not exists (select 1 from market_listings ml
                          where ml.horse_id = h.id and ml.status = 'LISTED' and ml.source = 'MANUAL')`,
      [effectiveRaceDate],
    );
    const values = rows.rows
      .map((r) => totalValueV0(totalValueInputFromRow(r)))
      .sort((a, b) => b - a);
    tonightDist = { key: effectiveRaceDate, at: Date.now(), values };
    return values;
  }
  registry.register({
    method: 'GET',
    path: '/api/v1/me',
    auth: 'user',
    handler: async (ctx) => {
      const r = await ctx.client.query<{ id: string; email: string; status: string; created_at: string }>(
        `select id, email, status::text as status, created_at::text as created_at,
                stable_name,
                (select count(*)::int from training_sessions t where t.user_id = users.id) as training_tickets
           from users where id = $1`,
        [ctx.userId],
      );
      if (!r.rows[0]) throw new ApiError('NOT_FOUND', 'User not found');
      // 管理者ナビの出し分け用(2026-07-09)。権限そのものは各adminエンドポイントが検証する
      return { ...r.rows[0], is_admin: ctx.auth.kind === 'admin' };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/wallet',
    auth: 'user',
    handler: async (ctx) => {
      // 1往復の高速経路(2026-07-16 §D: 旧 ensure+残高2回=直列5往復≈275ms)。
      // 口座行はプロビジョニング後は必ず2行存在する — 欠けている初回だけ
      // ensureUserAccounts で作成してから読み直す。
      const readBalances = () =>
        ctx.client.query<{ account_type: string; balance: string }>(
          `select a.account_type::text as account_type, coalesce(b.balance, 0)::text as balance
           from ledger_accounts a
           left join ledger_account_balances b on b.account_id = a.id
           where a.owner_type = 'USER' and a.owner_id = $1
             and a.account_type in ('USER_AVAILABLE', 'USER_LOCKED')`,
          [ctx.userId],
        );
      let rows = (await readBalances()).rows;
      if (rows.length < 2) {
        await ensureUserAccounts(ctx.client, ctx.userId);
        rows = (await readBalances()).rows;
      }
      const byType = new Map(rows.map((r) => [r.account_type, r.balance]));
      return {
        available: byType.get('USER_AVAILABLE') ?? '0',
        locked: byType.get('USER_LOCKED') ?? '0',
        currency: 'USDT',
      };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/wallet/history',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select t.transaction_type::text as type, e.direction::text as direction,
                e.amount::text as amount, a.account_type::text as account,
                t.reference_type, t.reference_id, e.created_at::text as created_at
         from ledger_entries e
         join ledger_accounts a on a.id = e.account_id
         join ledger_transactions t on t.id = e.transaction_id
         where a.owner_type = 'USER' and a.owner_id = $1
         order by e.created_at desc limit 100`,
        [ctx.userId],
      );
      return { entries: rows.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/wallet/deposit',
    auth: 'user',
    handler: async (ctx) => {
      const address = await ctx.client.query<{ address: string; chain_id: string }>(
        `select address, chain_id from deposit_addresses where user_id = $1 and chain_id = $2`,
        [ctx.userId, DEFAULT_CHAIN],
      );
      if (!address.rows[0]) {
        // HD address provisioning is the Phase 12 deposit worker's job.
        throw new ApiError('DEPOSIT_ADDRESS_UNAVAILABLE', 'Deposit address not yet provisioned');
      }
      return { ...address.rows[0], asset: 'USDT', confirmations_required: 128 };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/wallet/withdraw',
    auth: 'user',
    idempotencyKeyRequired: true,
    input: z.object({
      // Decision 064: at most 6 decimals (Polygon USDT on-chain scale).
      amount: z
        .string()
        .regex(/^\d+(\.\d{1,6})?$/, 'amount must be a decimal string with at most 6 decimal places'),
      to_address: z.string().min(4),
    }),
    handler: async (ctx, input) => {
      const amount = Money.of(input.amount);
      if (amount.lt(MIN_WITHDRAWAL_AMOUNT)) {
        throw new ApiError('WITHDRAWAL_BELOW_MINIMUM', `Minimum withdrawal is ${MIN_WITHDRAWAL_AMOUNT} USDT`);
      }
      // replay: same idempotency key returns the original request
      const existing = await ctx.client.query<{ id: string; status: string }>(
        `select w.id, w.status::text as status from blockchain_withdrawals w
         join ledger_transactions t on t.id = w.ledger_transaction_id
         where t.idempotency_key = $1`,
        [`wdlock:${ctx.idempotencyKey}`],
      );
      if (existing.rows[0]) return existing.rows[0];

      // Ledger fund lock BEFORE any broadcast (01_CONSTITUTION.md).
      const lock = await withdrawalFundLock(ctx.client, {
        userId: ctx.userId,
        amount,
        idempotencyKey: `wdlock:${ctx.idempotencyKey}`,
      });
      const row = await ctx.client.query<{ id: string; status: string }>(
        `insert into blockchain_withdrawals
           (user_id, chain_id, token_contract, to_address, requested_amount, network_fee_amount, net_amount,
            status, ledger_transaction_id)
         values ($1, $2, 'USDT', $3, $4, 0, $4, 'LOCKED', $5)
         returning id, status::text as status`,
        [ctx.userId, DEFAULT_CHAIN, input.to_address, amount.toFixed8(), lock.transactionId],
      );
      return row.rows[0]!;
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/horses',
    auth: 'user',
    handler: async (ctx) => {
      // trained_for_next_race mirrors the POST /training target — V2(2026-07-18):
      // 「次に走るサイクル」= (今日MORNING→今日NIGHT→明日MORNING…)のうち
      // バッチ未完了の最初の1つ。旧「当日バッチ完了→翌日扱い」はV1の1日1レース
      // 前提で、V2ではスロット違いの調教が「未調教」に見える実バグだった。
      // 効力日の判定はCTEで本体クエリに畳み込み(2026-07-16 §D: 往復1本削減)。
      const today = batchDateFor(new Date());
      // listing: 'SMART' | 'MANUAL' | null — 厩舎UIが「出品中(手動=今夜走らない)」を
      // 事実どおり表示するため(Decision 087監査)。limitは100→500(全件表示UIと整合)。
      const rows = await ctx.client.query<{
        id: string; name: string; status: string; current_day: number; horse_type: string;
        rarity: string; condition: string; fatigue: string; dna_hash: string;
        gifted_at: string | null; ability_json: Record<string, number>; dna_modifier: string;
        tonight_training: string | null; effective_race_date: string; listing: string | null;
      }>(
        `with eff as (
           select c.race_date, c.slot from (
             values ($2::date, 'MORNING'::race_slot, 1),
                    ($2::date, 'NIGHT'::race_slot, 2),
                    (($2::date + 1), 'MORNING'::race_slot, 3),
                    (($2::date + 1), 'NIGHT'::race_slot, 4)
           ) as c(race_date, slot, ord)
           where not exists (select 1 from batch_runs b
                             where b.batch_date = c.race_date and b.slot = c.slot and b.status = 'COMPLETED')
           order by c.ord limit 1
         )
         select h.id, h.name, h.status::text as status, h.current_day, h.horse_type::text as horse_type,
                h.rarity::text as rarity, h.condition::text as condition, h.fatigue::text as fatigue,
                h.dna_hash, h.gifted_at::text as gifted_at,
                h.ability_json, h.dna_modifier::text as dna_modifier,
                (select coalesce(t.training_type::text, 'V2') from training_sessions t
                  where t.horse_id = h.id and t.effective_race_date = (select race_date from eff)
                    and (t.slot is null or t.slot = (select slot from eff))
                  limit 1) as tonight_training,
                (select race_date from eff)::text as effective_race_date,
                (select l.source::text from market_listings l
                 where l.horse_id = h.id and l.status = 'LISTED' limit 1) as listing
         from horses h where h.owner_user_id = $1 order by h.created_at desc limit 500`,
        [ctx.userId, today],
      );
      // 隠し演出ルック(EASTER_EGG_PLAN.md)— 真偽フラグ/色種別のみ付与。条件は秘匿。
      const looks = await computeHiddenLooks(ctx.client, rows.rows.map((r) => r.id), ctx.userId);
      // 総合値V0+今夜の安全圏(FUN_V2_PLAN.md §3 A1)。分布はプロセス内キャッシュ。
      const effDate = rows.rows[0]?.effective_race_date ?? today;
      const hasActive = rows.rows.some((r) => r.status === 'ACTIVE');
      const dist = hasActive ? await tonightDistribution(ctx.client, effDate) : [];
      const horses = rows.rows.map((r) => {
        const l = looks.get(r.id);
        const { ability_json, dna_modifier, tonight_training, effective_race_date, ...rest } = r;
        void ability_json;
        void dna_modifier;
        void effective_race_date;
        const isActive = r.status === 'ACTIVE';
        const totalValue = isActive ? totalValueV0(totalValueInputFromRow(r)) : null;
        // 手動出品中は今夜走らない=順位なし(総合値のみ)
        const runs = isActive && r.listing !== 'MANUAL';
        const rank = runs && totalValue !== null ? 1 + dist.filter((v) => v > totalValue).length : null;
        return {
          ...rest,
          trained_for_next_race: tonight_training !== null,
          total_value: totalValue,
          tonight_rank: rank,
          tonight_entrants: runs ? dist.length : null,
          tonight_band: rank !== null ? tonightBand(rank, dist.length) : null,
          night_variant: l?.nightVariant ?? false,
          golden_star: l?.goldenStar ?? false,
          golden_aura: l?.goldenAura ?? false,
          revenge_flame: l?.revengeFlame ?? false,
          revenge_gold: l?.revengeGold ?? false,
          milestone: l?.milestone ?? false,
          color_variant: l?.colorVariant ?? null,
        };
      });
      return { horses };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/horses/:id',
    auth: 'user',
    handler: async (ctx) => {
      // 087監査: listing(出品状態)と history(この馬の全戦績)を追加 —
      // 詳細ページが「出品中=今夜走らない」の事実と7日間の物語を表示できるように。
      // trained_for_next_race(2026-07-14): 一覧と同じ効力日規則 — 調教済みなら
      // 詳細ページの調教フォームを「調教完了」表示に切り替えるため。
      // 効力日の判定はCTEで本体クエリに畳み込み(2026-07-16 §D: 往復1本削減)。
      const today = batchDateFor(new Date());
      const rows = await ctx.client.query(
        `with eff as (
           select c.race_date, c.slot from (
             values ($3::date, 'MORNING'::race_slot, 1),
                    ($3::date, 'NIGHT'::race_slot, 2),
                    (($3::date + 1), 'MORNING'::race_slot, 3),
                    (($3::date + 1), 'NIGHT'::race_slot, 4)
           ) as c(race_date, slot, ord)
           where not exists (select 1 from batch_runs b
                             where b.batch_date = c.race_date and b.slot = c.slot and b.status = 'COMPLETED')
           order by c.ord limit 1
         )
         select id, name, status::text as status, current_day, horse_type::text as horse_type,
                rarity::text as rarity, dna_hash, dna_modifier::text as dna_modifier,
                ability_json, condition::text as condition, fatigue::text as fatigue,
                mint_seed_hash, horse_generation_version, gifted_at::text as gifted_at,
                (select l.source::text from market_listings l
                 where l.horse_id = horses.id and l.status = 'LISTED' limit 1) as listing,
                (select coalesce(t.training_type::text, 'V2') from training_sessions t
                  where t.horse_id = horses.id and t.effective_race_date = (select race_date from eff)
                    and (t.slot is null or t.slot = (select slot from eff))
                  limit 1) as tonight_training,
                (select race_date from eff)::text as effective_race_date
         from horses where id = $1 and owner_user_id = $2`,
        [ctx.params.id, ctx.userId, today],
      );
      if (!rows.rows[0]) throw new ApiError('NOT_FOUND', 'Horse not found');
      // 総合値V0+今夜の安全圏(FUN_V2_PLAN.md §3 A1)
      const hRow = rows.rows[0] as (typeof rows.rows)[0] & {
        ability_json: Record<string, number>;
        horse_type: string; rarity: string; dna_modifier: string;
        condition: string; fatigue: string; tonight_training: string | null;
        effective_race_date: string; status: string; listing: string | null;
      };
      const isActiveHorse = hRow.status === 'ACTIVE';
      const totalValue = isActiveHorse ? totalValueV0(totalValueInputFromRow(hRow)) : null;
      const runsTonight = isActiveHorse && hRow.listing !== 'MANUAL';
      let tonightRank: number | null = null;
      let tonightEntrants: number | null = null;
      if (runsTonight && totalValue !== null) {
        const dist = await tonightDistribution(ctx.client, hRow.effective_race_date);
        tonightRank = 1 + dist.filter((v) => v > totalValue).length;
        tonightEntrants = dist.length;
      }
      // 隠し演出ルック(EASTER_EGG_PLAN.md)— 詳細ページ用の真偽フラグ。
      const looks = await computeHiddenLooks(ctx.client, [ctx.params.id!], ctx.userId);
      const lk = looks.get(ctx.params.id!);
      const history = await ctx.client.query(
        `select br.batch_date::text as batch_date, rr.final_rank, rr.final_score::text as final_score,
                rr.is_burned, r.participant_count,
                r.weather::text as weather, r.track_condition::text as track_condition,
                r.surface::text as surface,
                s.training_snapshot_json->>'training_type' as training_type,
                s.horse_type::text as snapshot_horse_type
         from race_results rr
         join races r on r.id = rr.race_id
         join batch_runs br on br.id = r.batch_run_id
         left join race_participant_snapshots s on s.race_id = rr.race_id and s.horse_id = rr.horse_id
         where rr.horse_id = $1
         order by br.batch_date asc`,
        [ctx.params.id],
      );
      // V2(Decision 104/107): V2エンジンがアクティブなら、次サイクル(朝→夜→翌朝)の
      // 確定済みロールを返す — 詳細ページがメニューUI/確定済み表示へ切り替えるため。
      let engineV2 = false;
      let trainingV2: {
        menus: string[]; delta: number; synergy: number; rests_decay: boolean; slot: string;
      } | null = null;
      // V2アイテムの常駐表示(装備バッジ+減衰シールド 2026-07-18)
      let raceItemV2: { item_key: string; effective_race_date: string; slot: string } | null = null;
      let decayShieldV2 = 0;
      {
        const active = await ctx.client.query<{ version: string }>(
          `select version from race_engine_versions
           where activated_at is not null and deactivated_at is null`,
        );
        engineV2 = active.rows.length === 1 && isRaceEngineV2(active.rows[0]!.version);
        if (engineV2 && isActiveHorse) {
          const cycles: { date: string; slot: 'MORNING' | 'NIGHT' }[] = [
            { date: today, slot: 'MORNING' },
            { date: today, slot: 'NIGHT' },
            { date: addDays(today, 1), slot: 'MORNING' },
          ];
          let cycle = cycles[cycles.length - 1]!;
          for (const c of cycles) {
            const done = await ctx.client.query(
              `select 1 from batch_runs where batch_date = $1 and slot = $2::race_slot and status = 'COMPLETED'`,
              [c.date, c.slot],
            );
            if (!done.rows[0]) { cycle = c; break; }
          }
          const v2row = await ctx.client.query<{
            menus_v2: string[]; delta_v2: string; synergy_v2: string; rests_decay_v2: boolean;
          }>(
            `select menus_v2, delta_v2::text as delta_v2, synergy_v2::text as synergy_v2, rests_decay_v2
             from training_sessions
             where horse_id = $1 and effective_race_date = $2 and slot = $3::race_slot
               and menus_v2 is not null`,
            [ctx.params.id, cycle.date, cycle.slot],
          );
          if (v2row.rows[0]) {
            trainingV2 = {
              menus: v2row.rows[0].menus_v2,
              delta: Number(v2row.rows[0].delta_v2),
              synergy: Number(v2row.rows[0].synergy_v2),
              rests_decay: v2row.rows[0].rests_decay_v2,
              slot: cycle.slot,
            };
          }
          const pendingItem = await ctx.client.query<{
            item_key: string; effective_race_date: string; slot: string;
          }>(
            `select item_key, effective_race_date::text as effective_race_date, slot::text as slot
             from item_usages
             where horse_id = $1 and status = 'PENDING' and usage_kind = 'RACE'
             order by created_at desc limit 1`,
            [ctx.params.id],
          );
          raceItemV2 = pendingItem.rows[0] ?? null;
          const shield = await ctx.client.query<{ decay_shield_v2: number }>(
            `select decay_shield_v2 from horses where id = $1`,
            [ctx.params.id],
          );
          decayShieldV2 = shield.rows[0]?.decay_shield_v2 ?? 0;
        }
      }
      const { tonight_training: tt, effective_race_date: efd, ...detailRest } = hRow;
      void efd;
      return {
        ...detailRest,
        engine_v2: engineV2,
        race_item_v2: raceItemV2,
        decay_shield_v2: decayShieldV2,
        training_v2: trainingV2,
        trained_for_next_race: tt !== null,
        /** 今夜向けに確定済みの調教タイプ(やり直しUIの初期値・A2)。 */
        tonight_training: tt,
        total_value: totalValue,
        tonight_rank: tonightRank,
        tonight_entrants: tonightEntrants,
        tonight_band: tonightRank !== null && tonightEntrants !== null ? tonightBand(tonightRank, tonightEntrants) : null,
        night_variant: lk?.nightVariant ?? false,
        golden_star: lk?.goldenStar ?? false,
        golden_aura: lk?.goldenAura ?? false,
        revenge_flame: lk?.revengeFlame ?? false,
        revenge_gold: lk?.revengeGold ?? false,
        milestone: lk?.milestone ?? false,
        color_variant: lk?.colorVariant ?? null,
        history: history.rows,
      };
    },
  });

  // 馬の転送(Decision 094): ゲーム内資産としてのユーザー間ギフト。
  //  - USDTのユーザー間送金は存在しないまま(法務整理)。譲渡馬は手動出品不可
  //    (gifted_at恒久マーク)— 換金経路はレース結果かエンジンのスマート選定のみ。
  //  - スマート出品対象からは除外しない(送り合って売却回避するメタを防ぐ)。
  //  - 同じ馬の転送は1日1回(冪等キー horse-gift:{id}:{date} — 同日連鎖も不可)。
  //  - 送り手の上限 3頭/24h。アイテムギフトと同じくメール宛先・即時・取消不可。
  registry.register({
    method: 'POST',
    path: '/api/v1/horses/:id/transfer',
    auth: 'user',
    input: z.object({ recipient_email: z.string().email() }),
    handler: async (ctx, input) => {
      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', 'Marketplace is locked during settlement');
      }
      const horseId = ctx.params.id!;
      const horse = await ctx.client.query<{
        owner_user_id: string;
        status: string;
        name: string;
        listed: boolean;
      }>(
        `select owner_user_id, status::text as status, name,
                exists (select 1 from market_listings l
                        where l.horse_id = horses.id and l.status = 'LISTED') as listed
         from horses where id = $1`,
        [horseId],
      );
      if (!horse.rows[0]) throw new ApiError('HORSE_NOT_FOUND', 'Horse not found');
      const h = horse.rows[0];
      if (h.owner_user_id !== ctx.userId) throw new ApiError('NOT_HORSE_OWNER', 'Not your horse');
      if (h.status !== 'ACTIVE') throw new ApiError('HORSE_NOT_ACTIVE', 'Horse is not active');
      if (h.listed) {
        throw new ApiError('HORSE_LISTED', 'A listed horse cannot be transferred — delist first');
      }

      const recipient = await ctx.client.query<{ id: string }>(
        `select id from users where lower(email) = lower($1) and status = 'ACTIVE'`,
        [input.recipient_email],
      );
      if (!recipient.rows[0]) {
        throw new ApiError('GIFT_RECIPIENT_NOT_FOUND', 'No active user with that email');
      }
      const recipientId = recipient.rows[0].id;
      if (recipientId === ctx.userId) {
        throw new ApiError('GIFT_SELF', 'You cannot transfer a horse to yourself');
      }

      const sentToday = await ctx.client.query<{ n: number }>(
        `select count(*)::int as n from user_transfers
         where sender_user_id = $1 and asset_type = 'HORSE'
           and created_at >= now() - interval '24 hours'`,
        [ctx.userId],
      );
      if (sentToday.rows[0]!.n >= HORSE_TRANSFERS_PER_DAY) {
        throw new ApiError('HORSE_TRANSFER_LIMIT', 'Daily horse transfer limit reached');
      }

      const sender = await ctx.client.query<{ email: string; stable_name: string | null }>(
        `select email, stable_name from users where id = $1`,
        [ctx.userId],
      );
      const senderEmail = sender.rows[0]!.email;
      // Decision 097: 差出人は厩舎名優先(「○○厩舎から馬が届いた」)
      const maskedSender = sender.rows[0]!.stable_name
        ?? (senderEmail.endsWith('@user.sevendays')
          ? 'ウォレットユーザー'
          : `${senderEmail.slice(0, 2)}***`);
      const today = batchDateFor(new Date());

      await ctx.client.query('begin');
      try {
        const moved = await ctx.client.query(
          `update horses set owner_user_id = $2, gifted_at = now()
           where id = $1 and owner_user_id = $3 and status = 'ACTIVE'`,
          [horseId, recipientId, ctx.userId],
        );
        if ((moved.affectedRows ?? 0) === 0) {
          throw new ApiError('HORSE_NOT_ACTIVE', 'Horse changed state — transfer aborted');
        }
        await ctx.client.query(
          `insert into user_transfers (sender_user_id, recipient_user_id, asset_type, horse_id, idempotency_key)
           values ($1, $2, 'HORSE', $3, $4)`,
          [ctx.userId, recipientId, horseId, `horse-gift:${horseId}:${today}`],
        );
        const rendered = renderNotification('HORSE_GIFT_RECEIVED', {
          sender: maskedSender,
          horse_name: h.name,
        });
        await insertNotification(ctx.client, {
          userId: recipientId,
          type: 'HORSE_GIFT_RECEIVED',
          dedupeKey: `notif:HORSE_GIFT_RECEIVED:${horseId}:${today}`,
          payload: { ...rendered, horse_id: horseId },
        });
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        if (/user_transfers_idempotency_key|duplicate key/i.test((error as Error).message)) {
          throw new ApiError('HORSE_TRANSFER_DAILY', 'This horse was already transferred today');
        }
        throw error;
      }
      return { horse_id: horseId, recipient: input.recipient_email, horse_name: h.name };
    },
  });

  // 厩舎名(Decision 097): 公開アイデンティティ。2〜20文字(和文/英数/スペース)・
  // 一意(大文字小文字区別なし)・変更は1日1回。null指定で解除(マスク表示に戻る)。
  registry.register({
    method: 'POST',
    path: '/api/v1/account/stable-name',
    auth: 'user',
    input: z.object({ name: z.string().nullable() }),
    handler: async (ctx, input) => {
      const name = input.name?.trim() ?? null;
      if (name !== null) {
        // 和文(ひらがな/カタカナ/長音/漢字)+英数+スペースのみ。URL/記号/@は不可。
        if (!/^[぀-ヿー一-鿿ｦ-ﾟA-Za-z0-9 ]{2,20}$/u.test(name)) {
          throw new ApiError(
            'STABLE_NAME_INVALID',
            'Stable name must be 2-20 chars of Japanese, letters, digits or spaces',
          );
        }
      }
      const today = batchDateFor(new Date());
      const current = await ctx.client.query<{ stable_name_changed_on: string | null }>(
        `select stable_name_changed_on::text as stable_name_changed_on from users where id = $1`,
        [ctx.userId],
      );
      if (current.rows[0]?.stable_name_changed_on === today) {
        throw new ApiError('STABLE_NAME_DAILY_LIMIT', 'Stable name can change once per day');
      }
      try {
        await ctx.client.query(
          `update users set stable_name = $2, stable_name_changed_on = $3::date where id = $1`,
          [ctx.userId, name, today],
        );
      } catch (error) {
        if (/uq_users_stable_name|duplicate key/i.test((error as Error).message)) {
          throw new ApiError('STABLE_NAME_TAKEN', 'This stable name is already in use');
        }
        throw error;
      }
      return { stable_name: name };
    },
  });

  // Wallet <-> account linking (Decision 072). Linking requires a fresh
  // personal_sign proof; a wallet maps to exactly one game account.
  registry.register({
    method: 'GET',
    path: '/api/v1/account/wallets',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select wallet_address, created_at::text as created_at
         from user_wallets where user_id = $1 order by created_at`,
        [ctx.userId],
      );
      return { wallets: rows.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/account/link-wallet',
    auth: 'user',
    input: z.object({
      address: z.string().min(4),
      message: z.string().min(10).max(500),
      signature: z.string().min(10),
    }),
    handler: async (ctx, input) => {
      const verified = await verifyWalletLink({
        userId: ctx.userId,
        address: input.address,
        message: input.message,
        signature: input.signature,
      });
      if (!verified.ok) {
        throw new ApiError('WALLET_SIGNATURE_INVALID', `Wallet proof rejected: ${verified.reason}`);
      }
      try {
        await ctx.client.query(
          `insert into user_wallets (user_id, wallet_address) values ($1, $2)`,
          [ctx.userId, verified.address],
        );
      } catch (error) {
        if (/uq_user_wallet_address|duplicate key/i.test((error as Error).message)) {
          throw new ApiError(
            'WALLET_ALREADY_LINKED',
            'This wallet is already linked to an account (each wallet can belong to exactly one account)',
          );
        }
        throw error;
      }
      return { linked: verified.address };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/account/unlink-wallet',
    auth: 'user',
    input: z.object({ address: z.string().min(4) }),
    handler: async (ctx, input) => {
      const removed = await ctx.client.query(
        `delete from user_wallets where user_id = $1 and wallet_address = lower($2)`,
        [ctx.userId, input.address],
      );
      if ((removed.affectedRows ?? 0) === 0) throw new ApiError('NOT_FOUND', 'Wallet not linked');
      return { unlinked: input.address.toLowerCase() };
    },
  });

  // Daily training selection (Decision 066). One per horse per
  // effective_race_date (DB unique); the day's intake closes at Batch Lock.
  // V2 (Decisions 104/107): `menus` (1-2) rolls the result AT CONFIRM and is
  // final — no redo. The V1 `training_type` path keeps its redo semantics.
  registry.register({
    method: 'POST',
    path: '/api/v1/horses/:id/training',
    auth: 'user',
    input: z.object({
      training_type: z.string().optional(),
      menus: z.array(z.string()).min(1).max(TRAINING_COMBO_SIZE_V2).optional(),
      // カタログV2(Decision 109): TRAINING系アイテムを確定と同時に1個添付
      item_key: z.string().optional(),
    }),
    handler: async (ctx, input) => {
      if (input.menus === undefined) {
        if (
          input.training_type === undefined ||
          !(TRAINING_TYPES as readonly string[]).includes(input.training_type)
        ) {
          throw new ApiError(
            'INVALID_TRAINING_TYPE',
            `training_type must be one of: ${TRAINING_TYPES.join(', ')}`,
          );
        }
      }
      const horse = await ctx.client.query<{
        owner_user_id: string;
        name: string;
        status: string;
        horse_type: HorseType;
        dna_hash: string;
        current_day: number;
      }>(
        `select owner_user_id, name, status::text as status,
                horse_type::text as horse_type, dna_hash, current_day
         from horses where id = $1`,
        [ctx.params.id],
      );
      if (!horse.rows[0]) throw new ApiError('HORSE_NOT_FOUND', 'Horse not found');
      if (horse.rows[0].owner_user_id !== ctx.userId) {
        throw new ApiError('NOT_HORSE_OWNER', 'Only the owner can train this horse');
      }
      // Burned/memorialized/Day7 horses never race again — accepting their
      // training (and notifying "applied") would be a lie.
      if (horse.rows[0].status !== 'ACTIVE') {
        throw new ApiError('HORSE_NOT_ACTIVE', `Horse is ${horse.rows[0].status}; only ACTIVE horses can train`);
      }

      // 手動出品中(Market Lock)は今夜走らない — 1日1回の調教権を無駄にさせない(087監査)
      const marketLocked = await ctx.client.query(
        `select 1 from market_listings where horse_id = $1 and status = 'LISTED' and source = 'MANUAL'`,
        [ctx.params.id],
      );
      if (marketLocked.rows[0]) {
        throw new ApiError('HORSE_MARKET_LOCKED', 'A manually listed horse does not race tonight');
      }

      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', "Training intake is closed during Daily Settlement");
      }

      // ---- V2 path (Decisions 104/107): menus + confirm-time roll --------
      if (input.menus !== undefined) {
        const active = await ctx.client.query<{ version: string }>(
          `select version from race_engine_versions
           where activated_at is not null and deactivated_at is null`,
        );
        if (active.rows.length !== 1 || !isRaceEngineV2(active.rows[0]!.version)) {
          throw new ApiError('TRAINING_V2_NOT_AVAILABLE', 'Menu training opens with the V2 season');
        }
        const menus = input.menus as TrainingMenuV2[];
        for (const m of menus) {
          if (!(TRAINING_MENU_KEYS_V2 as readonly string[]).includes(m)) {
            throw new ApiError(
              'INVALID_TRAINING_TYPE',
              `menus must be from: ${TRAINING_MENU_KEYS_V2.join(', ')}`,
            );
          }
        }

        // 対象サイクル = 次に走るレース: 朝→夜→翌朝 の順で未COMPLETEDの最初のもの
        const todayV2 = batchDateFor(new Date());
        const candidates: { date: string; slot: 'MORNING' | 'NIGHT' }[] = [
          { date: todayV2, slot: 'MORNING' },
          { date: todayV2, slot: 'NIGHT' },
          { date: addDays(todayV2, 1), slot: 'MORNING' },
        ];
        let target = candidates[candidates.length - 1]!;
        for (const c of candidates) {
          const done = await ctx.client.query(
            `select 1 from batch_runs where batch_date = $1 and slot = $2::race_slot and status = 'COMPLETED'`,
            [c.date, c.slot],
          );
          if (!done.rows[0]) {
            target = c;
            break;
          }
        }

        const frozen = await ctx.client.query(
          `select 1 from race_participant_snapshots s
           join races r on r.id = s.race_id
           join batch_runs b on b.id = r.batch_run_id
           where s.horse_id = $1 and b.batch_date = $2 and b.slot = $3::race_slot`,
          [ctx.params.id, target.date, target.slot],
        );
        if (frozen.rows[0]) {
          throw new ApiError('RACE_SNAPSHOT_ALREADY_CREATED', 'The race snapshot is already frozen');
        }

        // Decision 107: 確定は1サイクル1回きり — やり直し不可
        const existingV2 = await ctx.client.query(
          `select 1 from training_sessions
           where horse_id = $1 and effective_race_date = $2 and slot = $3::race_slot`,
          [ctx.params.id, target.date, target.slot],
        );
        if (existingV2.rows[0]) {
          throw new ApiError(
            'TRAINING_ALREADY_EXISTS',
            'Training for this race cycle is already confirmed — the roll is final (Decision 107)',
          );
        }

        // 確定の瞬間にロール(決定論シード: 馬×サイクル。リトライは同一結果)
        const rollSeed = `${ctx.params.id}:${target.date}:${target.slot}`;
        const roll = resolveTrainingRollV2({
          dnaHash: horse.rows[0].dna_hash,
          horseType: horse.rows[0].horse_type,
          menus,
          rollSeed,
        });

        // TRAINING系アイテムの添付(Decision 109)。確定と同時にロールし、
        // アイテムも即最終(107)— 使用行は取消不可のkind=TRAININGで刻む。
        let itemBonus: number | null = null;
        let itemUnitId: string | null = null;
        if (input.item_key !== undefined) {
          const cat = await ctx.client.query<{ item_class: string; active: boolean }>(
            `select item_class, active from item_catalog where key = $1`,
            [input.item_key],
          );
          if (!cat.rows[0] || !cat.rows[0].active || cat.rows[0].item_class !== 'TRAINING') {
            throw new ApiError('ITEM_NOT_FOUND', 'Unknown or non-training item');
          }
          const prefs = hiddenPreferencesV2(horse.rows[0].dna_hash, horse.rows[0].horse_type);
          const eligibility = trainingItemEligibilityV3(input.item_key, {
            menus,
            favoriteMenu: prefs.favorite,
            lv: horse.rows[0].current_day,
          });
          if (!eligibility.ok) {
            throw new ApiError('ITEM_NOT_ELIGIBLE', eligibility.reason ?? 'Item does not fit this confirm');
          }
        }

        try {
          await ctx.client.query('begin');
          if (input.item_key !== undefined) {
            const unit = await ctx.client.query<{ id: string }>(
              `select id from user_items
               where user_id = $1 and item_key = $2 and status = 'AVAILABLE'
               order by acquired_at asc, id asc limit 1 for update`,
              [ctx.userId, input.item_key],
            );
            if (!unit.rows[0]) throw new ApiError('ITEM_NOT_OWNED', 'You do not own this item');
            itemUnitId = unit.rows[0].id;
            const prefs = hiddenPreferencesV2(horse.rows[0].dna_hash, horse.rows[0].horse_type);
            itemBonus = resolveTrainingItemV3(input.item_key, rollSeed, {
              menus,
              favoriteMenu: prefs.favorite,
              lv: horse.rows[0].current_day,
              roll: { delta: roll.delta, synergy: roll.synergy },
            }).itemBonus;
            const unitPrice = await ctx.client.query<{ unit_price: string }>(
              `select unit_price::text as unit_price from user_items where id = $1`,
              [itemUnitId],
            );
            await ctx.client.query(
              `insert into item_usages
                 (user_item_id, horse_id, user_id, item_key, unit_price,
                  effective_race_date, slot, usage_kind)
               values ($1, $2, $3, $4, $5, $6, $7::race_slot, 'TRAINING')`,
              [itemUnitId, ctx.params.id, ctx.userId, input.item_key,
               unitPrice.rows[0]!.unit_price, target.date, target.slot],
            );
            await ctx.client.query(`update user_items set status = 'APPLIED' where id = $1`, [itemUnitId]);
          }
          await ctx.client.query(
            `insert into training_sessions
               (horse_id, user_id, training_date, effective_race_date, slot,
                menus_v2, per_menu_v2, synergy_v2, delta_v2, rests_decay_v2,
                item_key_v3, item_bonus_v3, item_user_item_id)
             values ($1, $2, $3, $4, $5::race_slot, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              ctx.params.id,
              ctx.userId,
              todayV2,
              target.date,
              target.slot,
              menus,
              JSON.stringify(roll.perMenu),
              roll.synergy,
              roll.delta,
              roll.restsDecay,
              input.item_key ?? null,
              itemBonus,
              itemUnitId,
            ],
          );
          const rendered = renderNotification('TRAINING_COMPLETED', {
            horse_name: horse.rows[0].name,
            training_type: menus.join('+'),
          });
          await insertNotification(ctx.client, {
            userId: ctx.userId,
            type: 'TRAINING_COMPLETED',
            dedupeKey: `notif:TRAINING_COMPLETED:${ctx.params.id}:${target.date}:${target.slot}`,
            payload: { ...rendered, horse_id: ctx.params.id, menus, delta: roll.delta },
          });
          await ctx.client.query('commit');
        } catch (error) {
          await ctx.client.query('rollback').catch(() => undefined);
          if (/uq_training_horse_race_slot|duplicate key/i.test((error as Error).message)) {
            throw new ApiError(
              'TRAINING_ALREADY_EXISTS',
              'Training for this race cycle is already confirmed — the roll is final (Decision 107)',
            );
          }
          throw error;
        }

        const ticketsV2 = await ctx.client.query<{ n: number }>(
          `select count(*)::int as n from training_sessions where user_id = $1`,
          [ctx.userId],
        );
        return {
          horse_id: ctx.params.id,
          menus,
          per_menu: roll.perMenu,
          synergy: roll.synergy,
          delta: roll.delta,
          rests_decay: roll.restsDecay,
          effective_race_date: target.date,
          slot: target.slot,
          first_confirm: true,
          item_key: input.item_key ?? null,
          item_bonus: itemBonus,
          training_tickets: ticketsV2.rows[0]?.n ?? 0,
        };
      }

      // ---- V1 path (unchanged — rollless redo, Decision 066 / A2) --------
      const trainingType = input.training_type!;
      // While OPEN the training targets the next race to run: today's race
      // unless today's batch already completed (post-race evening).
      const today = batchDateFor(new Date());
      const completedToday = await ctx.client.query(
        `select 1 from batch_runs where batch_date = $1 and status = 'COMPLETED'`,
        [today],
      );
      const effectiveRaceDate = completedToday.rows[0] ? addDays(today, 1) : today;

      const snapshot = await ctx.client.query(
        `select 1
         from race_participant_snapshots s
         join races r on r.id = s.race_id
         join batch_runs b on b.id = r.batch_run_id
         where s.horse_id = $1 and b.batch_date = $2`,
        [ctx.params.id, effectiveRaceDate],
      );
      if (snapshot.rows[0]) {
        throw new ApiError('RACE_SNAPSHOT_ALREADY_CREATED', 'The race snapshot is already frozen');
      }

      // FUN改修A2(FUN_V2_PLAN §3): スナップショット確定前なら何度でもやり直し可。
      // スキーマの憲法は training_type の UPDATE を禁じ、未スナップショット行の
      // DELETE を明示的に許している(guard_training_delete)— やり直しは
      // 「削除して入れ直す」が正規の道。チケット(=初回確定)と通知は初回のみ。
      const existing = await ctx.client.query<{ id: string; snapshot_included_at: string | null }>(
        `select id, snapshot_included_at from training_sessions
          where horse_id = $1 and effective_race_date = $2`,
        [ctx.params.id, effectiveRaceDate],
      );
      if (existing.rows[0]?.snapshot_included_at) {
        throw new ApiError('RACE_SNAPSHOT_ALREADY_CREATED', 'The race snapshot is already frozen');
      }
      const firstConfirm = !existing.rows[0];
      try {
        await ctx.client.query('begin');
        if (existing.rows[0]) {
          await ctx.client.query(`delete from training_sessions where id = $1`, [existing.rows[0].id]);
        }
        await ctx.client.query(
          `insert into training_sessions (horse_id, user_id, training_type, training_date, effective_race_date)
           values ($1, $2, $3::training_type, $4, $5)`,
          [ctx.params.id, ctx.userId, trainingType, today, effectiveRaceDate],
        );
        if (firstConfirm) {
          const rendered = renderNotification('TRAINING_COMPLETED', {
            horse_name: horse.rows[0].name,
            training_type: trainingType,
          });
          await insertNotification(ctx.client, {
            userId: ctx.userId,
            type: 'TRAINING_COMPLETED',
            dedupeKey: `notif:TRAINING_COMPLETED:${ctx.params.id}:${effectiveRaceDate}`,
            payload: { ...rendered, horse_id: ctx.params.id, training_type: trainingType },
          });
        }
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        // 同時やり直しの衝突・凍結競合は409で返す(500にしない)
        if (/uq_training_horse_race_slot|duplicate key|TRAINING_FROZEN/i.test((error as Error).message)) {
          throw new ApiError('TRAINING_CONFLICT', 'Training changed concurrently — try again');
        }
        throw error;
      }
      const tickets = await ctx.client.query<{ n: number }>(
        `select count(*)::int as n from training_sessions where user_id = $1`,
        [ctx.userId],
      );

      return {
        horse_id: ctx.params.id,
        training_type: trainingType,
        effective_race_date: effectiveRaceDate,
        first_confirm: firstConfirm,
        training_tickets: tickets.rows[0]?.n ?? 0,
      };
    },
  });

  // 売買自動化設定(Decision 086)。行が存在する = 出品方式を明示的に選択済み。
  registry.register({
    method: 'GET',
    path: '/api/v1/trade-settings',
    auth: 'user',
    handler: async (ctx) => {
      const r = await ctx.client.query<{
        auto_list: boolean;
        auto_reserve: boolean;
        auto_reserve_max: number | null;
        auto_pool_amount: string | null;
      }>(
        `select auto_list, auto_reserve, auto_reserve_max, auto_pool_amount::text as auto_pool_amount
         from user_trade_settings where user_id = $1`,
        [ctx.userId],
      );
      const row = r.rows[0];
      if (!row) {
        // 未選択: 初回モーダルの表示条件。デフォルトは何も自動化しない
        return { chosen: false, auto_list: false, auto_reserve: false, auto_reserve_max: 1, auto_pool_amount: null };
      }
      return { chosen: true, ...row };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/trade-settings',
    auth: 'user',
    input: z.object({
      auto_list: z.boolean(),
      auto_reserve: z.boolean().optional(),
      /** 1晩の自動予約上限。null = MAX(残高と枠の許す限り)。 */
      auto_reserve_max: z.number().int().min(1).max(10).nullable().optional(),
      /** Decision 110: V2の自動プール金額(USDT・下限102)。null = 未設定(SINGLE予約のまま)。 */
      auto_pool_amount: z.number().int().min(102).max(100000).nullable().optional(),
    }),
    handler: async (ctx, input) => {
      const autoReserve = input.auto_reserve ?? false;
      const autoReserveMax = input.auto_reserve_max === undefined ? 1 : input.auto_reserve_max;
      const autoPoolAmount = input.auto_pool_amount === undefined ? null : input.auto_pool_amount;
      if (autoReserve && !input.auto_list) {
        throw new ApiError(
          'TRADE_SETTINGS_INVALID',
          'Auto-reservation requires the smart listing mode (Decision 086)',
        );
      }
      await ctx.client.query(
        `insert into user_trade_settings (user_id, auto_list, auto_reserve, auto_reserve_max, auto_pool_amount)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update
           set auto_list = excluded.auto_list,
               auto_reserve = excluded.auto_reserve,
               auto_reserve_max = excluded.auto_reserve_max,
               auto_pool_amount = excluded.auto_pool_amount,
               updated_at = now()`,
        [ctx.userId, input.auto_list, autoReserve, autoReserveMax, autoPoolAmount],
      );
      // Smartをやめた場合、既存のSmart出品は翌バッチで取り下げ(今夜売れたら売却優先 —
      // 手動出品の取り下げと同じ約束事)
      if (!input.auto_list) {
        await ctx.client.query(
          `update market_listings set cancel_after_batch = true
           where seller_user_id = $1 and status = 'LISTED' and source = 'SMART'`,
          [ctx.userId],
        );
      }
      return {
        chosen: true,
        auto_list: input.auto_list,
        auto_reserve: autoReserve,
        auto_reserve_max: autoReserveMax,
        auto_pool_amount: autoPoolAmount,
      };
    },
  });

  // 一括調教(Decision 088)— 未調教のACTIVE馬(手動出品中を除く)全頭に
  // recommendedTrainingV1(タイプ相性+疲労60で回復)を適用する。冪等:
  // 調教済み・スナップショット済みの馬は on conflict / 事前チェックでスキップ。
  // 通知は出さない(N頭ぶんのスパム防止 — 結果はレスポンスとバッジで見える)。
  registry.register({
    method: 'POST',
    path: '/api/v1/horses/train-all',
    auth: 'user',
    handler: async (ctx) => {
      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', 'Training intake is closed during Daily Settlement');
      }
      // V2ゲート(2026-07-18 実発生): V1の「おすすめ一括適用」がV1形状の調教行を
      // (翌日, NIGHT)へ書き、正しいサイクルのV2調教をTRAINING_ALREADY_EXISTSで
      // ブロックした。V2の調教は6メニューの戦略選択+確定即最終(Decision 107)なので
      // 一括おすすめは成立しない — 各馬のページから確定してもらう。
      const activeEngine = await ctx.client.query<{ version: string }>(
        `select version from race_engine_versions
         where activated_at is not null and deactivated_at is null`,
      );
      if (activeEngine.rows.length === 1 && isRaceEngineV2(activeEngine.rows[0]!.version)) {
        throw new ApiError('V2_MENU_TRAINING', 'Bulk training is a V1 feature — under V2, confirm menus per horse');
      }
      const today = batchDateFor(new Date());
      const completedToday = await ctx.client.query(
        `select 1 from batch_runs where batch_date = $1 and status = 'COMPLETED'`,
        [today],
      );
      const effectiveRaceDate = completedToday.rows[0] ? addDays(today, 1) : today;

      // 対象: 自分のACTIVE馬 − 手動出品中 − 調教済み − スナップショット確定済み
      const targets = await ctx.client.query<{
        id: string;
        horse_type: string;
        fatigue: string;
      }>(
        `select h.id, h.horse_type::text as horse_type, h.fatigue::text as fatigue
         from horses h
         where h.owner_user_id = $1 and h.status = 'ACTIVE'
           and not exists (select 1 from market_listings l
                           where l.horse_id = h.id and l.status = 'LISTED' and l.source = 'MANUAL')
           and not exists (select 1 from training_sessions t
                           where t.horse_id = h.id and t.effective_race_date = $2)
           and not exists (select 1 from race_participant_snapshots s
                           join races r on r.id = s.race_id
                           join batch_runs b on b.id = r.batch_run_id
                           where s.horse_id = h.id and b.batch_date = $2)
         order by h.created_at`,
        [ctx.userId, effectiveRaceDate],
      );

      const byType: Record<string, number> = {};
      let trained = 0;
      for (const horse of targets.rows) {
        const training = recommendedTrainingV1(
          horse.horse_type as Parameters<typeof recommendedTrainingV1>[0],
          Number(horse.fatigue),
        );
        const inserted = await ctx.client.query<{ id: string }>(
          `insert into training_sessions (horse_id, user_id, training_type, training_date, effective_race_date)
           values ($1, $2, $3::training_type, $4, $5)
           on conflict (horse_id, effective_race_date, slot) do nothing
           returning id`,
          [horse.id, ctx.userId, training, today, effectiveRaceDate],
        );
        if (inserted.rows.length === 0) continue; // 並行の個別調教が勝った — そのまま尊重
        trained += 1;
        byType[training] = (byType[training] ?? 0) + 1;
      }
      return {
        trained,
        by_type: byType,
        effective_race_date: effectiveRaceDate,
      };
    },
  });

  // Own-session list (the UI showed only the latest session, hiding the
  // rest — production finding, 2026-07-04). Same visibility rules as
  // GET /purchase/{id}.
  registry.register({
    method: 'GET',
    path: '/api/v1/purchase',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select id, status::text as status, locked_amount::text as locked_amount,
                session_mode::text as session_mode,
                assigned_price::text as assigned_price, refund_amount::text as refund_amount,
                created_at::text as created_at,
                (select count(*)::int from ownership_assignments oa
                 where oa.purchase_session_id = purchase_sessions.id) as horse_count
         from purchase_sessions where user_id = $1 order by created_at desc limit 20`,
        [ctx.userId],
      );
      // V2(Decision 103): プール購入UIへの切替フラグ(アクティブエンジンで判定)
      const active = await ctx.client.query<{ version: string }>(
        `select version from race_engine_versions
         where activated_at is not null and deactivated_at is null`,
      );
      const engineV2 = active.rows.length === 1 && isRaceEngineV2(active.rows[0]!.version);
      return { sessions: rows.rows, engine_v2: engineV2 };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/purchase',
    auth: 'user',
    idempotencyKeyRequired: true,
    // Decision 085: 複数頭予約。countぶんのセッションを順に作成する。
    // 途中で失敗(残高不足・上限)しても作成済みセッションはそのまま残る —
    // 各セッションは独立に有効で、同じキーの再試行は作成済み分をリプレイして続きから進む。
    input: z.object({
      // Decision 096: 同時予約の上限は実質撤廃。1リクエストの作成数だけ
      // PURCHASE_MAX_PER_REQUEST(直列作成の実行時間ガード)で区切る。
      count: z.number().int().min(1).max(PURCHASE_MAX_PER_REQUEST).optional(),
      // Decision 103(V2): 予算プール「◯◯$厩舎」。amount指定=プール予約。
      // 生きているプールがあれば金額変更(差額ロック/解放)。countとは排他。
      amount: z
        .string()
        .regex(/^\d{1,7}(\.\d{1,2})?$/, 'amount must be a positive USDT value')
        .optional(),
    }),
    handler: async (ctx, input) => {
      if (input.amount !== undefined) {
        // プール購入はV2エンジン(テストネットリセット後)でのみ受け付ける
        const active = await ctx.client.query<{ version: string }>(
          `select version from race_engine_versions
           where activated_at is not null and deactivated_at is null`,
        );
        if (active.rows.length !== 1 || !isRaceEngineV2(active.rows[0]!.version)) {
          throw new ApiError('POOL_NOT_AVAILABLE', 'Pool purchase opens with the V2 season');
        }
        const pool = await createOrUpdatePoolSession(ctx.client, {
          userId: ctx.userId,
          amount: input.amount,
          idempotencyKey: ctx.idempotencyKey!,
        });
        return {
          purchase_session_id: pool.sessionId,
          already_exists: pool.alreadyExists,
          session_ids: [pool.sessionId],
          locked_amount: pool.lockedAmount,
          mode: 'POOL',
        };
      }
      const count = input.count ?? 1;
      const key = ctx.idempotencyKey!;
      const sessions: { id: string; alreadyExists: boolean }[] = [];
      for (let i = 0; i < count; i += 1) {
        // 単頭は従来どおり素のキー(後方互換)。複数頭は決定論的な派生キー。
        const derivedKey = count === 1 ? key : `${key}#${i + 1}`;
        const result = await createPurchaseSession(ctx.client, {
          userId: ctx.userId,
          idempotencyKey: derivedKey,
        });
        sessions.push({ id: result.sessionId, alreadyExists: result.alreadyExists });
      }

      // 予約受付メール(Decision 085)— ベストエフォート。リプレイでは送らない。
      // 送信失敗で購入を絶対に落とさない(ウェルカムメールと同じ流儀)。
      const createdCount = sessions.filter((s) => !s.alreadyExists).length;
      if (createdCount > 0) {
        const u = await ctx.client.query<{ email: string }>(
          `select email from users where id = $1`,
          [ctx.userId],
        );
        const email = u.rows[0]?.email;
        if (email && !email.endsWith('@user.sevendays')) {
          const totalLock = (Number(PURCHASE_LOCK_AMOUNT) * createdCount).toFixed(2);
          sendCsEmail({
            toEmail: email,
            subject: '購入予約を受け付けました — 今夜20:00に処理されます / Reservation received',
            body: [
              'Dear Owner,',
              '',
              `Your purchase reservation (${createdCount} horse${createdCount > 1 ? 's' : ''}) has been received.`,
              `Locked: up to ${totalLock} USDT (the difference from the assigned price is refunded automatically).`,
              'After tonight\'s 20:00 (MYT) race, the smart marketplace system will settle your reservation',
              'as a P2P trade with another owner or a newly minted horse.',
              'You can cancel before the 20:00 settlement for a full refund.',
              '',
              '----------------------------------------',
              '',
              'オーナー様',
              '',
              `購入予約(${createdCount}頭)を受け付けました。`,
              `ロック額: 最大 ${totalLock} USDT(割当価格との差額は自動で返金されます)`,
              '今夜20:00(MYT)のレース終了後、スマートマーケットプレイスシステムが予約を処理します。',
              '他のオーナーとのP2P取引、または新規発行馬の購入となります。',
              '20:00の精算前であればキャンセル(全額返金)できます。',
              '',
              'Seven Days Derby',
            ].join('\n'),
          }).catch(() => undefined);
        }
      }

      return {
        purchase_session_id: sessions[0]!.id,
        already_exists: sessions.every((s) => s.alreadyExists),
        session_ids: sessions.map((s) => s.id),
      };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/purchase/:id/cancel',
    auth: 'user',
    handler: async (ctx) => {
      await cancelPurchaseSession(ctx.client, { sessionId: ctx.params.id!, userId: ctx.userId });
      return { cancelled: true };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/purchase/:id',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select id, status::text as status, locked_amount::text as locked_amount,
                assigned_price::text as assigned_price, refund_amount::text as refund_amount,
                created_at::text as created_at, settled_at::text as settled_at
         from purchase_sessions where id = $1 and user_id = $2`,
        [ctx.params.id, ctx.userId],
      );
      if (!rows.rows[0]) throw new ApiError('NOT_FOUND', 'Purchase session not found');
      return rows.rows[0];
    },
  });

  // 隠し実績バッジ(EASTER_EGG_PLAN.md・GO 2026-07-15)。読み取り専用・
  // コスメティックのみ。獲得済みの称号(名前+雰囲気テキスト)だけ返す —
  // 獲得条件は evaluateHiddenBadges の内部にのみ存在し、API には出さない。
  // user_id 省略=自分。指定=他人の厩舎を見たときの公開バッジ(称号は公開情報)。
  registry.register({
    method: 'GET',
    path: '/api/v1/hidden-badges',
    auth: 'user',
    input: z.object({ user_id: z.string().uuid().optional() }),
    handler: async (ctx, input) => {
      const target = input.user_id ?? ctx.userId;
      const badges = await evaluateHiddenBadges(ctx.client, target);
      return { badges };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/assignments',
    auth: 'user',
    handler: async (ctx) => {
      // 2026-07-14: 馬名と売買の向き(買い/売り)を同梱 — UIが内部IDではなく
      // 「Bright Dash を購入」のように表示できるように。
      const rows = await ctx.client.query(
        `select a.id, a.horse_id, h.name as horse_name,
                a.assigned_price::text as assigned_price, a.status::text as status,
                (a.market_listing_id is null) as was_day0_mint,
                (a.buyer_user_id = $1) as is_buyer,
                a.created_at::text as created_at
         from ownership_assignments a
         join horses h on h.id = a.horse_id
         where a.buyer_user_id = $1 or a.seller_user_id = $1
         order by a.created_at desc limit 100`,
        [ctx.userId],
      );
      return { assignments: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/races',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select r.id, r.status::text as status, r.participant_count,
                b.batch_date::text as batch_date, b.slot::text as slot, r.race_engine_version
         from races r join batch_runs b on b.id = r.batch_run_id
         order by b.batch_date desc, r.created_at desc limit 30`,
      );
      return { races: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/races/:id',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select r.id, r.status::text as status, r.participant_count, r.race_engine_version,
                b.batch_date::text as batch_date, b.slot::text as slot,
                rc.commit_hash as seed_hash, rc.reveal_seed as revealed_seed
         from races r
         join batch_runs b on b.id = r.batch_run_id
         join randomness_commits rc on rc.id = r.seed_commit_id
         where r.id = $1`,
        [ctx.params.id],
      );
      if (!rows.rows[0]) throw new ApiError('NOT_FOUND', 'Race not found');
      return rows.rows[0];
    },
  });

  // レース結果はDBトリガーで不変(race_results immutable)なので、ショー直後の
  // 集中閲覧(1回=最大1000行)をプロセス内キャッシュで吸収する(2026-07-12)。
  const raceResultsCache = new Map<string, { at: number; body: unknown }>();
  const RESULTS_CACHE_CAP = 40;
  registry.register({
    method: 'GET',
    path: '/api/v1/races/:id/results',
    auth: 'user',
    handler: async (ctx) => {
      const raceId = ctx.params.id!;
      const ttl = Number(process.env.RACE_RESULTS_CACHE_MS ?? 60000);
      const hit = raceResultsCache.get(raceId);
      if (hit && Date.now() - hit.at < ttl) return hit.body as Record<string, unknown>;
      const rows = await ctx.client.query(
        `select horse_id, final_score::text as final_score, final_rank, is_burned
         from race_results where race_id = $1 order by final_rank limit 1000`,
        [ctx.params.id],
      );
      const body = { results: rows.rows };
      if (rows.rows.length > 0) {
        raceResultsCache.set(raceId, { at: Date.now(), body });
        if (raceResultsCache.size > RESULTS_CACHE_CAP) {
          const oldest = raceResultsCache.keys().next().value;
          if (oldest) raceResultsCache.delete(oldest);
        }
      }
      return body;
    },
  });

  // Race Replay verification: recompute everything from the revealed seed
  // and the immutable snapshot — anyone can audit any race.
  registry.register({
    method: 'GET',
    path: '/api/v1/races/:id/replay',
    auth: 'user',
    handler: async (ctx) => {
      const race = await ctx.client.query<{ race_engine_version: string }>(
        `select race_engine_version from races where id = $1`,
        [ctx.params.id],
      );
      if (!race.rows[0]) throw new ApiError('NOT_FOUND', 'Race not found');
      try {
        await verifyReplayInputs(ctx.client, ctx.params.id!, race.rows[0].race_engine_version);
        return { race_id: ctx.params.id, verified: true };
      } catch (error) {
        return {
          race_id: ctx.params.id,
          verified: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/revenge-buffs/current',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select buff_rarity::text as buff_rarity, buff_bonus_score::text as buff_bonus_score,
                status::text as status, applied_horse_id, generated_at::text as generated_at
         from revenge_buffs where user_id = $1 and status in ('ACTIVE', 'APPLIED')`,
        [ctx.userId],
      );
      if (!rows.rows[0]) throw new ApiError('REVENGE_BUFF_NOT_FOUND', 'No live revenge buff');
      return rows.rows[0];
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/buybacks',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select s.id, s.horse_id, s.status::text as status, s.total_amount::text as total_amount,
                s.day7_clear_date::text as day7_clear_date,
                (select count(*) from buyback_schedule_payments p
                 where p.buyback_schedule_id = s.id and p.status = 'PAID') as payments_paid
         from buyback_schedules s where s.user_id = $1 order by s.created_at desc`,
        [ctx.userId],
      );
      return { buybacks: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/buybacks/:id',
    auth: 'user',
    handler: async (ctx) => {
      const schedule = await ctx.client.query(
        `select id, horse_id, status::text as status, total_amount::text as total_amount,
                day7_clear_date::text as day7_clear_date
         from buyback_schedules where id = $1 and user_id = $2`,
        [ctx.params.id, ctx.userId],
      );
      if (!schedule.rows[0]) throw new ApiError('BUYBACK_NOT_FOUND', 'Buyback schedule not found');
      const payments = await ctx.client.query(
        `select payment_number, due_date::text as due_date, amount::text as amount,
                status::text as status, paid_at::text as paid_at
         from buyback_schedule_payments where buyback_schedule_id = $1 order by payment_number`,
        [ctx.params.id],
      );
      return { ...schedule.rows[0], payments: payments.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/notifications',
    auth: 'user',
    handler: async (ctx) => {
      // is_broadcast: 全員宛(user_id null)の行は既読管理できない(行が共有のため)。
      // 未読カウント・既読化は個人宛のみを対象にする(2026-07-12 通知ページ改修)。
      const rows = await ctx.client.query(
        `select id, notification_type, payload_json, read_at::text as read_at, created_at::text as created_at,
                (user_id is null) as is_broadcast
         from notifications
         where user_id = $1 or user_id is null -- broadcasts (Decision 065)
         order by created_at desc limit 50`,
        [ctx.userId],
      );
      return { notifications: rows.rows };
    },
  });

  // ナビバッジ専用の軽量カウント(2026-07-12 スパイク対策)。従来は全ページ遷移の
  // たびに通知50件(JSON本文込み)を取得してクライアントで数えていた — COUNT 1本
  // (部分インデックス idx_notifications_unread が効く)に置換。
  registry.register({
    method: 'GET',
    path: '/api/v1/notifications/unread-count',
    auth: 'user',
    handler: async (ctx) => {
      const r = await ctx.client.query<{ n: number }>(
        `select count(*)::int as n from notifications where user_id = $1 and read_at is null`,
        [ctx.userId],
      );
      return { unread: r.rows[0]?.n ?? 0 };
    },
  });

  // 既読化(2026-07-12)— 通知ページを開いたら自分宛の未読をまとめて既読にする。
  // ブロードキャスト行(user_id null)は共有行のため対象外。冪等。
  registry.register({
    method: 'POST',
    path: '/api/v1/notifications/read',
    auth: 'user',
    handler: async (ctx) => {
      const r = await ctx.client.query(
        `update notifications set read_at = now()
         where user_id = $1 and read_at is null`,
        [ctx.userId],
      );
      return { marked: r.affectedRows ?? 0 };
    },
  });
}
