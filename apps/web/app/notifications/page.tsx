import { serverApiOrLogin } from '@/lib/server-api';
import { NotificationsView } from '@/components/NotificationsView';
import type { Notification } from '@/components/NotificationsList';

export default async function NotificationsPage() {
  const { notifications } = await serverApiOrLogin<{ notifications: Notification[] }>(
    '/api/v1/notifications',
  );
  return <NotificationsView notifications={notifications} />;
}
