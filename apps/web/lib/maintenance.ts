import type { SqlClient } from '@sevendays/shared';

/* メンテナンスモード(Decision 098)の読み取り。
 * 全リクエストが通る場所(api-bridge / レイアウト)から呼ばれるため、
 * 10秒のプロセス内キャッシュでDB往復(ムンバイ≈55ms)を抑える。
 * トグル反映は最大10秒遅延 — 運用上許容(管理者は即時、自分は非遮断のため)。
 * 読み取り失敗時はfail-open(サイトを開けておく) — メンテフラグの障害で
 * サイト全体を落とさない。 */

export interface MaintenanceState {
  enabled: boolean;
  message: string;
}

const TTL_MS = 10_000;
let cached: { at: number; state: MaintenanceState } | null = null;

export async function getMaintenanceState(client: SqlClient): Promise<MaintenanceState> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.state;
  try {
    const result = await client.query<{ value: { enabled?: boolean; message?: string } }>(
      `select value from system_settings where key = 'maintenance'`,
    );
    const value = result.rows[0]?.value ?? {};
    const state: MaintenanceState = {
      enabled: value.enabled === true,
      message: typeof value.message === 'string' ? value.message : '',
    };
    cached = { at: Date.now(), state };
    return state;
  } catch {
    return { enabled: false, message: '' };
  }
}

/** トグル直後の即時反映(同一プロセス)とテスト用。 */
export function invalidateMaintenanceCache(): void {
  cached = null;
}
