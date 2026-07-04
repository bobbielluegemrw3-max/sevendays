import { getAccessToken } from '@/lib/server-api';
import { Landing } from '@/components/Landing';
import Dashboard from '@/components/Dashboard';

/**
 * Root: anonymous visitors get the public landing page; signed-in players
 * get the game dashboard (which re-validates the session and bounces to
 * /login if the token is stale).
 */
export default async function Home() {
  const token = await getAccessToken();
  if (!token) return <Landing />;
  return <Dashboard />;
}
