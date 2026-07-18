'use client';

import { toLvText } from '@/lib/i18n-shared';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/client-api';
import { localDate } from '@/lib/format-time';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/notifications.module.css';

/* ============================================================================
 * NotificationsList — 通知ページ改修(2026-07-12)。
 * ①最新日のダイジェストカード(件数の要約+導線) ②日付グループ見出し
 * ③カテゴリチップ絞り込み ④各通知は関連ページへのリンク(左端は種別色レーン)
 * ⑤開いたら自分宛の未読を自動で既読化(バッジは次の遷移で消える)。
 * 表示は Notification の実データのみ。ブロードキャスト(共有行)は既読管理外。
 * ========================================================================== */

export interface Notification {
  id: string; notification_type: string;
  payload_json: Record<string, unknown> | null;
  read_at: string | null; created_at: string;
  is_broadcast?: boolean;
}

const PAGE_SIZE = 15;

type Cat = 'race' | 'trade' | 'reward' | 'money' | 'other';
interface TypeMeta { cls: string; glyph: string; cat: Cat; lane: string }
const TYPE_META: Record<string, TypeMeta> = {
  RACE_RESULT_READY:      { cls: 'tRace', glyph: '◈', cat: 'race', lane: 'rgba(0,234,255,0.65)' },
  HORSE_BURNED:           { cls: 'tBurn', glyph: '✕', cat: 'race', lane: 'rgba(255,45,196,0.7)' },
  REVENGE_BUFF_GENERATED: { cls: 'tBurn', glyph: '↺', cat: 'race', lane: 'rgba(255,45,196,0.5)' },
  BUYBACK_PAYMENT_PAID:   { cls: 'tBuyback', glyph: '◆', cat: 'reward', lane: 'rgba(201,168,106,0.7)' },
  BUYBACK_COMPLETED:      { cls: 'tBuyback', glyph: '◆', cat: 'reward', lane: 'rgba(201,168,106,0.7)' },
  MEMORIAL_NFT_MINTED:    { cls: 'tBuyback', glyph: '❖', cat: 'reward', lane: 'rgba(201,168,106,0.7)' },
  SUPPORT_BONUS_PAID:     { cls: 'tBuyback', glyph: '♥', cat: 'reward', lane: 'rgba(201,168,106,0.55)' },
  SUPPORT_CELEBRATION_PAID: { cls: 'tBuyback', glyph: '♥', cat: 'reward', lane: 'rgba(201,168,106,0.55)' },
  ASSIGNMENT_COMPLETED:   { cls: 'tAssignment', glyph: '✦', cat: 'trade', lane: 'rgba(0,234,255,0.5)' },
  HORSE_SOLD:             { cls: 'tAssignment', glyph: '↗', cat: 'trade', lane: 'rgba(0,234,255,0.5)' },
  AUTO_LISTED:            { cls: 'tAssignment', glyph: '⇱', cat: 'trade', lane: 'rgba(0,234,255,0.4)' },
  AUTO_RESERVED:          { cls: 'tAssignment', glyph: '⟳', cat: 'trade', lane: 'rgba(0,234,255,0.4)' },
  MARKETPLACE_LOCKED:     { cls: 'tDefault', glyph: '…', cat: 'trade', lane: 'rgba(255,255,255,0.18)' },
  MARKETPLACE_REOPENED:   { cls: 'tDefault', glyph: '○', cat: 'trade', lane: 'rgba(255,255,255,0.18)' },
  DEPOSIT_CONFIRMED:      { cls: 'tDeposit', glyph: '↓', cat: 'money', lane: 'rgba(201,168,106,0.6)' },
  WITHDRAWAL_COMPLETED:   { cls: 'tDeposit', glyph: '↑', cat: 'money', lane: 'rgba(201,168,106,0.6)' },
  WITHDRAWAL_FAILED:      { cls: 'tBurn', glyph: '!', cat: 'money', lane: 'rgba(255,45,196,0.7)' },
  TRAINING_COMPLETED:     { cls: 'tTraining', glyph: '⤴', cat: 'other', lane: 'rgba(53,208,127,0.55)' },
  ITEM_DROPPED:           { cls: 'tTraining', glyph: '✧', cat: 'other', lane: 'rgba(53,208,127,0.45)' },
  ITEM_GIFT_RECEIVED:     { cls: 'tTraining', glyph: '🎁', cat: 'other', lane: 'rgba(53,208,127,0.45)' },
};
const CATS: Array<'ALL' | Cat> = ['ALL', 'race', 'trade', 'reward', 'money', 'other'];

