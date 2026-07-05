import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/server-api';
import { Landing } from '@/components/Landing';

/**
 * Root is always the public landing page. Signed-in players are redirected to
 * /dashboard so the URL reflects the auth state (bookmarkable, analysable,
 * and the landing stays an anonymous-only page).
 */
export default async function Home() {
  const token = await getAccessToken();
  if (token) redirect('/dashboard');
  return <Landing />;
}
