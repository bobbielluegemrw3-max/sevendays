import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';

/**
 * devプレビューのアクセスガード(オーナー要望 2026-07-11)。
 * 開発環境では常に表示。本番では管理者アカウントのみ表示し、それ以外は従来どおり404。
 *
 * プレビューはフィクスチャ固定の表示専用ページ(実データ・実資金操作なし)なので、
 * 管理者への公開は安全。ハンドオフの全状態(BURNED/チャンピオン/出品中/Day別)を
 * 本番サイト上でレビューできるようにする。実ページに架空のサンプル馬は決して入れない
 * — ACTIVEのサンプルは実レースに出走してしまい、記念馬サンプルは公開の殿堂に
 * 実在チャンピオンとして表示されてしまうため。
 */
export async function requireDevPreviewAccess(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  const me = await serverApi<{ is_admin?: boolean }>('/api/v1/me');
  if (me.status === 200 && me.body.is_admin === true) return;
  notFound();
}
