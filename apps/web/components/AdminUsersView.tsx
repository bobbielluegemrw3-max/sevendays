'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/admin.module.css';

/* /admin/users — 検索 → 行クリックで完全なユーザー台帳(dossier)を展開。
 * 管理アクション: アイテム付与 / USDT付与申請(二重承認) / 凍結・解除。 */

interface AdminUserRow {
  id: string; email: string; status: string; created_at: string;
  referrer_email: string | null; balance: string;
  active_horses: number; burns: number; items_available: number; direct_referrals: number;
}

interface Dossier {
  user: {
    id: string; email: string; status: string; created_at: string;
    last_seen_at: string | null; online: boolean; last_sign_in_at: string | null;
    referrer_email: string | null; balance_available: string; balance_locked: string;
  };
  horses: { id: string; name: string; status: string; current_day: number; rarity: string; horse_type: string; created_at: string }[];
  items: { item_key: string; status: string; count: number }[];
  item_usages: { item_key: string; effective_race_date: string; status: string; settled_outcome: string | null }[];
  direct_referrals: { id: string; email: string; created_at: string }[];
  deposits: { amount: string; status: string; tx_hash: string; detected_at: string }[];
  withdrawals: { requested_amount: string; net_amount: string; status: string; to_address: string; requested_at: string }[];
  purchases: { status: string; locked_amount: string; assigned_price: string | null; refund_amount: string | null; created_at: string }[];
  buybacks: { id: string; horse_name: string; status: string; total_amount: string; day7_clear_date: string; paid_count: number; paid_amount: string }[];
  sales: { listing_price: string; status: string; current_day: number; listed_at: string; horse_name: string }[];
  upline: { email: string; depth: number }[];
  org_size: number;
  fund_grants: { id: string; amount: string; reason: string; status: string; requested_by_email: string; created_at: string }[];
}

interface PendingGrant {
  id: string; amount: string; reason: string; status: string;
  created_at: string; user_email: string; requested_by_email: string; requested_by: string;
}

interface CatalogItem { key: string; name_ja: string; band: string }

function money(v: string): string {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v;
}

function ts(v: string | null): string {
  return v ? v.slice(0, 19).replace('T', ' ') : '—';
}

