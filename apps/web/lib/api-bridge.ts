import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import {
  buildApiRegistry,
  type ApiResponse,
  type AuthContext,
} from '@sevendays/api-contracts';
import { sendCsEmail } from '@sevendays/api-contracts';
import type { SqlClient } from '@sevendays/shared';
import { getMaintenanceState } from './maintenance';

/**
 * The ONLY bridge between HTTP/RSC and the API contracts registry
 * (07_API.md). Framework-free on purpose: the route handler and server
 * components both call dispatchBridge, and tests drive it directly against
 * PGlite.
 *
 * Auth: the Supabase access token is verified LOCALLY (HS256 via
 * SUPABASE_JWT_SECRET) — no network hop per request. users.id equals the
 * Supabase auth uid (RLS keys on auth.uid()), so the first authenticated
 * request provisions the users row. Admin roles come from
 * admin_role_grants (active grants only); internal endpoints are
 * unreachable here by construction (auth kind 'internal' is never built).
 */

const registry = buildApiRegistry();

export interface BridgeRequest {
  method: string;
  /** Registry path, e.g. `/api/v1/wallet`. */
  path: string;
  body?: unknown;
  idempotencyKey?: string | null;
  accessToken?: string | null;
}

// Supabase projects on the new "JWT Signing Keys" system sign access tokens
// asymmetrically (ES256/RS256, verified via the project's public JWKS); the
// legacy HS256 shared secret only covers older projects/tokens. Support
// both: pick the path from the token's alg header.
let remoteJwks: JWTVerifyGetKey | null = null;
function supabaseRemoteJwks(): JWTVerifyGetKey | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  if (!remoteJwks) {
    // jose caches the fetched keys in memory and refreshes on unknown kid.
    remoteJwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return remoteJwks;
}

export interface AuthVerifyOptions {
  /** JWKS override for asymmetric tokens (tests use a local key set). */
  jwks?: JWTVerifyGetKey;
  /** Invite code (sdd_ref cookie) — binds direct_referrer_user_id at FIRST
   *  provisioning only (Decision 074); the DB keeps it immutable after. */
  referralCode?: string | null;
}

async function verifyAccessToken(
  accessToken: string,
  jwtSecret: string,
  options?: AuthVerifyOptions,
): Promise<JWTPayload | null> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(accessToken).alg;
  } catch {
    return null;
  }
  try {
    if (alg === 'HS256') {
      const { payload } = await jwtVerify(accessToken, new TextEncoder().encode(jwtSecret), {
        algorithms: ['HS256'],
      });
      return payload;
    }
    const jwks = options?.jwks ?? supabaseRemoteJwks();
    if (!jwks) return null;
    const { payload } = await jwtVerify(accessToken, jwks, { algorithms: ['ES256', 'RS256'] });
    return payload;
  } catch {
    return null;
  }
}

/** Wallet address from a Supabase Web3 session's claims (tolerant lookup). */
function extractWalletAddress(payload: JWTPayload): string | null {
  const meta = payload.user_metadata as Record<string, unknown> | undefined;
  const custom = (meta?.custom_claims ?? undefined) as Record<string, unknown> | undefined;
  for (const candidate of [custom?.address, meta?.address, (payload as Record<string, unknown>).address]) {
    if (typeof candidate === 'string' && /^0x[0-9a-fA-F]{40}$/.test(candidate)) {
      return candidate.toLowerCase();
    }
  }
  return null;
}

/** Resolve the auth context for an EXISTING users row, or null when the row
 *  is absent (callers then take the wallet-alias / provisioning path).
 *  遷移速度(2026-07-12): DBがムンバイ・Webがシンガポールで1往復≈55msのため、
 *  状態ゲート+presence更新+ロール取得を1クエリに統合(従来3往復)。 */
async function resolveContextFor(client: SqlClient, userId: string): Promise<AuthContext | null> {
  const result = await client.query<{ status: string; roles: string[] }>(
    // - アカウント状態ゲート(2026-07-09): SUSPENDED/BANNED/DELETED は有効なJWTでも
    //   認証済みとして扱わない(=全ユーザーAPIが401)。管理者凍結の実効化。
    // - presence: 認証済みアクセスの最終時刻(60秒スロットルで書込みを抑制)。
    //   データ変更CTEは参照されなくても必ず1回実行される(PostgreSQL保証)。
    `with touch as (
       update users set last_seen_at = now()
        where id = $1 and (last_seen_at is null or last_seen_at < now() - interval '60 seconds')
     )
     select u.status::text as status,
            coalesce(array_agg(g.role::text) filter (where g.role is not null), '{}') as roles
       from users u
       left join admin_role_grants g on g.user_id = u.id and g.revoked_at is null
      where u.id = $1
      group by u.status`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.status !== 'ACTIVE') return { kind: 'anonymous' };
  if (row.roles.length > 0) {
    return { kind: 'admin', userId, roles: row.roles };
  }
  return { kind: 'user', userId };
}

