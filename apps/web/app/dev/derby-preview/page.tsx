import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { DerbyPreview } from '@/components/daily-derby/DerbyPreview';

/**
 * THE DAILY DERBY live experience preview (ADR-006/007/008).
 * シミュレート時計で 3分前カウントダウン → 20:00 ファンファーレ → LIVE演出 →
 * マーケットプレイス → 個人結果 の全状態を確認できる。
 * 本番では管理者のみ閲覧可(ADMINメニュー「デモ上映」2026-07-12〜)— 20:00を
 * 待たずに演出を上映するためのオーナー用上映室。一般ユーザーは404。
 */
export default async function DerbyPreviewPage() {
  await requireDevPreviewAccess();
  return (
    <>
      <h1>Daily Derby Preview</h1>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        ボタンで各状態へジャンプ、倍速で通し再生できます(20:00 通過でファンファーレ)。
        表示データはデモ用のダミーです — 実際のレースページは /races。
      </p>
      <DerbyPreview />
    </>
  );
}
