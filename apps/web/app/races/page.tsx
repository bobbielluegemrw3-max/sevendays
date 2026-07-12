import { serverApiOrLogin } from '@/lib/server-api';
import { RacesView, type Race } from '@/components/RacesView';
import { DerbyLive } from '@/components/daily-derby/DerbyLive';

/**
 * /races — THE DAILY DERBY(ADR-006/008)。
 * 本番モード固定(オーナー決定 2026-07-12): 実バッチ結線のライブ演出。
 * 旧 DAILY_DERBY_LIVE 環境変数によるプロトタイプ切替は廃止 — 演出の
 * 確認・上映は /dev/derby-preview(管理者のみ・ADMINメニュー「デモ上映」)。
 */
export default async function RacesPage() {
  const { races } = await serverApiOrLogin<{ races: Race[] }>('/api/v1/races');
  return (
    <>
      <h1>The Daily Derby</h1>
      <DerbyLive />
      <RacesView races={races} />
    </>
  );
}
