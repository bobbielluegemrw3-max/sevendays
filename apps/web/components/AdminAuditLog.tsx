'use client';

import { useMemo, useState } from 'react';
import { statusKind } from '@/components/admin-shared';
import { localDateTime, localDateTimeSec } from '@/lib/format-time';
import s from '../app/admin.module.css';

/* /admin/audit — Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * 検索+ページング。時系列を等幅で縦に走査できるテーブル。 */

export interface AuditRow {
  actor_type: string; actor_id: string | null; action: string;
  reference_type: string | null; reference_id: string | null; created_at: string;
}

const PAGE_SIZE = 25;
const ST: Record<string, string> = { good: s.stGood!, warn: s.stWarn!, bad: s.stBad!, cyan: s.stNeutral!, muted: s.stNeutral! };
/* アクター種別: ADMIN操作は注意色で目立たせ、SYSTEMは中立(HTML準拠)。 */
function actorSt(actorType: string): string {
  return actorType.toUpperCase() === 'ADMIN' ? s.stWarn! : (ST[statusKind(actorType)] === s.stGood ? s.stGood! : s.stNeutral!);
}

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
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>監査ログ</h1>
        </div>
      </div>
      {total === 0 ? (
        <div className={s.empty}>監査ログはまだありません。</div>
      ) : (
        <div>
          <div className={s.controls}>
            <input className={s.inp} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="アクション・対象で検索…" aria-label="監査ログを検索" />
            <select className={s.sel} value={actor} onChange={(e) => { setActor(e.target.value); reset(); }} aria-label="アクター種別">
              <option value="ALL">すべてのアクター</option>
              {actors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className={s.cnt}>{shown === total ? `全${total}件` : `${total}件中 ${shown}件`}</span>
          </div>
          {slice.length > 0 ? (
            <>
              <div className={`${s.tableWrap} ${s.desktopTable}`}>
                <table className={s.tbl}>
                  <thead>
                    <tr><th>時刻</th><th>アクター</th><th>アクター ID</th><th>アクション</th><th>対象</th></tr>
                  </thead>
                  <tbody>
                    {slice.map((r, i) => (
                      <tr key={`${r.created_at}-${i}`}>
                        <td className={s.date}>{localDateTimeSec(r.created_at)}</td>
                        <td><span className={`${s.st} ${actorSt(r.actor_type)}`}>{r.actor_type}</span></td>
                        <td className={s.mono}>{r.actor_id ?? '—'}</td>
                        <td className={s.strong} style={{ fontWeight: 500 }}>{r.action}</td>
                        <td className={s.mono}>{r.reference_type ? `${r.reference_type}:${r.reference_id ?? ''}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={s.mcard}>
                {slice.map((r, i) => (
                  <div key={`${r.created_at}-${i}`} className={s.mc}>
                    <div className={s.mcTop}>
                      <span className={s.mcName} style={{ fontSize: 12.5 }}>{r.action}</span>
                      <span className={`${s.st} ${actorSt(r.actor_type)}`}>{r.actor_type}</span>
                    </div>
                    <div className={s.mcCell}>
                      <span className={s.k}>{localDateTime(r.created_at)}{r.actor_id ? ` · ${r.actor_id.slice(0, 8)}` : ''}</span>
                      <span className={s.v}>{r.reference_type ? `${r.reference_type}:${(r.reference_id ?? '').slice(0, 12)}` : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={s.empty}>条件に一致するログがありません。</div>
          )}
          {pageCount > 1 ? (
            <div className={s.pager}>
              <button type="button" className={s.btn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 前へ</button>
              <span className={s.cnt}>{safePage + 1} / {pageCount}</span>
              <button type="button" className={s.btn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>次へ →</button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
