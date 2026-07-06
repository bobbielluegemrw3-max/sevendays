import { serverApiOrLogin } from '@/lib/server-api';
import { RacesView, type Race } from '@/components/RacesView';
import { DerbyPreview } from '@/components/daily-derby/DerbyPreview';

export default async function RacesPage() {
  const { races } = await serverApiOrLogin<{ races: Race[] }>('/api/v1/races');
  return (
    <>
      <h1>The Daily Derby</h1>
      <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.6rem' }}>
        20:00 ライブ演出のプロトタイプ(表示データはダミー)。リリース前に実際の20:00バッチへ結線します。
      </p>
      <DerbyPreview />
      <RacesView races={races} />
    </>
  );
}
