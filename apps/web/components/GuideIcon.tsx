import s from '../app/guide.module.css';

/* GuideIcon — /guide 用のネオン調ラインアイコン(絵文字の置き換え・純SVG)。
 * サーバーコンポーネントで安全に使える(状態なし)。currentColor で色は親から継承。 */

export type GuideIconName =
  | 'google' | 'wallet' | 'mail' | 'user' | 'cart' | 'moon' | 'coins' | 'tag' | 'swap'
  | 'cash' | 'trophy' | 'link' | 'growth' | 'gift' | 'bag' | 'dice' | 'inbox' | 'chain'
  | 'check' | 'outbox' | 'search' | 'send' | 'form' | 'support' | 'alert' | 'info' | 'horse';

const P: Record<GuideIconName, React.ReactNode> = {
  google: <><circle cx="12" cy="12" r="8.5" /><path d="M12 10.5h4.2a4.5 4.5 0 1 1-1.3-3" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 9h13a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H3" /><circle cx="16.5" cy="12.5" r="1.1" fill="currentColor" stroke="none" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M4 7l8 6 8-6" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19a7 7 0 0 1 14 0" /></>,
  cart: <><path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6" /><circle cx="9" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /></>,
  moon: <><path d="M20 13.5A7.5 7.5 0 1 1 10.5 4a6 6 0 0 0 9.5 9.5z" /><path d="M16 5.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" stroke="none" /></>,
  coins: <><ellipse cx="9" cy="7" rx="5.5" ry="2.6" /><path d="M3.5 7v5c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7" /><path d="M9.5 15.4c.8 1.1 3 1.9 5.5 1.9 3 0 5.5-1.2 5.5-2.6v-5c0-1-1.3-1.9-3.2-2.3" /></>,
  tag: <><path d="M4 4h7l9 9-7 7-9-9V4z" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" /></>,
  swap: <><path d="M5 8h13l-3-3M19 16H6l3 3" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9v6M18 9v6" /></>,
  trophy: <><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 15h6M8 20h8M10 15v5M14 15v5" /></>,
  link: <><path d="M9.5 14.5l5-5M8 11l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2" /></>,
  growth: <><path d="M12 20v-7M12 13c0-3 2-5 5-5 0 3-2 5-5 5zM12 13c0-2.5-1.7-4.2-4.2-4.2C7.8 11 9.5 13 12 13z" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18M12 9v11M12 9C9 9 7.5 4 12 4M12 9c3 0 4.5-5 0-5" /></>,
  bag: <><path d="M6 8h12l-1 11a1.5 1.5 0 0 1-1.5 1.4H8.5A1.5 1.5 0 0 1 7 19L6 8z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" /><circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" /></>,
  inbox: <><path d="M4 13l2.5-8h11L20 13v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-5z" /><path d="M4 13h4l1.5 2.5h5L16 13h4" /></>,
  chain: <><rect x="3" y="9" width="7" height="6" rx="3" /><rect x="14" y="9" width="7" height="6" rx="3" /><path d="M9 12h6" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  outbox: <><path d="M4 13l2.5 6.5A1.5 1.5 0 0 0 8 20.5h8a1.5 1.5 0 0 0 1.5-1L20 13" /><path d="M12 15V4M8.5 7.5L12 4l3.5 3.5" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M15.5 15.5L20 20" /></>,
  send: <><path d="M20 4L3 11l6 2.5L20 4zM20 4l-3 15-5-7" /></>,
  form: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>,
  support: <><path d="M5 13v-1a7 7 0 0 1 14 0v1" /><rect x="3.5" y="13" width="4" height="6" rx="1.5" /><rect x="16.5" y="13" width="4" height="6" rx="1.5" /><path d="M18.5 19v1a3 3 0 0 1-3 3h-2.5" /></>,
  alert: <><path d="M12 4l9 15H3l9-15z" /><path d="M12 10v4M12 16.5v.4" strokeWidth={1.8} /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.4" strokeWidth={1.8} /></>,
  horse: <><path d="M5 20c0-5 2-8 6-9l1-3 2 1 3-3 1 2-2 2 2 1c1 3 0 6-2 8" /><path d="M8 20h9" /></>,
};

export function GuideIcon({ name, large = false }: { name: GuideIconName; large?: boolean }) {
  return (
    <svg className={`${s.ic} ${large ? s.icLg : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
