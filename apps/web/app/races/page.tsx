import { serverApiOrLogin } from '@/lib/server-api';
import { RacesView, type Race } from '@/components/RacesView';
import { DerbyPreview } from '@/components/daily-derby/DerbyPreview';
import { DerbyLive } from '@/components/daily-derby/DerbyLive';

/**
 * /races — THE DAILY DERBY(ADR-006/008)。
 * DAILY_DERBY_LIVE=1(Render環境変数)で実バッチ結線のライブモード、
 * 未設定ならオーナー反復確認用のプロトタイプ(操作パネル+ダミーデータ)。
 * ローンチ時はenvを立てるだけ — コード変更・再デプロイ不要。
 */
export default async function RacesPage() {
  const live = process.env.DAILY_DERBY_LIVE === '1';
  const { races } = await serverApiOrLogin<{ races: Race[] }>('/api/v1/races');
  return (
    <>
      <h1>The Daily Derby</h1>
      {live ? (
        <DerbyLive />
      ) : (
        <>
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.6rem' }}>
            20:00 ライブ演出のプロトタイプ(表示データはダミー)。リリース時に DAILY_DERBY_LIVE=1 で実バッチへ結線します。
          </p>
          <DerbyPreview />
        </>
      )}
      <RacesView races={races} />
    </>
  );
}
