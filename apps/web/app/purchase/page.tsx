import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { PurchaseView, type Session } from '@/components/PurchaseView';
import type { Assignment } from '@/components/AssignmentList';

export default async function PurchasePage() {
  const { sessions } = await serverApiOrLogin<{ sessions: Session[] }>('/api/v1/purchase');
  const assignments = await serverApi<{ assignments: Assignment[] }>('/api/v1/assignments');
  return (
    <PurchaseView
      sessions={sessions}
      assignments={assignments.status === 200 ? assignments.body.assignments : []}
    />
  );
}
