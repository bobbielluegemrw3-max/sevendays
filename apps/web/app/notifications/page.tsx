import { serverApiOrLogin } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { NotificationsView } from '@/components/NotificationsView';
import type { Notification } from '@/components/NotificationsList';

export default async function NotificationsPage() {
  const lang = await getLang();
  const { notifications } = await serverApiOrLogin<{ notifications: Notification[] }>(
    '/api/v1/notifications',
  );
  return <NotificationsView notifications={notifications} lang={lang} />;
}
