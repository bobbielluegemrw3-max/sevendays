import { NotificationsList, type Notification } from '@/components/NotificationsList';
import s from '../app/notifications.module.css';

/* ============================================================================
 * /notifications(通知)再設計 — ダッシュボード Option 1c と同じ部品言語。
 * これまで生JSON表示だった通知を整理。純粋な表示コンポーネント。一覧の操作系は
 * client の <NotificationsList> に委譲。データ取得層 page.tsx は依頼側で結線。
 * 表示内容は Notification の値のみ(架空値なし)。
 * ========================================================================== */

export function NotificationsView({ notifications }: { notifications: Notification[] }) {
  const unread = notifications.filter((n) => n.read_at == null).length;

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <span className={s.h1}>通知</span>
        {unread > 0 ? <span className={s.unreadPill}>未読 {unread}</span> : null}
      </div>
      <NotificationsList notifications={notifications} />
    </div>
  );
}
