import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { StableView, type StableHorse } from '@/components/StableView';

interface Session { id: string; status: string }

export default async function StablePage() {
  const { horses } = await serverApiOrLogin<{ horses: StableHorse[] }>('/api/v1/horses');
  const sessionsRes = await serverApi<{ sessions: Session[] }>('/api/v1/purchase');
  const pendingCount =
    sessionsRes.status === 200
      ? sessionsRes.body.sessions.filter((s) => s.status === 'PENDING_ASSIGNMENT').length
      : 0;
  return <StableView data={{ horses, pendingCount }} />;
}
