import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { LedgerPreview } from './LedgerPreview';

/**
 * /ledger 公平性の証明リデザイン プレビュー — デザイナー正典 Ledger.html の忠実写経(仕様書.md)。
 * ③名乗り(公平性の証明) ①COMMIT·REVEAL前面 ②累計+公開データから計算した率(式併記)
 * 日ごとの記録(カレンダー/日次集計/CSV/検証) ④その日の成約(折りたたみ)。
 * 累計・割合は fixture(7日)から実際にクライアント集計・計算(新APIなし)。CSVは実際にDL可。
 * 管理者のみ・それ以外404。承認後に本番 LedgerView へ結線(機構=transparency API不変)。
 */
export default async function LedgerPreviewPage(): Promise<React.JSX.Element> {
  await requireDevPreviewAccess();
  return <LedgerPreview />;
}
