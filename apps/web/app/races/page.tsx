import { serverApiOrLogin } from '@/lib/server-api';
import { RacesView, type Race } from '@/components/RacesView';

export default async function RacesPage() {
  const { races } = await serverApiOrLogin<{ races: Race[] }>('/api/v1/races');
  return <RacesView races={races} />;
}
