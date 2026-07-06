import { notFound } from 'next/navigation';
import { DerbyPreview } from '@/components/daily-derby/DerbyPreview';

/**
 * Dev-only visual preview of THE DAILY DERBY live experience (ADR-006/007/008).
 * シミュレート時計で 3分前カウントダウン → 20:00 ファンファーレ → LIVE演出 →
 * マーケットプレイス → 個人結果 の全状態を確認できる。本番ビルドでは 404。
 */
export default function DerbyPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <>
      <h1>Daily Derby Preview</h1>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        ボタンで各状態へジャンプ、倍速で通し再生できます(20:00 通過でファンファーレ)。
      </p>
      <DerbyPreview />
    </>
  );
}
