import { NotificationsList, type Notification } from '@/components/NotificationsList';
import s from '../app/notifications.module.css';

/* ============================================================================
 * /notifications(通知)再設計 — ダッシュボード Option 1c と同じ部品言語。
 * これまで生JSON表示だった通知を整理。純粋な表示コンポーネント。一覧の操作系は
 * client の <NotificationsList> に委譲。データ取得層 page.tsx は依頼側で結線。
 * 表示内容は Notification の値のみ(架空値なし)。
 * ========================================================================== */

export function NotificationsView({ notifications, preview = false }: { notifications: Notification[]; preview?: boolean }) {
  // ブロードキャスト(共有行)は既読管理できないため未読数から除外
  const unread = notifications.filter((n) => n.read_at == null && !n.is_broadcast).length;

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <span className={s.h1}>通知</span>
        {unread > 0 ? <span className={s.unreadPill}>未読 {unread}</span> : null}
        <span className={s.readNote}>開くと既読になります · タップで関連ページへ</span>
      </div>
      <NotificationsList notifications={notifications} preview={preview} />
    </div>
  );
}