export async function buildAuthContext(
  client: SqlClient,
  accessToken: string | null | undefined,
  jwtSecret: string,
  options?: AuthVerifyOptions,
): Promise<AuthContext> {
  if (!accessToken) return { kind: 'anonymous' };

  const payload = await verifyAccessToken(accessToken, jwtSecret, options);
  if (!payload) return { kind: 'anonymous' };
  const userId = typeof payload.sub === 'string' ? payload.sub : null;
  if (!userId) return { kind: 'anonymous' };

  // Existing account: fast path — ONE round trip per page render.
  const existing = await resolveContextFor(client, userId);
  if (existing) return existing;

  // Decision 072 aliasing: a Web3 session whose wallet is linked to an
  // existing game account resolves to THAT account (no second account is
  // ever provisioned for a linked wallet).
  const walletAddress = extractWalletAddress(payload);
  if (walletAddress) {
    const linked = await client.query<{ user_id: string }>(
      `select user_id from user_wallets where wallet_address = $1`,
      [walletAddress],
    );
    if (linked.rows[0]) {
      const aliased = await resolveContextFor(client, linked.rows[0].user_id);
      if (aliased) return aliased;
    }
  }

  // First-login provisioning: everything downstream (RLS, ledger accounts,
  // deposit addresses) keys on users.id = auth.uid().
  const email = typeof payload.email === 'string' && payload.email !== '' ? payload.email : `${userId}@user.sevendays`;

  // Invite capture (Decision 074): resolve the sdd_ref cookie to a sponsor
  // exactly once, here. An unknown/own code degrades to "no sponsor" —
  // signup must never fail because of a bad invite link.
  let referrerId: string | null = null;
  if (options?.referralCode) {
    const sponsor = await client.query<{ id: string }>(
      `select id from users where referral_code = $1`,
      [options.referralCode.toLowerCase()],
    );
    referrerId = sponsor.rows[0]?.id ?? null;
    if (referrerId === userId) referrerId = null;
  }

  // Decision 090 (2026-07-13): 紹介URLなしの登録は運営ルート(既定スポンサー=
  // goldbenchan本体・env DEFAULT_SPONSOR_EMAIL で変更可)へ自動帰属し、配置も
  // 直下に即確定する — 無帰属ユーザーの上位7ティア分ボーナスを運営チェーン
  // (+7〜+2エイリアス+本体)が受け止める。招待経由の登録は従来どおり
  // スポンサーが手動で配置する(自動配置しない)。
  // 既定スポンサーが存在しない環境(テストDB等)は従来どおり無所属ルート。
  let autoPlace = false;
  if (!referrerId) {
    const sponsorEmail = process.env.DEFAULT_SPONSOR_EMAIL ?? 'goldbenchan@gmail.com';
    const fallback = await client.query<{ id: string }>(
      `select id from users where email = $1`,
      [sponsorEmail],
    );
    const fallbackId = fallback.rows[0]?.id ?? null;
    if (fallbackId && fallbackId !== userId) {
      referrerId = fallbackId;
      autoPlace = true;
    }
  }

  try {
    await client.query(
      `insert into users (id, email, direct_referrer_user_id) values ($1, $2, $3) on conflict (id) do nothing`,
      [userId, email, referrerId],
    );
  } catch (error) {
    if (!/duplicate key/i.test((error as Error).message)) throw error;
    // Another users row still holds this email (its owner changed address
    // in Supabase and the email was re-registered). The verified token
    // proves THIS auth uid owns the email now — tombstone the stale record
    // so the new user is never locked out of provisioning.
    await client.query(
      `update users set email = 'moved+' || id || '+' || email where email = $2 and id <> $1`,
      [userId, email],
    );
    await client.query(
      `insert into users (id, email, direct_referrer_user_id) values ($1, $2, $3) on conflict (id) do nothing`,
      [userId, email, referrerId],
    );
  }

  // Decision 090: 自動帰属時は配置も既定スポンサー直下で即確定(監査痕跡つき)。
  // 配置トリガーが placed_at 設定と循環検出を担う。既配置(並行実行)は無変更。
  if (autoPlace && referrerId) {
    const placed = await client.query(
      `update users set placement_parent_user_id = $2
       where id = $1 and placement_parent_user_id is null`,
      [userId, referrerId],
    );
    if ((placed.affectedRows ?? 0) > 0) {
      await client.query(
        `insert into placement_audit (user_id, old_parent_user_id, new_parent_user_id, actor_user_id, action, reason)
         values ($1, null, $2, $2, 'PLACE', 'Decision 090: auto-attach (no referral URL)')`,
        [userId, referrerId],
      );
    }
  }

  // A Web3-first account claims its wallet immediately — this is what makes
  // a later "link this wallet to another account" attempt fail loudly
  // instead of silently splitting identities.
  if (walletAddress) {
    await client.query(
      `insert into user_wallets (user_id, wallet_address) values ($1, $2) on conflict do nothing`,
      [userId, walletAddress],
    );
  }

  // ウェルカムメール(2026-07-09): 初回プロビジョニング時のみ・実メールのみ。
  // 送信失敗でサインアップを絶対に落とさない(fire-and-forget)。
  if (!email.endsWith('@user.sevendays')) {
    void sendCsEmail({
      toEmail: email,
      subject: 'Welcome to Seven Days Derby / ようこそ Seven Days Derby へ',
      body: [
        'Dear Owner,',
        '',
        'Thank you for joining Seven Days Derby.',
        'Your horse and its seven-day story start here.',
        '',
        '- Races run every night at 20:00 (MYT)',
        '- A horse that survives Day 7 becomes a Champion: 200 USDT in rewards and a memorial NFT',
        '- Races carry the risk of BURN (the NFT is destroyed) - please read the rules page first',
        '',
        'Questions? Just reply to this email.',
        '',
        '----------------------------------------',
        '',
        'オーナー様',
        '',
        'Seven Days Derby へのご登録ありがとうございます。',
        'あなたの馬と7日間の物語が、ここから始まります。',
        '',
        '・毎晩 20:00(MYT)にレースが開催されます',
        '・Day7 を走破した馬はチャンピオンとして 200 USDT の報酬と記念NFTを獲得します',
        '・レースには NFT が消滅する「BURN」のリスクがあります — ルールページを必ずご確認ください',
        '',
        'ご不明な点は、このメールにそのまま返信してください。',
        '',
        'Seven Days Derby Support',
        'Seven Days Derby サポート',
      ].join(String.fromCharCode(10)),
    }).catch(() => undefined);
  }

  // The insert above guarantees the row exists; null here would mean the DB
  // dropped it mid-request — treat as unauthenticated rather than crash.
  return (await resolveContextFor(client, userId)) ?? { kind: 'anonymous' };
}