export function AdminUsersView() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [grants, setGrants] = useState<PendingGrant[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // action form state
  const [grantItemKey, setGrantItemKey] = useState('');
  const [grantQty, setGrantQty] = useState(1);
  const [fundAmount, setFundAmount] = useState('');
  const [fundReason, setFundReason] = useState('');

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

  const loadGrants = useCallback(async () => {
    const result = await apiFetch<{ grants: PendingGrant[] }>('/api/v1/admin/fund-grants', { method: 'GET' });
    if (result.status === 200) setGrants((result.body as { grants: PendingGrant[] }).grants);
  }, []);

  useEffect(() => {
    void search('');
    void loadGrants();
    void (async () => {
      const r = await apiFetch<{ items: CatalogItem[] }>('/api/v1/items/catalog', { method: 'GET' });
      if (r.status === 200) setCatalog((r.body as { items: CatalogItem[] }).items);
    })();
  }, [search, loadGrants]);

  const openDossier = useCallback(async (id: string) => {
    const result = await apiFetch<Dossier>(`/api/v1/admin/users/${id}`, { method: 'GET' });
    if (result.status === 200) setDossier(result.body as Dossier);
  }, []);

  async function toggleDetail(id: string) {
    setActionMsg(null);
    if (openId === id) { setOpenId(null); setDossier(null); return; }
    setOpenId(id);
    setDossier(null);
    await openDossier(id);
  }

  async function act(path: string, body: unknown, withKey = false): Promise<void> {
    setActionMsg(null);
    const result = await apiFetch(path, {
      method: 'POST',
      body,
      ...(withKey ? { idempotencyKey: crypto.randomUUID() } : {}),
    });
    if (result.status !== 200) {
      setActionMsg(errorMessage(result.body) ?? '操作に失敗しました');
      return;
    }
    setActionMsg('完了しました');
    if (openId) await openDossier(openId);
    await loadGrants();
    await search(query);
  }

  const pending = grants.filter((g) => g.status === 'PENDING');

  return (
    <div className={s.wrap}>
      <div className={s.h1}>ユーザー</div>

      {/* 承認待ちのUSDT付与(申請者と別の管理者が承認) */}
      {pending.length > 0 && (
        <div>
          <div className={s.secLabel}>PENDING GRANTS · 承認待ちUSDT付与({pending.length})</div>
          <div className={s.list}>
            {pending.map((g) => (
              <div key={g.id} className={`${s.row} ${s.rowWarn}`}>
                <span className={s.cMain}>{g.user_email}</span>
                <span className={s.cAmount}>{money(g.amount)}<small>USDT</small></span>
                <span className={s.cText}>{g.reason}</span>
                <span className={s.cDate}>申請: {g.requested_by_email}</span>
                <span className={s.cActions}>
                  <button
                    type="button"
                    className={s.pagerBtn}
                    onClick={() => void act(`/api/v1/admin/fund-grants/${g.id}/approve`, undefined)}
                  >
                    承認して送金
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className={s.note} style={{ marginTop: 8 }}>
            憲法により<b>申請した管理者自身は承認できません</b>(FINANCE_ADMIN+SUPER_ADMINの2名承認)。
          </div>
        </div>
      )}

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
              <button type="button" className={s.userRowBtn} onClick={() => void toggleDetail(u.id)}>
                <div className={s.row}>
                  <span className={s.cMain}>{u.email}</span>
                  <span className={`${s.pill} ${u.status === 'ACTIVE' ? s.pillGood : s.pillBad}`}>{u.status}</span>
                  <span className={s.cAmount}>{money(u.balance)}<small>USDT</small></span>
                  <span className={s.steps}>馬 <b>{u.active_horses}</b> · BURN <b>{u.burns}</b> · 所持品 <b>{u.items_available}</b> · 直紹介 <b>{u.direct_referrals}</b></span>
                  <span className={`${s.cDate} ${s.cSpace}`}>{u.created_at.slice(0, 10)} 登録</span>
                </div>
              </button>

              {openId === u.id && (
                <div className={s.detailPanel}>
                  {dossier && dossier.user.id === u.id ? (
                    <>
                      {/* プレゼンス */}
                      <div className={s.cBadges}>
                        {dossier.user.online
                          ? <span className={`${s.pill} ${s.pillGood}`}>● オンライン(5分以内にアクセス)</span>
                          : <span className={`${s.pill} ${s.pillMuted}`}>オフライン</span>}
                        <span className={`${s.pill} ${s.pillCyan}`}>最終ログイン: {ts(dossier.user.last_sign_in_at)}</span>
                        <span className={`${s.pill} ${s.pillMuted}`}>最終アクセス: {ts(dossier.user.last_seen_at)}</span>
                      </div>

                      <div className={s.kpis}>
                        <div className={s.metric}>
                          <div className={s.metricK}>利用可能残高</div>
                          <div className={s.metricV}>{money(dossier.user.balance_available)}<small> USDT</small></div>
                        </div>
                        <div className={s.metric}>
                          <div className={s.metricK}>ロック中残高</div>
                          <div className={s.metricV}>{money(dossier.user.balance_locked)}<small> USDT</small></div>
                        </div>
                        <div className={s.metric}>
                          <div className={s.metricK}>組織人数(7段まで)</div>
                          <div className={s.metricV}>{dossier.org_size.toLocaleString()}<small> 人</small></div>
                        </div>
                        <div className={s.metric}>
                          <div className={s.metricK}>ユーザーID</div>
                          <div className={s.metricJson}>{dossier.user.id}</div>
                        </div>
                      </div>

                      {/* MLM位置 */}
                      <div className={s.secLabel}>MLM · MAP位置(上位チェーン)</div>
                      <div className={s.cText}>
                        {dossier.upline.length > 0
                          ? ['本人', ...dossier.upline.map((p) => p.email)].join(' ← ')
                          : '本人がルート(紹介者なし)'}
                      </div>
                      {dossier.direct_referrals.length > 0 && (
                        <div className={s.cBadges}>
                          {dossier.direct_referrals.map((c) => (
                            <span key={c.id} className={`${s.pill} ${s.pillMuted}`}>{c.email}</span>
                          ))}
                        </div>
                      )}

                      {/* 入出金 */}
                      <div className={s.secLabel}>USDT入金({dossier.deposits.length})/ 出金({dossier.withdrawals.length})</div>
                      {dossier.deposits.length + dossier.withdrawals.length > 0 ? (
                        <div className={s.list}>
                          {dossier.deposits.map((d, i) => (
                            <div key={`d${i}`} className={s.row}>
                              <span className={`${s.pill} ${s.pillGood}`}>入金</span>
                              <span className={s.cAmount}>{money(d.amount)}<small>USDT</small></span>
                              <span className={`${s.pill} ${s.pillCyan}`}>{d.status}</span>
                              <span className={s.cDate}>{ts(d.detected_at)}</span>
                              <span className={`${s.cMono} ${s.cSpace}`}>{d.tx_hash}</span>
                            </div>
                          ))}
                          {dossier.withdrawals.map((w, i) => (
                            <div key={`w${i}`} className={s.row}>
                              <span className={`${s.pill} ${s.pillWarn}`}>出金</span>
                              <span className={s.cAmount}>{money(w.requested_amount)}<small>USDT</small></span>
                              <span className={`${s.pill} ${s.pillCyan}`}>{w.status}</span>
                              <span className={s.cDate}>{ts(w.requested_at)}</span>
                              <span className={`${s.cMono} ${s.cSpace}`}>{w.to_address}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className={s.empty}>入出金はまだありません</div>}

                      {/* 購入・利確・売却 */}
                      <div className={s.secLabel}>馬の購入({dossier.purchases.length})</div>
                      {dossier.purchases.length > 0 ? (
                        <div className={s.list}>
                          {dossier.purchases.map((p, i) => (
                            <div key={i} className={s.row}>
                              <span className={s.cDate}>{ts(p.created_at)}</span>
                              <span className={s.cAmount}>{money(p.assigned_price ?? p.locked_amount)}<small>USDT</small></span>
                              <span className={`${s.pill} ${s.pillCyan}`}>{p.status}</span>
                              {p.refund_amount && Number(p.refund_amount) > 0 && (
                                <span className={s.steps}>返金 <b>{money(p.refund_amount)}</b></span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : <div className={s.empty}>購入履歴なし</div>}

                      <div className={s.secLabel}>利確(Day7走破の買戻し)({dossier.buybacks.length})</div>
                      {dossier.buybacks.length > 0 ? (
                        <div className={s.list}>
                          {dossier.buybacks.map((b) => (
                            <div key={b.id} className={s.row}>
                              <span className={s.cMain}>{b.horse_name}</span>
                              <span className={s.cAmount}>{money(b.paid_amount)} / {money(b.total_amount)}<small>USDT</small></span>
                              <span className={s.steps}>支払 <b>{b.paid_count}</b>/7</span>
                              <span className={`${s.pill} ${s.pillCyan}`}>{b.status}</span>
                              <span className={s.cDate}>Day7: {b.day7_clear_date}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className={s.empty}>利確履歴なし</div>}

                      <div className={s.secLabel}>マーケット出品({dossier.sales.length})</div>
                      {dossier.sales.length > 0 ? (
                        <div className={s.list}>
                          {dossier.sales.map((m, i) => (
                            <div key={i} className={s.row}>
                              <span className={s.cMain}>{m.horse_name}</span>
                              <span className={s.cAmount}>{money(m.listing_price)}<small>USDT</small></span>
                              <span className={`${s.pill} ${m.status === 'ASSIGNED' ? s.pillGood : s.pillMuted}`}>
                                {m.status === 'ASSIGNED' ? '売却成立' : m.status}
                              </span>
                              <span className={s.steps}>Day <b>{m.current_day}</b></span>
                              <span className={s.cDate}>{ts(m.listed_at)}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className={s.empty}>出品履歴なし</div>}

                      {/* 馬・アイテム */}
                      <div className={s.secLabel}>馬の保有({dossier.horses.length})</div>
                      {dossier.horses.length > 0 ? (
                        <div className={s.list}>
                          {dossier.horses.map((h) => (
                            <div key={h.id} className={s.row}>
                              <span className={s.cMain}>{h.name}</span>
                              <span className={`${s.pill} ${h.status === 'ACTIVE' ? s.pillGood : s.pillMuted}`}>{h.status}</span>
                              <span className={s.steps}>Day <b>{h.current_day}</b></span>
                              <span className={`${s.pill} ${s.pillCyan}`}>{h.rarity}</span>
                              <span className={s.cMono}>{h.horse_type}</span>
                              <span className={`${s.cDate} ${s.cSpace}`}>{ts(h.created_at)}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className={s.empty}>馬なし</div>}

                      <div className={s.secLabel}>アイテム所持({dossier.items.reduce((a, b) => a + b.count, 0)})</div>
                      {dossier.items.length > 0 ? (
                        <div className={s.cBadges}>
                          {dossier.items.map((it) => (
                            <span key={`${it.item_key}:${it.status}`} className={`${s.pill} ${it.status === 'AVAILABLE' ? s.pillCyan : s.pillMuted}`}>
                              {it.item_key} × {it.count}({it.status})
                            </span>
                          ))}
                        </div>
                      ) : <div className={s.empty}>アイテムなし</div>}

                      {/* このユーザーへの付与履歴 */}
                      {dossier.fund_grants.length > 0 && (
                        <>
                          <div className={s.secLabel}>USDT付与の履歴</div>
                          <div className={s.cBadges}>
                            {dossier.fund_grants.map((g) => (
                              <span key={g.id} className={`${s.pill} ${g.status === 'APPROVED' ? s.pillGood : g.status === 'PENDING' ? s.pillWarn : s.pillMuted}`}>
                                {money(g.amount)} USDT · {g.status} · {g.reason}
                              </span>
                            ))}
                          </div>
                        </>
                      )}

                      {/* 管理アクション */}
                      <div className={s.secLabel}>ADMIN ACTIONS · 管理アクション</div>
                      <div className={s.controls}>
                        <select className={s.select} value={grantItemKey} onChange={(e) => setGrantItemKey(e.target.value)}>
                          <option value="">アイテムを選択…</option>
                          {catalog.map((c) => (
                            <option key={c.key} value={c.key}>{c.name_ja}({c.band})</option>
                          ))}
                        </select>
                        <select className={s.select} value={grantQty} onChange={(e) => setGrantQty(Number(e.target.value))}>
                          {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}個</option>)}
                        </select>
                        <button
                          type="button"
                          className={s.pagerBtn}
                          disabled={!grantItemKey}
                          onClick={() => void act(`/api/v1/admin/users/${u.id}/grant-item`, { item_key: grantItemKey, quantity: grantQty })}
                        >
                          アイテムを付与
                        </button>
                      </div>
                      <div className={s.controls}>
                        <input
                          className={s.search}
                          style={{ maxWidth: 140 }}
                          value={fundAmount}
                          placeholder="金額(USDT)"
                          inputMode="decimal"
                          onChange={(e) => setFundAmount(e.target.value)}
                        />
                        <input
                          className={s.search}
                          value={fundReason}
                          placeholder="理由(監査ログに残ります)"
                          onChange={(e) => setFundReason(e.target.value)}
                        />
                        <button
                          type="button"
                          className={s.pagerBtn}
                          disabled={!(Number(fundAmount) > 0) || fundReason.trim() === ''}
                          onClick={() => void act(`/api/v1/admin/users/${u.id}/fund-grant`, { amount: Number(fundAmount), reason: fundReason.trim() }, true)}
                        >
                          USDT付与を申請
                        </button>
                        <span className={s.cnt}>※別の管理者の承認で送金されます</span>
                      </div>
                      <div className={s.controls}>
                        {dossier.user.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            className={s.pagerBtn}
                            style={{ borderColor: 'rgba(255,92,92,0.5)', color: 'var(--bad)', background: 'rgba(255,92,92,0.08)' }}
                            onClick={() => {
                              if (window.confirm(`${dossier.user.email} を凍結しますか?(全APIアクセスが遮断されます)`)) {
                                void act(`/api/v1/admin/users/${u.id}/status`, { status: 'SUSPENDED' });
                              }
                            }}
                          >
                            アカウントを凍結
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={s.pagerBtn}
                            onClick={() => void act(`/api/v1/admin/users/${u.id}/status`, { status: 'ACTIVE' })}
                          >
                            凍結を解除
                          </button>
                        )}
                        <span className={s.cnt}>メッセージ通知は AIカスタマーサービス(resend)導入時に追加予定</span>
                      </div>
                      {actionMsg && <p className={actionMsg === '完了しました' ? s.cnt : s.error}>{actionMsg}</p>}
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
