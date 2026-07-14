import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { StableView, type StableHorse } from '@/components/StableView';
import type { HiddenBadge } from '@/components/HiddenBadges';

interface Session { id: string; status: string }

export default async function StablePage() {
  const { horses } = await serverApiOrLogin<{ horses: StableHorse[] }>('/api/v1/horses');
  const me = await serverApi<{ stable_name?: string | null }>('/api/v1/me');
  const sessionsRes = await serverApi<{ sessions: Session[] }>('/api/v1/purchase');
  // 隠し実績バッジ(EASTER_EGG_PLAN.md)— 取得失敗しても厩舎は表示する。
  const badgesRes = await serverApi<{ badges: HiddenBadge[] }>('/api/v1/hidden-badges');
  const pendingCount =
    sessionsRes.status === 200
      ? sessionsRes.body.sessions.filter((s) => s.status === 'PENDING_ASSIGNMENT').length
      : 0;
  return (
    <StableView
      data={{
        horses,
        pendingCount,
        stableName: me.status === 200 ? me.body.stable_name ?? null : null,
        hiddenBadges: badgesRes.status === 200 ? badgesRes.body.badges : [],
      }}
    />
  );
}
