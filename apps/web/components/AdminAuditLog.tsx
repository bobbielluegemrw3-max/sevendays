'use client';

import { useMemo, useState } from 'react';
import { statusKind } from '@/components/admin-shared';
import s from '../app/admin.module.css';

/* /admin/audit 再設計 — 監査ログ。件数が伸びるため検索 + ページングのクライアント。 */

export interface AuditRow {
  actor_type: string; actor_id: string | null; action: string;
  reference_type: string | null; reference_id: string | null; created_at: string;
}

const PAGE_SIZE = 25;
const PILL: Record<string, string> = { good: s.pillGood!, warn: s.pillWarn!, bad: s.pillBad!, cyan: s.pillCyan!, muted: s.pillMuted! };

export function AdminAuditLog({ audit }: { audit: AuditRow[] }) {
  const [q, setQ] = useState('');
  const [actor, setActor] = useState('ALL');
  const [page, setPage] = useState(0);

  const total = audit.length;
  const actors = useMemo(() => Array.from(new Set(audit.map((r) => r.actor_type))), [audit]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return audit.filter((r) => {
      if (actor !== 'ALL' && r.actor_type !== actor) return false;
      if (needle && !`${r.action} ${r.actor_type} ${r.actor_id ?? ''} ${r.reference_type ?? ''} ${r.reference_id ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [audit, q, actor]);

  const shown = filtered.length;
  const pageCount = Math.max(1, Math.ceil(shown / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const reset = () => setPage(0);

  return (
    <div className={s.wrap}>
      <div className={s.h1}>監査ログ</div>
      {total === 0 ? (
        <div className={s.empty}>監査ログはまだありません。</div>
      ) : (
        <div>
          <div className={s.controls}>
            <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="アクション・対象で検索…" aria-label="監査ログを検索" />
            <select className={s.select} value={actor} onChange={(e) => { setActor(e.target.value); reset(); }} aria-label="アクター種別">
              <option value="ALL">すべてのアクター</option>
              {actors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className={s.cnt}>{shown === total ? `全${total}件` : `${total}件中 ${shown}件`}</span>
          </div>
          {slice.length > 0 ? (
            <div className={s.list}>
              {slice.map((r, i) => (
                <div key={`${r.created_at}-${i}`} className={s.row}>
                  <span className={s.cDate}>{r.created_at.slice(0, 19)}</span>
                  <span className={`${s.pill} ${PILL[statusKind(r.actor_type)] ?? s.pillCyan}`}>{r.actor_type}</span>
                  {r.actor_id ? <span className={s.cMono}>{r.actor_id}</span> : null}
                  <span className={`${s.cText} ${s.cSpace}`}>{r.action}</span>
                  <span className={s.cMono}>{r.reference_type ? `${r.reference_type}:${r.reference_id ?? ''}` : '—'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.empty}>条件に一致するログがありません。</div>
          )}
          {pageCount > 1 ? (
            <div className={s.pager}>
              <button type="button" className={s.pagerBtn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 前へ</button>
              <span className={s.pageLabel}>{safePage + 1} / {pageCount}</span>
              <button type="button" className={s.pagerBtn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>次へ →</button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
