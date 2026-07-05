import Dashboard from '@/components/Dashboard';

/**
 * Signed-in home. Dashboard itself re-validates the session server-side and
 * bounces stale tokens to /login (serverApiOrLogin), so no extra guard here.
 */
export default function DashboardPage() {
  return <Dashboard />;
}
