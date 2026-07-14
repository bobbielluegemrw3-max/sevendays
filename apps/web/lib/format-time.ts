/**
 * サーバーはタイムスタンプをUTC(NUMERIC::text や ISO)で返す。画面表示は
 * 常に「見ている人の端末のタイムゾーン」に変換する(オーナー指摘 2026-07-14:
 * 日本のユーザーにUTCが出ていた)。Intl 任せなのでどの国でも自動。
 *
 * 入力の揺れを吸収する: 'YYYY-MM-DD HH:MM:SS'(スペース区切り・UTC想定)/
 * ISO('T'区切り・Z有無)どちらも受ける。Zなしはナイーブ=UTCとみなす。
 */

function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.replace(' ', 'T');
  // 日付部(先頭10文字)より後にタイムゾーン指定(Z/+/-)が無ければUTC扱いでZを付す。
  const hasTz = /[+Z]|[+-]\d{2}:?\d{2}$/.test(iso.slice(10));
  const d = new Date(hasTz ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 現地時刻 "YYYY-MM-DD HH:mm"(既定表示)。 */
export function localDateTime(value: string | null | undefined): string {
  const d = parseUtc(value);
  if (!d) return (value ?? '').slice(0, 16);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 現地の日付だけ "YYYY-MM-DD"。 */
export function localDate(value: string | null | undefined): string {
  const d = parseUtc(value);
  if (!d) return (value ?? '').slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 現地の時分秒 "YYYY-MM-DD HH:mm:ss"(監査ログなど秒まで要る場面)。 */
export function localDateTimeSec(value: string | null | undefined): string {
  const d = parseUtc(value);
  if (!d) return (value ?? '').slice(0, 19);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
