'use client';

import { useMemo, useState } from 'react';
import s from '../app/notifications.module.css';

/* ============================================================================
 * NotificationsList — 通知を検索・種別絞り込み・未読のみ・ページングで表示する
 * クライアント。生JSONではなく、種別アイコン + タイトル + 時刻 + 既読/未読で整理。
 * ========================================================================== */

export interface Notification {
  id: string; notification_type: string;
  payload_json: Record<string, unknown> | null;
  read_at: string | null; created_at: string;
}

const PAGE_SIZE = 15;

interface TypeMeta { cls: string; glyph: string; label: string }
const TYPE_META: Record<string, TypeMeta> = {
  RACE_RESULT_READY:    { cls: 'tRace', glyph: '◈', label: 'レース結果' },
  HORSE_BURNED:         { cls: 'tBurn', glyph: '✕', label: 'Burn' },
  BUYBACK_PAYMENT_PAID: { cls: 'tBuyback', glyph: '◆', label: '買い戻し' },
  TRAINING_COMPLETED:   { cls: 'tTraining', glyph: '⤴', label: '調教' },
  DEPOSIT_CONFIRMED:    { cls: 'tDeposit', glyph: '↓', label: '入金' },
  ASSIGNMENT_READY:     { cls: 'tAssignment', glyph: '✦', label: '割当' },
};
function meta(type: string): TypeMeta {
  return TYPE_META[type] ?? { cls: 'tDefault', glyph: '•', label: 'お知らせ' };
}
function titleOf(n: Notification): string {
  const t = n.payload_json?.['title'];
  if (typeof t === 'string' && t) return t;
  return meta(n.notification_type).label;
}
function bodyOf(n: Notification): string | null {
  const b = n.payload_json?.['body'];
  return typeof b === 'string' && b ? b : null;
}
function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}分前`;
  if (mins < 1440) return `${Math.floor(mins / 60)}時間前`;
  return `${Math.floor(mins / 1440)}日前`;
}

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);

  const total = notifications.length;
  const types = useMemo(() => Array.from(new Set(notifications.map((n) => n.notification_type))), [notifications]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return notifications.filter((n) => {
      if (type !== 'ALL' && n.notification_type !== type) return false;
      if (unreadOnly && n.read_at != null) return false;
      if (needle && !`${titleOf(n)} ${meta(n.notification_type).label}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [notifications, q, type, unreadOnly]);

  const shown = filtered.length;
  const pageCount = Math.max(1, Math.ceil(shown / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const reset = () => setPage(0);

  if (total === 0) {
    return <div className={s.empty}>通知はまだありません。<br />レース結果・Burn・買い戻し・調教などがここに届きます。</div>;
  }

  return (
    <div>
      <div className={s.controls}>
        <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="通知を検索…" aria-label="通知を検索" />
        <select className={s.select} value={type} onChange={(e) => { setType(e.target.value); reset(); }} aria-label="種別で絞り込み">
          <option value="ALL">すべての種別</option>
          {types.map((t) => <option key={t} value={t}>{meta(t).label}</option>)}
        </select>
        <button type="button" className={`${s.toggleBtn} ${unreadOnly ? s.toggleBtnOn : ''}`} onClick={() => { setUnreadOnly((v) => !v); reset(); }} aria-pressed={unreadOnly}>未読のみ</button>
        <span className={s.count}>{shown === total ? `全${total}件` : `${total}件中 ${shown}件`}</span>
      </div>

      {slice.length > 0 ? (
        <div className={s.list}>
          {slice.map((n) => {
            const m = meta(n.notification_type);
            const unread = n.read_at == null;
            const body = bodyOf(n);
            return (
              <div key={n.id} className={`${s.row} ${unread ? s.rowUnread : ''}`}>
                <span className={`${s.icon} ${s[m.cls]!}`}>{m.glyph}</span>
                <div className={s.body}>
                  <div className={s.topLine}>
                    <span className={`${s.typeBadge} ${s[m.cls]!}`}>{m.label}</span>
                    {unread ? <span className={s.dot} /> : null}
                  </div>
                  <div className={`${s.title} ${unread ? s.titleUnread : ''}`}>{titleOf(n)}</div>
                  {body ? <div className={s.sub}>{body}</div> : null}
                </div>
                <span className={s.time}>{timeAgo(n.created_at)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>条件に一致する通知がありません。</div>
      )}

      {pageCount > 1 ? (
        <div className={s.pager}>
          <button type="button" className={s.pagerBtn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 前へ</button>
          <span className={s.pageLabel}>{safePage + 1} / {pageCount}</span>
          <button type="button" className={s.pagerBtn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>次へ →</button>
        </div>
      ) : null}
    </div>
  );
}