function meta(type: string): TypeMeta {
  return TYPE_META[type] ?? { cls: 'tDefault', glyph: '•', cat: 'other', lane: 'rgba(255,255,255,0.18)' };
}
/** 種別ラベルは辞書から(payload に title があればそれを優先)。 */
function labelOf(type: string, t: AppDict['notif']): string {
  return t.types[type] ?? t.type_default;
}
function titleOf(n: Notification, t: AppDict['notif'], lvMode = false): string {
  const title = n.payload_json?.['title'];
  if (typeof title === 'string' && title) return lvMode ? toLvText(title) : title;
  return labelOf(n.notification_type, t);
}
function bodyOf(n: Notification, lvMode = false): string | null {
  const b = n.payload_json?.['body'];
  return typeof b === 'string' && b ? (lvMode ? toLvText(b) : b) : null;
}
/** 通知 → 関連ページ(「読む」から「次の行動」へ)。 */
function hrefOf(n: Notification): string {
  const raw = n.payload_json?.['horse_id'];
  const horseId = typeof raw === 'string' ? raw : null;
  switch (n.notification_type) {
    case 'RACE_RESULT_READY':
    case 'HORSE_BURNED':
    case 'REVENGE_BUFF_GENERATED': return '/races';
    case 'BUYBACK_PAYMENT_PAID':
    case 'BUYBACK_COMPLETED': return '/champion';
    case 'SUPPORT_BONUS_PAID':
    case 'SUPPORT_CELEBRATION_PAID': return '/support';
    case 'MEMORIAL_NFT_MINTED':
    case 'ASSIGNMENT_COMPLETED':
    case 'TRAINING_COMPLETED': return horseId ? `/horses/${horseId}` : '/horses';
    case 'HORSE_SOLD':
    case 'DEPOSIT_CONFIRMED':
    case 'WITHDRAWAL_COMPLETED':
    case 'WITHDRAWAL_FAILED': return '/wallet';
    case 'AUTO_LISTED':
    case 'AUTO_RESERVED':
    case 'MARKETPLACE_LOCKED':
    case 'MARKETPLACE_REOPENED': return '/market';
    case 'ITEM_DROPPED':
    case 'ITEM_GIFT_RECEIVED': return '/items';
    default: return '/dashboard';
  }
}
function timeAgo(value: string, t: AppDict['notif']): string {
  // Zなしのナイーブ文字列はUTC扱い(ブラウザ差で相対時刻がズレるのを防ぐ)。
  const iso = value.replace(' ', 'T');
  const hasTz = /[+Z]|[+-]\d{2}:?\d{2}$/.test(iso.slice(10));
  const mins = Math.max(0, Math.floor((Date.now() - new Date(hasTz ? iso : `${iso}Z`).getTime()) / 60000));
  if (mins < 60) return fill(t.min_tpl, { n: mins });
  if (mins < 1440) return fill(t.hour_tpl, { n: Math.floor(mins / 60) });
  return fill(t.day_tpl, { n: Math.floor(mins / 1440) });
}
const dateOf = (iso: string): string => localDate(iso); // 現地日でグルーピング(2026-07-14)
const dateLabel = (d: string): string => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function NotificationsList({ notifications, preview = false, t , lvMode = false}: { notifications: Notification[]; preview?: boolean; t: AppDict['notif'] ; lvMode?: boolean}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'ALL' | Cat>('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);

  // 開いたら自分宛の未読をまとめて既読化(表示中の未読スタイルは保つ —
  // バッジは次のページ遷移で消える)。ブロードキャストは対象外。
  useEffect(() => {
    if (preview) return;
    if (!notifications.some((n) => !n.read_at && !n.is_broadcast)) return;
    void apiFetch('/api/v1/notifications/read', { method: 'POST', body: {} });
    // 失敗しても次回表示で再試行されるだけ — 何も壊れない
  }, [notifications, preview]);

  const total = notifications.length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return notifications.filter((n) => {
      const m = meta(n.notification_type);
      if (cat !== 'ALL' && m.cat !== cat) return false;
      if (unreadOnly && n.read_at != null) return false;
      if (needle && !`${titleOf(n, t, lvMode)} ${labelOf(n.notification_type, t)}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [notifications, q, cat, unreadOnly, t]);

  // 最新日のダイジェスト(絞り込みに依存しない全体の要約)
  const digest = useMemo(() => {
    if (notifications.length === 0) return null;
    const latestDate = dateOf(notifications[0]!.created_at);
    const day = notifications.filter((n) => dateOf(n.created_at) === latestDate);
    const count = (types: string[]) => day.filter((n) => types.includes(n.notification_type)).length;
    const parts: Array<{ label: string; n: number; cls: string }> = [
      { label: labelOf('RACE_RESULT_READY', t), n: count(['RACE_RESULT_READY']), cls: 'tRace' },
      { label: labelOf('HORSE_BURNED', t), n: count(['HORSE_BURNED']), cls: 'tBurn' },
      { label: t.cats.reward, n: count(['BUYBACK_PAYMENT_PAID', 'BUYBACK_COMPLETED', 'SUPPORT_BONUS_PAID', 'MEMORIAL_NFT_MINTED']), cls: 'tBuyback' },
      { label: t.cats.trade, n: count(['ASSIGNMENT_COMPLETED', 'HORSE_SOLD', 'AUTO_LISTED', 'AUTO_RESERVED']), cls: 'tAssignment' },
      { label: t.cats.money, n: count(['DEPOSIT_CONFIRMED', 'WITHDRAWAL_COMPLETED', 'WITHDRAWAL_FAILED']), cls: 'tDeposit' },
    ].filter((p) => p.n > 0);
    if (parts.length === 0) return null;
    return { date: latestDate, parts, total: day.length };
  }, [notifications, t]);

  const shown = filtered.length;
  const pageCount = Math.max(1, Math.ceil(shown / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const reset = () => setPage(0);

  if (total === 0) {
    return <div className={s.empty}>{t.empty_a}<br />{t.empty_b}</div>;
  }

  return (
    <div>
      {/* 最新日のダイジェスト */}
      {digest ? (
        <div className={s.digest}>
          <div className={s.digestHead}>
            <span className={s.digestTitle}>{fill(t.digest_title_tpl, { d: dateLabel(digest.date) })}</span>
            <span className={s.digestCount}>{fill(t.count_tpl, { n: digest.total })}</span>
          </div>
          <div className={s.digestParts}>
            {digest.parts.map((p) => (
              <span key={p.label} className={`${s.digestChip} ${s[p.cls]!}`}>{p.label} <b>{p.n}</b></span>
            ))}
          </div>
          <div className={s.digestLinks}>
            <Link href="/races" className={s.digestLink}>{t.digest_results}</Link>
            <Link href="/wallet" className={s.digestLink}>{t.digest_history}</Link>
          </div>
        </div>
      ) : null}

      <div className={s.controls}>
        <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder={t.search_ph} aria-label={t.search_ph} />
        <div className={s.catChips}>
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              className={`${s.catChip} ${cat === c ? s.catChipOn : ''}`}
              onClick={() => { setCat(c); reset(); }}
              aria-pressed={cat === c}
            >
              {c === 'ALL' ? t.cat_all : t.cats[c]}
            </button>
          ))}
        </div>
        <button type="button" className={`${s.toggleBtn} ${unreadOnly ? s.toggleBtnOn : ''}`} onClick={() => { setUnreadOnly((v) => !v); reset(); }} aria-pressed={unreadOnly}>{t.unread_only}</button>
        <span className={s.count}>{shown === total ? fill(t.count_all_tpl, { n: total }) : fill(t.count_some_tpl, { total, shown })}</span>
      </div>

      {slice.length > 0 ? (
        <div className={s.list}>
          {slice.map((n, i) => {
            const m = meta(n.notification_type);
            const unread = n.read_at == null && !n.is_broadcast;
            const body = bodyOf(n, lvMode);
            const d = dateOf(n.created_at);
            const prev = i > 0 ? dateOf(slice[i - 1]!.created_at) : null;
            return (
              <div key={n.id}>
                {d !== prev ? <div className={s.dateHead}>── {dateLabel(d)} ──</div> : null}
                <Link
                  href={hrefOf(n)}
                  className={`${s.row} ${unread ? s.rowUnread : ''}`}
                  style={{ borderLeft: `3px solid ${m.lane}` }}
                >
                  <span className={`${s.icon} ${s[m.cls]!}`}>{m.glyph}</span>
                  <div className={s.body}>
                    <div className={s.topLine}>
                      <span className={`${s.typeBadge} ${s[m.cls]!}`}>{labelOf(n.notification_type, t)}</span>
                      {unread ? <span className={s.dot} /> : null}
                    </div>
                    <div className={`${s.title} ${unread ? s.titleUnread : ''}`}>{titleOf(n, t, lvMode)}</div>
                    {body ? <div className={s.sub}>{body}</div> : null}
                  </div>
                  <span className={s.rowRight}>
                    <span className={s.time}>{timeAgo(n.created_at, t)}</span>
                    <span className={s.openArrow}>→</span>
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>{t.empty_filtered}</div>
      )}

      {pageCount > 1 ? (
        <div className={s.pager}>
          <button type="button" className={s.pagerBtn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prev}</button>
          <span className={s.pageLabel}>{safePage + 1} / {pageCount}</span>
          <button type="button" className={s.pagerBtn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>{t.next}</button>
        </div>
      ) : null}
    </div>
  );
}
