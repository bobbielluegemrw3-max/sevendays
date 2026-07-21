import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { BandRacePreview } from '@/components/daily-derby/BandRacePreview';

/**
 * 帯レース(FUN_V3 施策G「帯の可視化」)のプレビュー。
 * BURN は帯内スコア下位N頭切り = 既に競走である。それを確定済みデータの
 * 開示順序だけで見せる幕を、動かしながら詰めるための上映室。本番では管理者のみ。
 */
export default async function BandRacePreviewPage() {
  await requireDevPreviewAccess();
  return (
    <>
      <h1>Bracket Race Preview</h1>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        自分のスコアを先に固定し、他馬が1頭ずつ確定するたびに順位が下がる。
        中間順位のデータは存在しないため、動かしているのは「観客がまだ知らない」という一点だけで、
        表示している数字はすべて確定済みの実データ(ここではフィクスチャ)です。
      </p>
      <BandRacePreview />
    </>
  );
}
