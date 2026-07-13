'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/client-api';
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

type Cat = 'レース' | '売買' | '報酬' | '入出金' | 'その他';
interface TypeMeta { cls: string; glyph: string; label: string; cat: Cat; lane: string }
const TYPE_META: Record<string, TypeMeta> = {
  RACE_RESULT_READY:      { cls: 'tRace', glyph: '◈', label: 'レース結果', cat: 'レース', lane: 'rgba(0,234,255,0.65)' },
  HORSE_BURNED:           { cls: 'tBurn', glyph: '✕', label: 'Burn', cat: 'レース', lane: 'rgba(255,45,196,0.7)' },
  REVENGE_BUFF_GENERATED: { cls: 'tBurn', glyph: '↺', label: 'Revenge Buff', cat: 'レース', lane: 'rgba(255,45,196,0.5)' },
  BUYBACK_PAYMENT_PAID:   { cls: 'tBuyback', glyph: '◆', label: 'チャンピオン報酬', cat: '報酬', lane: 'rgba(201,168,106,0.7)' },
  BUYBACK_COMPLETED:      { cls: 'tBuyback', glyph: '◆', label: 'チャンピオン報酬', cat: '報酬', lane: 'rgba(201,168,106,0.7)' },
  MEMORIAL_NFT_MINTED:    { cls: 'tBuyback', glyph: '❖', label: '記念NFT', cat: '報酬', lane: 'rgba(201,168,106,0.7)' },
  SUPPORT_BONUS_PAID:     { cls: 'tBuyback', glyph: '♥', label: 'サポートボーナス', cat: '報酬', lane: 'rgba(201,168,106,0.55)' },
  SUPPORT_CELEBRATION_PAID: { cls: 'tBuyback', glyph: '♥', label: 'お祝い金', cat: '報酬', lane: 'rgba(201,168,106,0.55)' },
  ASSIGNMENT_COMPLETED:   { cls: 'tAssignment', glyph: '✦', label: '馬の割当', cat: '売買', lane: 'rgba(0,234,255,0.5)' },
  HORSE_SOLD:             { cls: 'tAssignment', glyph: '↗', label: '売却成立', cat: '売買', lane: 'rgba(0,234,255,0.5)' },
  AUTO_LISTED:            { cls: 'tAssignment', glyph: '⇱', label: '自動出品', cat: '売買', lane: 'rgba(0,234,255,0.4)' },
  AUTO_RESERVED:          { cls: 'tAssignment', glyph: '⟳', label: '自動購入予約', cat: '売買', lane: 'rgba(0,234,255,0.4)' },
  MARKETPLACE_LOCKED:     { cls: 'tDefault', glyph: '…', label: '精算中', cat: '売買', lane: 'rgba(255,255,255,0.18)' },
  MARKETPLACE_REOPENED:   { cls: 'tDefault', glyph: '○', label: '再開', cat: '売買', lane: 'rgba(255,255,255,0.18)' },
  DEPOSIT_CONFIRMED:      { cls: 'tDeposit', glyph: '↓', label: '入金', cat: '入出金', lane: 'rgba(201,168,106,0.6)' },
  WITHDRAWAL_COMPLETED:   { cls: 'tDeposit', glyph: '↑', label: '出金', cat: '入出金', lane: 'rgba(201,168,106,0.6)' },
  WITHDRAWAL_FAILED:      { cls: 'tBurn', glyph: '!', label: '出金エラー', cat: '入出金', lane: 'rgba(255,45,196,0.7)' },
  TRAINING_COMPLETED:     { cls: 'tTraining', glyph: '⤴', label: '調教', cat: 'その他', lane: 'rgba(53,208,127,0.55)' },
  ITEM_DROPPED:           { cls: 'tTraining', glyph: '✧', label: 'アイテム', cat: 'その他', lane: 'rgba(53,208,127,0.45)' },
  ITEM_GIFT_RECEIVED:     { cls: 'tTraining', glyph: '🎁', label: 'ギフト', cat: 'その他', lane: 'rgba(53,208,127,0.45)' },
};
const CATS: Array<'ALL' | Cat> = ['ALL', 'レース', '売買', '報酬', '入出金', 'その他'];