export async function dispatchBridge(
  client: SqlClient,
  request: BridgeRequest,
  jwtSecret: string,
  options?: AuthVerifyOptions,
): Promise<ApiResponse> {
  const auth = await buildAuthContext(client, request.accessToken, jwtSecret, options);
  return dispatchWithAuth(client, request, auth);
}

/** Dispatch with a pre-resolved AuthContext (server components resolve auth
 *  ONCE per render via React cache instead of per data call).
 *
 *  メンテナンスモード(Decision 098): ONの間、管理者以外のディスパッチは
 *  全て503 MAINTENANCEで遮断する(RSC経由もHTTP経由もここを通る)。
 *  管理者は素通り = メンテ解除の操作も管理画面も通常どおり。ワーカーは
 *  このブリッジを使わない(internal認証・別サーバー)ためバッチは走り続ける。 */
export async function dispatchWithAuth(
  client: SqlClient,
  request: Omit<BridgeRequest, 'accessToken'>,
  auth: AuthContext,
): Promise<ApiResponse> {
  if (auth.kind !== 'admin') {
    const maintenance = await getMaintenanceState(client);
    if (maintenance.enabled) {
      return {
        status: 503,
        body: {
          error: {
            code: 'MAINTENANCE',
            message: maintenance.message || 'Seven Days Derby is under maintenance.',
          },
        },
      };
    }
  }
  return registry.dispatch(client, {
    method: request.method,
    path: request.path,
    auth,
    body: request.body,
    idempotencyKey: request.idempotencyKey ?? null,
  });
}
