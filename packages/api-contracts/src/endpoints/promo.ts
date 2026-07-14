import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { batchDateFor, insertNotification } from '@sevendays/shared';
import { renderNotification } from '@sevendays/domain';
import { getMarketplaceState } from '@sevendays/settlement-engine';
import { ApiError } from '../errors.js';
import type { ApiRegistry, HandlerContext } from '../router.js';

/**
 * セミナー特典馬(Decision 095)。
 *
 * 運営厩舎(PROMO_STABLE_EMAIL、既定 goldbenchan@gmail.com)が通常の購入予約で
 * 仕入れた馬を、①管理者の直接配布 ②引換コード で1人1頭プレゼントする。
 *  - 配布馬は gifted_at が付く(Decision 094)= 手動出品不可のボーナスチップ。
 *    スマート出品対象には残る(094と同じ整理)。
 *  - 割当は若いDAY優先(新規ユーザーに最長の7日間体験を渡す)。残った古株は
 *    運営の馬として走り切り、Day7走破の200 USDTで自己清算される。
 *  - 引換は1ユーザー1回/キャンペーン(DB一意制約)。
 *  - 管理者配布はDecision 094の「3頭/日」送信上限の対象外(監査記録必須)。
 */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外

function generateCode(): string {
  const pick = (n: number) =>
    Array.from(randomBytes(n), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `SDD-${pick(4)}-${pick(4)}`;
}

function promoStableEmail(): string {
  return process.env.PROMO_STABLE_EMAIL ?? 'goldbenchan@gmail.com';
}

function requireAdminRole(ctx: HandlerContext): void {
  if (ctx.auth.kind !== 'admin' || ctx.auth.roles.length === 0) {
    throw new ApiError('FORBIDDEN', 'Admin role required');
  }
}

async function audit(
  ctx: HandlerContext,
  action: string,
  referenceType: string,
  referenceId: string | null,
): Promise<void> {
  await ctx.client.query(
    `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id)
     values ('ADMIN', $1, $2, $3, $4)`,
    [ctx.userId, action, referenceType, referenceId],
  );
}

async function stableUserId(ctx: HandlerContext): Promise<string> {
  const stable = await ctx.client.query<{ id: string }>(
    `select id from users where lower(email) = lower($1) and status = 'ACTIVE'`,
    [promoStableEmail()],
  );
  if (!stable.rows[0]) {
    throw new ApiError('PROMO_OUT_OF_STOCK', 'Promo stable account is not provisioned');
  }
  return stable.rows[0].id;
}

/** 運営厩舎の配布可能在庫(ACTIVE・出品中でない)。若いDAY優先の決定論順。 */
const STOCK_ORDER = `order by h.current_day asc, h.created_at asc, h.id asc`;

async function availableStock(
  ctx: HandlerContext,
  stableId: string,
): Promise<{ id: string; name: string; current_day: number }[]> {
  const rows = await ctx.client.query<{ id: string; name: string; current_day: number }>(
    `select h.id, h.name, h.current_day from horses h
     where h.owner_user_id = $1 and h.status = 'ACTIVE'
       and not exists (select 1 from market_listings ml
                       where ml.horse_id = h.id and ml.status = 'LISTED')
     ${STOCK_ORDER}`,
    [stableId],
  );
  return rows.rows;
}

/** 在庫から1頭を受取人へ転送(gifted_at付与+転送記録+通知)。トランザクション内で呼ぶ。 */
async function transferStockHorse(
  ctx: HandlerContext,
  args: { stableId: string; recipientId: string; idempotencyKey: string },
): Promise<{ horseId: string; horseName: string }> {
  const picked = await ctx.client.query<{ id: string; name: string }>(
    `select h.id, h.name from horses h
     where h.owner_user_id = $1 and h.status = 'ACTIVE'
       and not exists (select 1 from market_listings ml
                       where ml.horse_id = h.id and ml.status = 'LISTED')
     ${STOCK_ORDER}
     limit 1 for update`,
    [args.stableId],
  );
  if (!picked.rows[0]) throw new ApiError('PROMO_OUT_OF_STOCK', 'No promo horses in stock');
  const horse = picked.rows[0];

  await ctx.client.query(
    `update horses set owner_user_id = $2, gifted_at = now()
     where id = $1 and owner_user_id = $3 and status = 'ACTIVE'`,
    [horse.id, args.recipientId, args.stableId],
  );
  await ctx.client.query(
    `insert into user_transfers (sender_user_id, recipient_user_id, asset_type, horse_id, idempotency_key)
     values ($1, $2, 'HORSE', $3, $4)`,
    [args.stableId, args.recipientId, horse.id, args.idempotencyKey],
  );
  const rendered = renderNotification('HORSE_GIFT_RECEIVED', {
    sender: 'SEVEN DAYS DERBY',
    horse_name: horse.name,
  });
  await insertNotification(ctx.client, {
    userId: args.recipientId,
    type: 'HORSE_GIFT_RECEIVED',
    dedupeKey: `notif:HORSE_GIFT_RECEIVED:${args.idempotencyKey}`,
    payload: { ...rendered, horse_id: horse.id, promo: true },
  });
  return { horseId: horse.id, horseName: horse.name };
}

export function registerPromoEndpoints(registry: ApiRegistry): void {
  // ---- 管理者: コード生成(印刷/CSV用にコード文字列を返す) -----------------
  registry.register({
    method: 'POST',
    path: '/api/v1/admin/promo/codes',
    auth: 'admin',
    input: z.object({
      campaign: z.string().min(1).max(64),
      count: z.number().int().min(1).max(500),
      expires_in_days: z.number().int().min(1).max(365).optional(),
    }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      const expiresAt = input.expires_in_days
        ? new Date(Date.now() + input.expires_in_days * 24 * 3600 * 1000).toISOString()
        : null;
      const codes: string[] = [];
      for (let i = 0; i < input.count; i += 1) {
        // 衝突(unique違反)は再生成でリトライ(31^8空間なので実質起きない)
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const code = generateCode();
          try {
            await ctx.client.query(
              `insert into promo_codes (code, campaign, created_by, expires_at) values ($1, $2, $3, $4)`,
              [code, input.campaign, ctx.userId, expiresAt],
            );
            codes.push(code);
            break;
          } catch (error) {
            if (!/promo_codes_code_key|duplicate key/i.test((error as Error).message)) throw error;
          }
        }
      }
      // reference_idはuuid列 — キャンペーン名はactionに含める(promo_codesから検索可能)
      await audit(ctx, `PROMO_CODES_CREATED:${input.campaign}`, 'promo_campaign', null);
      return { campaign: input.campaign, codes, expires_at: expiresAt };
    },
  });

  // ---- 管理者: コード一覧+在庫サマリー ------------------------------------
  registry.register({
    method: 'GET',
    path: '/api/v1/admin/promo/codes',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const codes = await ctx.client.query<{ redeemed_email: string | null }>(
        `select p.code, p.campaign, p.expires_at::text as expires_at,
                p.redeemed_at::text as redeemed_at, p.created_at::text as created_at,
                u.email as redeemed_email, h.name as horse_name
         from promo_codes p
         left join users u on u.id = p.redeemed_by
         left join horses h on h.id = p.horse_id
         order by p.created_at desc limit 500`,
      );
      const stableId = await stableUserId(ctx).catch(() => null);
      const stock = stableId ? await availableStock(ctx, stableId) : [];
      return {
        stable_email: promoStableEmail(),
        stock_count: stock.length,
        stock: stock.slice(0, 50),
        codes: codes.rows.map((r) => ({
          ...r,
          redeemed_email: r.redeemed_email ? `${r.redeemed_email.slice(0, 2)}***` : null,
        })),
      };
    },
  });

  // ---- 管理者: 直接配布(セミナー現地でスタッフが操作・上限なし・監査必須) ----
  registry.register({
    method: 'POST',
    path: '/api/v1/admin/promo/gift',
    auth: 'admin',
    input: z.object({ recipient_email: z.string().email() }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', 'Marketplace is locked during settlement');
      }
      const recipient = await ctx.client.query<{ id: string }>(
        `select id from users where lower(email) = lower($1) and status = 'ACTIVE'`,
        [input.recipient_email],
      );
      if (!recipient.rows[0]) {
        throw new ApiError('GIFT_RECIPIENT_NOT_FOUND', 'No active user with that email');
      }
      const stableId = await stableUserId(ctx);
      if (recipient.rows[0].id === stableId) throw new ApiError('GIFT_SELF', 'Stable cannot gift itself');

      await ctx.client.query('begin');
      try {
        const result = await transferStockHorse(ctx, {
          stableId,
          recipientId: recipient.rows[0].id,
          idempotencyKey: `promo-admin:${recipient.rows[0].id}:${batchDateFor(new Date())}`,
        });
        await audit(ctx, 'PROMO_HORSE_GIFTED', 'horse', result.horseId);
        await ctx.client.query('commit');
        return { horse_id: result.horseId, horse_name: result.horseName, recipient: input.recipient_email };
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        if (/user_transfers_idempotency_key|duplicate key/i.test((error as Error).message)) {
          throw new ApiError('PROMO_ALREADY_REDEEMED', 'This user already received a promo horse today');
        }
        throw error;
      }
    },
  });

  // ---- ユーザー: 引換コード ------------------------------------------------
  registry.register({
    method: 'POST',
    path: '/api/v1/promo/redeem',
    auth: 'user',
    input: z.object({ code: z.string().min(4).max(32) }),
    handler: async (ctx, input) => {
      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', 'Marketplace is locked during settlement');
      }
      const code = input.code.trim().toUpperCase();
      const row = await ctx.client.query<{
        id: string;
        campaign: string;
        redeemed_by: string | null;
        expires_at: string | null;
      }>(
        `select id, campaign, redeemed_by, expires_at::text as expires_at
         from promo_codes where code = $1`,
        [code],
      );
      if (!row.rows[0]) throw new ApiError('PROMO_CODE_INVALID', 'Unknown code');
      const promo = row.rows[0];
      if (promo.redeemed_by) throw new ApiError('PROMO_CODE_USED', 'This code was already used');
      if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
        throw new ApiError('PROMO_CODE_EXPIRED', 'This code has expired');
      }
      const stableId = await stableUserId(ctx);
      if (ctx.userId === stableId) throw new ApiError('GIFT_SELF', 'Stable cannot redeem');

      await ctx.client.query('begin');
      try {
        // 引換確定(1ユーザー1回/キャンペーンは部分一意インデックスが強制)
        const claimed = await ctx.client.query(
          `update promo_codes set redeemed_by = $2, redeemed_at = now()
           where id = $1 and redeemed_by is null`,
          [promo.id, ctx.userId],
        );
        if ((claimed.affectedRows ?? 0) === 0) {
          throw new ApiError('PROMO_CODE_USED', 'This code was already used');
        }
        const result = await transferStockHorse(ctx, {
          stableId,
          recipientId: ctx.userId,
          idempotencyKey: `promo:${promo.id}`,
        });
        await ctx.client.query(`update promo_codes set horse_id = $2 where id = $1`, [
          promo.id,
          result.horseId,
        ]);
        await ctx.client.query('commit');
        return { horse_id: result.horseId, horse_name: result.horseName, campaign: promo.campaign };
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        if (/uq_promo_redeemer_per_campaign/i.test((error as Error).message)) {
          throw new ApiError('PROMO_ALREADY_REDEEMED', 'You already redeemed a code for this campaign');
        }
        throw error;
      }
    },
  });
}