function meta(type: string): TypeMeta {
  return TYPE_META[type] ?? { cls: 'tDefault', glyph: '•', label: 'お知らせ', cat: 'その他', lane: 'rgba(255,255,255,0.18)' };
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
function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}分前`;
  if (mins < 1440) return `${Math.floor(mins / 60)}時間前`;
  return `${Math.floor(mins / 1440)}日前`;
}
const dateOf = (iso: string): string => iso.slice(0, 10);
const dateLabel = (d: string): string => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function NotificationsList({ notifications, preview = false }: { notifications: Notification[]; preview?: boolean }) {
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
      if (needle && !`${titleOf(n)} ${m.label}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [notifications, q, cat, unreadOnly]);

  // 最新日のダイジェスト(絞り込みに依存しない全体の要約)
  const digest = useMemo(() => {
    if (notifications.length === 0) return null;
    const latestDate = dateOf(notifications[0]!.created_at);
    const day = notifications.filter((n) => dateOf(n.created_at) === latestDate);
    const count = (types: string[]) => day.filter((n) => types.includes(n.notification_type)).length;
    const parts: Array<{ label: string; n: number; cls: string }> = [
      { label: 'レース結果', n: count(['RACE_RESULT_READY']), cls: 'tRace' },
      { label: 'Burn', n: count(['HORSE_BURNED']), cls: 'tBurn' },
      { label: '報酬', n: count(['BUYBACK_PAYMENT_PAID', 'BUYBACK_COMPLETED', 'SUPPORT_BONUS_PAID', 'MEMORIAL_NFT_MINTED']), cls: 'tBuyback' },
      { label: '売買', n: count(['ASSIGNMENT_COMPLETED', 'HORSE_SOLD', 'AUTO_LISTED', 'AUTO_RESERVED']), cls: 'tAssignment' },
      { label: '入出金', n: count(['DEPOSIT_CONFIRMED', 'WITHDRAWAL_COMPLETED', 'WITHDRAWAL_FAILED']), cls: 'tDeposit' },
    ].filter((p) => p.n > 0);
    if (parts.length === 0) return null;
    return { date: latestDate, parts, total: day.length };
  }, [notifications]);

  const shown = filtered.length;
  const pageCount = Math.max(1, Math.ceil(shown / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const reset = () => setPage(0);

  if (total === 0) {
    return <div className={s.empty}>通知はまだありません。<br />レース結果・Burn・チャンピオン報酬・売買などがここに届きます。</div>;
  }

  return (
    <div>
      {/* 最新日のダイジェスト */}
      {digest ? (
        <div className={s.digest}>
          <div className={s.digestHead}>
            <span className={s.digestTitle}>{dateLabel(digest.date)} のダイジェスト</span>
            <span className={s.digestCount}>{digest.total}件</span>
          </div>
          <div className={s.digestParts}>
            {digest.parts.map((p) => (
              <span key={p.label} className={`${s.digestChip} ${s[p.cls]!}`}>{p.label} <b>{p.n}</b></span>
            ))}
          </div>
          <div className={s.digestLinks}>
            <Link href="/races" className={s.digestLink}>結果を見る →</Link>
            <Link href="/wallet" className={s.digestLink}>取引履歴 →</Link>
          </div>
        </div>
      ) : null}

      <div className={s.controls}>
        <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="通知を検索…" aria-label="通知を検索" />
        <div className={s.catChips}>
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              className={`${s.catChip} ${cat === c ? s.catChipOn : ''}`}
              onClick={() => { setCat(c); reset(); }}
              aria-pressed={cat === c}
            >
              {c === 'ALL' ? 'すべて' : c}
            </button>
          ))}
        </div>
        <button type="button" className={`${s.toggleBtn} ${unreadOnly ? s.toggleBtnOn : ''}`} onClick={() => { setUnreadOnly((v) => !v); reset(); }} aria-pressed={unreadOnly}>未読のみ</button>
        <span className={s.count}>{shown === total ? `全${total}件` : `${total}件中 ${shown}件`}</span>
      </div>

      {slice.length > 0 ? (
        <div className={s.list}>
          {slice.map((n, i) => {
            const m = meta(n.notification_type);
            const unread = n.read_at == null && !n.is_broadcast;
            const body = bodyOf(n);
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
                      <span className={`${s.typeBadge} ${s[m.cls]!}`}>{m.label}</span>
                      {unread ? <span className={s.dot} /> : null}
                    </div>
                    <div className={`${s.title} ${unread ? s.titleUnread : ''}`}>{titleOf(n)}</div>
                    {body ? <div className={s.sub}>{body}</div> : null}
                  </div>
                  <span className={s.rowRight}>
                    <span className={s.time}>{timeAgo(n.created_at)}</span>
                    <span className={s.openArrow}>→</span>
                  </span>
                </Link>
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
