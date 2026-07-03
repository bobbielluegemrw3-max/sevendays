import { serverApiOrLogin } from '@/lib/server-api';

interface Notification {
  id: string;
  notification_type: string;
  payload_json: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export default async function NotificationsPage() {
  const { notifications } = await serverApiOrLogin<{ notifications: Notification[] }>(
    '/api/v1/notifications',
  );
  return (
    <>
      <h1>通知</h1>
      <div className="panel">
        {notifications.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>種別</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id}>
                  <td className="muted">{n.created_at.slice(0, 19)}</td>
                  <td>
                    <span className="badge">{n.notification_type}</span>
                  </td>
                  <td>
                    <code>{JSON.stringify(n.payload_json ?? {})}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">通知はまだありません。</p>
        )}
      </div>
    </>
  );
}
