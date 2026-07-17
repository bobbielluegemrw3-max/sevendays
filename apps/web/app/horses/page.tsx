import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { StableView, type StableHorse } from '@/components/StableView';
import type { HiddenBadge } from '@/components/HiddenBadges';

interface Session { id: string; status: string }

export default async function StablePage() {
  // 4本を並列取得(2026-07-16 §D: 直列4往復→1往復ぶんの待ちに短縮)。
  // 隠し実績バッジ(EASTER_EGG_PLAN.md)— 取得失敗しても厩舎は表示する。
  const [{ horses }, me, sessionsRes, badgesRes, lang] = await Promise.all([
    serverApiOrLogin<{ horses: StableHorse[] }>('/api/v1/horses'),
    serverApi<{ stable_name?: string | null; training_tickets?: number }>('/api/v1/me'),
    serverApi<{ sessions: Session[] }>('/api/v1/purchase'),
    serverApi<{ badges: HiddenBadge[] }>('/api/v1/hidden-badges'),
    getLang(),
  ]);
  const pendingCount =
    sessionsRes.status === 200
      ? sessionsRes.body.sessions.filter((s) => s.status === 'PENDING_ASSIGNMENT').length
      : 0;
  return (
    <StableView
      lang={lang}
      data={{
        horses,
        pendingCount,
        stableName: me.status === 200 ? me.body.stable_name ?? null : null,
        trainingTickets: me.status === 200 ? me.body.training_tickets ?? 0 : 0,
        hiddenBadges: badgesRes.status === 200 ? badgesRes.body.badges : [],
      }}
    />
  );
}
