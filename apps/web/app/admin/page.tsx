import { serverApi } from '@/lib/server-api';
import {
  AdminDashboardView,
  type AdminDashboard,
  type CockpitDerby,
  type CockpitLastRace,
} from '@/components/AdminDashboardView';

/* 運営コックピット(2026-07-14): 既存APIを並列取得して1画面に集約。
 * 新規エンドポイントなし。dashboard以外は取得失敗しても画面は出す
 * (該当セクションが「取得できず」表示になる)。 */

interface WithdrawalRow {
  requested_amount: string;
}
interface CsRow {
  status: string;
}
interface RecoveryRow {
  completed_at: string | null;
}

export default async function AdminDashboardPage() {
  const [dash, wd, cs, rec, races, derby] = await Promise.all([
    serverApi<AdminDashboard>('/api/v1/admin/dashboard'),
    serverApi<{ withdrawals: WithdrawalRow[] }>('/api/v1/admin/withdrawals'),
    serverApi<{ messages: CsRow[] }>('/api/v1/admin/cs/queue'),
    serverApi<{ recoveries: RecoveryRow[] }>('/api/v1/admin/recovery'),
    serverApi<{ races: CockpitLastRace[] }>('/api/v1/admin/races/overview'),
    serverApi<CockpitDerby>('/api/v1/daily-derby/status'),
  ]);
  if (dash.status !== 200) return <p className="error">ダッシュボードを取得できません。</p>;

  const withdrawals =
    wd.status === 200
      ? {
          count: wd.body.withdrawals.length,
          total: wd.body.withdrawals.reduce((sum, w) => sum + (Number(w.requested_amount) || 0), 0),
        }
      : null;

  return (
    <AdminDashboardView
      data={{
        dashboard: dash.body,
        derby:
          derby.status === 200
            ? {
                next_derby_at: derby.body.next_derby_at,
                server_time: derby.body.server_time,
                tonight_field: derby.body.tonight_field ?? null,
              }
            : null,
        pending: {
          withdrawals,
          cs: cs.status === 200 ? cs.body.messages.filter((m) => m.status === 'PENDING').length : null,
          recovery:
            rec.status === 200 ? rec.body.recoveries.filter((r) => r.completed_at === null).length : null,
        },
        last_race: races.status === 200 ? (races.body.races[0] ?? null) : null,
      }}
    />
  );
}
