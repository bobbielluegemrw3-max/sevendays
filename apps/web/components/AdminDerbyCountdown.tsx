'use client';
import { useEffect, useState } from 'react';

/* 20:00 MYTバッチまでの残り時間(admin コックピット用)。
 * サーバー時刻とのオフセットで端末時計のズレを補正。SSR初期値は
 * プレースホルダーにしてハイドレーション不一致を避ける。 */
export function AdminDerbyCountdown({
  targetIso,
  serverNowIso,
}: {
  targetIso: string;
  serverNowIso: string;
}) {
  const [text, setText] = useState('--:--:--');
  useEffect(() => {
    const offset = Date.parse(serverNowIso) - Date.now();
    const tick = () => {
      const remainMs = Date.parse(targetIso) - (Date.now() + offset);
      if (!Number.isFinite(remainMs)) return;
      if (remainMs <= 0) {
        setText('開催中');
        return;
      }
      const total = Math.floor(remainMs / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const sec = total % 60;
      setText(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso, serverNowIso]);
  return <>{text}</>;
}
