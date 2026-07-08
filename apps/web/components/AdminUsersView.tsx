'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/admin.module.css';

/* /admin/users — メール検索 → 一覧 → 行クリックで詳細展開。 */

interface AdminUserRow {
  id: string;
  email: string;
  status: string;
  created_at: string;
  referrer_email: string | null;
  balance: string;
  active_horses: number;
  burns: number;
  items_available: number;
  direct_referrals: number;
}

interface AdminUserDetail {
  user: {
    id: string; email: string; status: string; created_at: string;
    referrer_email: string | null; balance_available: string; balance_locked: string;
  };
  horses: { id: string; name: string; status: string; current_day: number; rarity: string; horse_type: string }[];
  items: { item_key: string; status: string; count: number }[];
  item_usages: { item_key: string; effective_race_date: string; status: string; settled_outcome: string | null }[];
  direct_referrals: { id: string; email: string; created_at: string }[];
}

function money(v: string): string {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v;
}

export function AdminUsersView() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);

  const search = useCallback(async (q: string) => {
    setBusy(true);
    setError(null);
    const result = await apiFetch<{ users: AdminUserRow[] }>(
      '/api/v1/admin/users/search',
      { method: 'POST', body: { query: q, limit: 50 } },
    );
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '検索に失敗しました');
      return;
    }
    setRows((result.body as { users: AdminUserRow[] }).users);
  }, []);

  useEffect(() => { void search(''); }, [search]);

  async function toggleDetail(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    const result = await apiFetch<AdminUserDetail>(`/api/v1/admin/users/${id}`, { method: 'GET' });
    if (result.status === 200) setDetail(result.body as AdminUserDetail);
  }

  return (
    <div className={s.wrap}>
      <div className={s.h1}>ユーザー</div>

      <div className={s.controls}>
        <input
          className={s.search}
          value={query}
          placeholder="メールアドレスで検索(部分一致)"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void search(query); }}
        />
        <button type="button" className={s.pagerBtn} disabled={busy} onClick={() => void search(query)}>
          {busy ? '検索中…' : '検索'}
        </button>
        <span className={s.cnt}>{rows.length}件(最新順・最大50件)</span>
      </div>

      {error ? <p className={s.error}>{error}</p> : null}

      {rows.length > 0 ? (
        <div className={s.list}>
          {rows.map((u) => (
            <div key={u.id}>
              <button
                type="button"
                className={s.userRowBtn}
                onClick={() => void toggleDetail(u.id)}
              >
                <div className={s.row}>
                  <span className={s.cMain}>{u.email}</span>
                  <span className={`${s.pill} ${u.status === 'ACTIVE' ? s.pillGood : s.pillMuted}`}>{u.status}</span>
                  <span className={s.cAmount}>{money(u.balance)}<small>USDT</small></span>
                  <span className={s.steps}>馬 <b>{u.active_horses}</b> · BURN <b>{u.burns}</b> · 所持品 <b>{u.items_available}</b> · 直紹介 <b>{u.direct_referrals}</b></span>
                  <span className={`${s.cDate} ${s.cSpace}`}>{u.created_at.slice(0, 10)} 登録</span>
                </div>
              </button>
              {openId === u.id && (
                <div className={s.detailPanel}>
                  {detail && detail.user.id === u.id ? (
                    <>
                      <div className={s.kpis}>
                        <div className={s.metric}>
                          <div className={s.metricK}>利用可能残高</div>
                          <div className={s.metricV}>{money(detail.user.balance_available)}<small> USDT</small></div>
                        </div>
                        <div className={s.metric}>
                          <div className={s.metricK}>ロック中残高</div>
                          <div className={s.metricV}>{money(detail.user.balance_locked)}<small> USDT</small></div>
                        </div>
                        <div className={s.metric}>
                          <div className={s.metricK}>紹介者</div>
                          <div className={s.metricJson}>{detail.user.referrer_email ?? 'なし(ルート)'}</div>
                        </div>
                        <div className={s.metric}>
                          <div className={s.metricK}>ユーザーID</div>
                          <div className={s.metricJson}>{detail.user.id}</div>
                        </div>
                      </div>

                      <div className={s.secLabel}>馬({detail.horses.length})</div>
                      {detail.horses.length > 0 ? (
                        <div className={s.list}>
                          {detail.horses.map((h) => (
                            <div key={h.id} className={s.row}>
                              <span className={s.cMain}>{h.name}</span>
                              <span className={`${s.pill} ${h.status === 'ACTIVE' ? s.pillGood : s.pillMuted}`}>{h.status}</span>
                              <span className={s.steps}>Day <b>{h.current_day}</b></span>
                              <span className={`${s.pill} ${s.pillCyan}`}>{h.rarity}</span>
                              <span className={s.cMono}>{h.horse_type}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className={s.empty}>馬なし</div>}

                      <div className={s.secLabel}>アイテム所持({detail.items.reduce((a, b) => a + b.count, 0)})</div>
                      {detail.items.length > 0 ? (
                        <div className={s.cBadges}>
                          {detail.items.map((it) => (
                            <span key={`${it.item_key}:${it.status}`} className={`${s.pill} ${it.status === 'AVAILABLE' ? s.pillCyan : s.pillMuted}`}>
                              {it.item_key} × {it.count}({it.status})
                            </span>
                          ))}
                        </div>
                      ) : <div className={s.empty}>アイテムなし</div>}

                      <div className={s.secLabel}>直紹介({detail.direct_referrals.length})</div>
                      {detail.direct_referrals.length > 0 ? (
                        <div className={s.cBadges}>
                          {detail.direct_referrals.map((c) => (
                            <span key={c.id} className={`${s.pill} ${s.pillMuted}`}>{c.email}</span>
                          ))}
                        </div>
                      ) : <div className={s.empty}>直紹介なし</div>}
                    </>
                  ) : (
                    <div className={s.cnt}>読み込み中…</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !busy ? (
        <div className={s.empty}>該当するユーザーがいません。</div>
      ) : null}
    </div>
  );
}
