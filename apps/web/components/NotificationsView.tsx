import { NotificationsList, type Notification } from '@/components/NotificationsList';
import { isLvDisplayMode } from '@/lib/i18n';
import { APP_COPY, fill, type Lang } from '@/lib/i18n';
import s from '../app/notifications.module.css';

/* ============================================================================
 * /notifications(通知)再設計 — ダッシュボード Option 1c と同じ部品言語。
 * これまで生JSON表示だった通知を整理。純粋な表示コンポーネント。一覧の操作系は
 * client の <NotificationsList> に委譲。データ取得層 page.tsx は依頼側で結線。
 * 表示内容は Notification の値のみ(架空値なし)。
 * ========================================================================== */

export function NotificationsView({ notifications, preview = false, lang = 'ja' }: { notifications: Notification[]; preview?: boolean; lang?: Lang }) {
  const t = APP_COPY[lang].notif;
  // V2実装-7b: 保存済みpayload(イベント時に描画済みの文言)もLV表記へ
  const lvMode = isLvDisplayMode();
  // ブロードキャスト(共有行)は既読管理できないため未読数から除外
  const unread = notifications.filter((n) => n.read_at == null && !n.is_broadcast).length;

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <span className={s.h1}>{t.title}</span>
        {unread > 0 ? <span className={s.unreadPill}>{fill(t.unread_tpl, { n: unread })}</span> : null}
        <span className={s.readNote}>{t.read_note}</span>
      </div>
      <NotificationsList notifications={notifications} preview={preview} lvMode={lvMode} t={t} />
    </div>
  );
}
