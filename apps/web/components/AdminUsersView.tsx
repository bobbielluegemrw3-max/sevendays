'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { AppSelect } from '@/components/AppSelect';
import { localDate, localDateTimeSec } from '@/lib/format-time';
import s from '../app/admin.module.css';
import { ErrorLine } from '@/components/ui/ErrorLine';

/* /admin/users — Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * 検索 → 表で走査 → 行クリックで台帳(dossier)を展開(最も作業が多い画面)。
 * 管理アクション: アイテム付与 / USDT付与(≤1,000即時・超は二重承認) / 凍結・解除。
 * データ・API・ロジックは旧版と同一 — 変更はマークアップ(テーブル化)とCSSのみ。
 * 台帳内サブテーブルはモバイルでは .scrollX(コンテナ内横スクロール)で退避。 */

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
  item_acquisitions: { item_key: string; source: string; unit_price: string; status: string; acquired_at: string }[];
  item_transfers: { created_at: string; item_key: string; sender_email: string; recipient_email: string; is_sender: boolean }[];
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
  return v ? localDateTimeSec(v) : '—';
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
  const openUser = openId ? rows.find((u) => u.id === openId) ?? null : null;

  /* 台帳(dossier)本体 — デスクトップはテーブル直下、モバイルはカード直下に出す */
  function renderDossier(u: AdminUserRow) {
    return (
      <div className={s.dossier}>
        {dossier && dossier.user.id === u.id ? (
          <>
            {/* プレゼンス */}
            <div className={s.badges}>
              {dossier.user.online
                ? <span className={`${s.st} ${s.stGood}`}>● オンライン(5分以内にアクセス)</span>
                : <span className={`${s.st} ${s.stNeutral}`}>オフライン</span>}
              <span className={s.tag}>最終ログイン {ts(dossier.user.last_sign_in_at)}</span>
              <span className={s.tag}>最終アクセス {ts(dossier.user.last_seen_at)}</span>
            </div>

            <div className={s.statRow}>
              <div className={s.stat}>
                <div className={s.statK}>利用可能残高</div>
                <div className={s.statV}>{money(dossier.user.balance_available)}<span className={s.u}>USDT</span></div>
              </div>
              <div className={s.stat}>
                <div className={s.statK}>ロック中残高</div>
                <div className={s.statV}>{money(dossier.user.balance_locked)}<span className={s.u}>USDT</span></div>
              </div>
              <div className={s.stat}>
                <div className={s.statK}>組織人数(7段まで)</div>
                <div className={s.statV}>{dossier.org_size.toLocaleString()}<span className={s.u}>人</span></div>
              </div>
              <div className={s.stat}>
                <div className={s.statK}>ユーザーID</div>
                <div className={s.statV} style={{ fontSize: 12, color: 'var(--c-ink-3)', overflowWrap: 'anywhere' }}>{dossier.user.id}</div>
              </div>
            </div>

            {/* MLM位置 */}
            <div className={s.sec}>MAP位置(上位チェーン)</div>
            <div style={{ fontSize: 12.5 }}>
              {dossier.upline.length > 0
                ? ['本人', ...dossier.upline.map((p) => p.email)].join(' ← ')
                : '本人がルート(紹介者なし)'}
            </div>
            {dossier.direct_referrals.length > 0 && (
              <div className={s.badges}>
                {dossier.direct_referrals.map((c) => (
                  <span key={c.id} className={s.tag}>{c.email}</span>
                ))}
              </div>
            )}

            {/* 入出金 */}
            <div className={s.sec}>USDT入金({dossier.deposits.length})/ 出金({dossier.withdrawals.length})</div>
            {dossier.deposits.length + dossier.withdrawals.length > 0 ? (
              <div className={`${s.tableWrap} ${s.scrollX}`}>
                <table className={s.tbl}>
                  <thead>
                    <tr><th>種別</th><th className={s.tRight}>金額</th><th>状態</th><th>時刻</th><th>tx / 宛先</th></tr>
                  </thead>
                  <tbody>
                    {dossier.deposits.map((d, i) => (
                      <tr key={`d${i}`}>
                        <td><span className={`${s.st} ${s.stGood}`}>入金</span></td>
                        <td className={s.num}>{money(d.amount)}<span className={s.u}>USDT</span></td>
                        <td><span className={s.tag}>{d.status}</span></td>
                        <td className={s.date}>{ts(d.detected_at)}</td>
                        <td className={`${s.mono} ${s.ell}`}>{d.tx_hash}</td>
                      </tr>
                    ))}
                    {dossier.withdrawals.map((w, i) => (
                      <tr key={`w${i}`}>
                        <td><span className={`${s.st} ${s.stWarn}`}>出金</span></td>
                        <td className={s.num}>{money(w.requested_amount)}<span className={s.u}>USDT</span></td>
                        <td><span className={s.tag}>{w.status}</span></td>
                        <td className={s.date}>{ts(w.requested_at)}</td>
                        <td className={`${s.mono} ${s.ell}`}>{w.to_address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className={s.empty}>入出金はまだありません</div>}

            {/* 購入・利確・売却 */}
            <div className={s.sec}>馬の購入({dossier.purchases.length})</div>
            {dossier.purchases.length > 0 ? (
              <div className={`${s.tableWrap} ${s.scrollX}`}>
                <table className={s.tbl}>
                  <thead>
                    <tr><th>時刻</th><th className={s.tRight}>金額</th><th>状態</th><th className={s.tRight}>返金</th></tr>
                  </thead>
                  <tbody>
                    {dossier.purchases.map((p, i) => (
                      <tr key={i}>
                        <td className={s.date}>{ts(p.created_at)}</td>
                        <td className={s.num}>{money(p.assigned_price ?? p.locked_amount)}<span className={s.u}>USDT</span></td>
                        <td><span className={s.tag}>{p.status}</span></td>
                        <td className={s.num}>{p.refund_amount && Number(p.refund_amount) > 0 ? money(p.refund_amount) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className={s.empty}>購入履歴なし</div>}

            <div className={s.sec}>利確(Day7走破の買戻し)({dossier.buybacks.length})</div>
            {dossier.buybacks.length > 0 ? (
              <div className={`${s.tableWrap} ${s.scrollX}`}>
                <table className={s.tbl}>
                  <thead>
                    <tr><th>馬</th><th className={s.tRight}>支払/総額</th><th className={s.tRight}>回数</th><th>状態</th><th>Day7達成日</th></tr>
                  </thead>
                  <tbody>
                    {dossier.buybacks.map((b) => (
                      <tr key={b.id}>
                        <td className={s.strong}>{b.horse_name}</td>
                        <td className={s.num}>{money(b.paid_amount)} / {money(b.total_amount)}<span className={s.u}>USDT</span></td>
                        <td className={s.num}>{b.paid_count}<span className={s.u}>/7</span></td>
                        <td><span className={s.tag}>{b.status}</span></td>
                        <td className={s.date}>{b.day7_clear_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className={s.empty}>利確履歴なし</div>}

            <div className={s.sec}>マーケット出品({dossier.sales.length})</div>
            {dossier.sales.length > 0 ? (
              <div className={`${s.tableWrap} ${s.scrollX}`}>
                <table className={s.tbl}>
                  <thead>
                    <tr><th>馬</th><th className={s.tRight}>価格</th><th>状態</th><th className={s.tRight}>Day</th><th>出品時刻</th></tr>
                  </thead>
                  <tbody>
                    {dossier.sales.map((m, i) => (
                      <tr key={i}>
                        <td className={s.strong}>{m.horse_name}</td>
                        <td className={s.num}>{money(m.listing_price)}<span className={s.u}>USDT</span></td>
                        <td>
                          {m.status === 'ASSIGNED'
                            ? <span className={`${s.st} ${s.stGood}`}>売却成立</span>
                            : <span className={`${s.st} ${s.stNeutral}`}>{m.status}</span>}
                        </td>
                        <td className={s.num}>{m.current_day}</td>
                        <td className={s.date}>{ts(m.listed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className={s.empty}>出品履歴なし</div>}

            {/* 馬・アイテム */}
            <div className={s.sec}>馬の保有({dossier.horses.length})</div>
            {dossier.horses.length > 0 ? (
              <div className={`${s.tableWrap} ${s.scrollX}`}>
                <table className={s.tbl}>
                  <thead>
                    <tr><th>名前</th><th>状態</th><th className={s.tRight}>Day</th><th>レアリティ</th><th>type</th><th>取得</th></tr>
                  </thead>
                  <tbody>
                    {dossier.horses.map((h) => (
                      <tr key={h.id}>
                        <td className={s.strong}>{h.name}</td>
                        <td>
                          {h.status === 'ACTIVE'
                            ? <span className={`${s.st} ${s.stGood}`}>ACTIVE</span>
                            : <span className={`${s.st} ${s.stNeutral}`}>{h.status}</span>}
                        </td>
                        <td className={s.num}>{h.current_day}</td>
                        <td><span className={s.tag}>{h.rarity}</span></td>
                        <td className={s.mono}>{h.horse_type}</td>
                        <td className={s.date}>{ts(h.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className={s.empty}>馬なし</div>}

            <div className={s.sec}>アイテム取得履歴({dossier.item_acquisitions.length})</div>
            {dossier.item_acquisitions.length > 0 ? (
              <div className={`${s.tableWrap} ${s.scrollX}`}>
                <table className={s.tbl}>
                  <thead>
                    <tr><th>時刻</th><th>アイテム</th><th>入手経路</th><th className={s.tRight}>価格</th><th>状態</th></tr>
                  </thead>
                  <tbody>
                    {dossier.item_acquisitions.map((a, i) => (
                      <tr key={i}>
                        <td className={s.date}>{ts(a.acquired_at)}</td>
                        <td className={s.mono} style={{ color: 'var(--c-ink)' }}>{a.item_key}</td>
                        <td>
                          <span className={`${s.st} ${a.source === 'PURCHASE' ? s.stGood : a.source === 'BURN_DROP' ? s.stWarn : s.stNeutral}`}>
                            {a.source === 'PURCHASE' ? '購入' : a.source === 'BURN_DROP' ? 'BURNドロップ' : 'ギフト/付与'}
                          </span>
                        </td>
                        <td className={s.num}>{Number(a.unit_price) > 0 ? money(a.unit_price) : '—'}</td>
                        <td><span className={s.tag}>{a.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className={s.empty}>アイテム取得なし</div>}

            <div className={s.sec}>アイテム使用履歴({dossier.item_usages.length})</div>
            {dossier.item_usages.length > 0 ? (
              <div className={`${s.tableWrap} ${s.scrollX}`}>
                <table className={s.tbl}>
                  <thead>
                    <tr><th>レース日</th><th>アイテム</th><th>状態</th><th>結果</th></tr>
                  </thead>
                  <tbody>
                    {dossier.item_usages.map((uu, i) => (
                      <tr key={i}>
                        <td className={s.date}>{uu.effective_race_date}</td>
                        <td className={s.mono} style={{ color: 'var(--c-ink)' }}>{uu.item_key}</td>
                        <td><span className={s.tag}>{uu.status}</span></td>
                        <td>
                          {uu.settled_outcome
                            ? <span className={`${s.st} ${uu.settled_outcome === 'SURVIVED' ? s.stGood : s.stBad}`}>
                                {uu.settled_outcome === 'SURVIVED' ? '生存' : 'BURN'}
                              </span>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className={s.empty}>アイテム使用なし</div>}

            <div className={s.sec}>アイテム送付履歴({dossier.item_transfers.length})</div>
            {dossier.item_transfers.length > 0 ? (
              <div className={`${s.tableWrap} ${s.scrollX}`}>
                <table className={s.tbl}>
                  <thead>
                    <tr><th>時刻</th><th>方向</th><th>アイテム</th><th>相手</th></tr>
                  </thead>
                  <tbody>
                    {dossier.item_transfers.map((t, i) => (
                      <tr key={i}>
                        <td className={s.date}>{ts(t.created_at)}</td>
                        <td><span className={`${s.st} ${t.is_sender ? s.stWarn : s.stGood}`}>{t.is_sender ? '送付' : '受領'}</span></td>
                        <td className={s.mono} style={{ color: 'var(--c-ink)' }}>{t.item_key}</td>
                        <td className={`${s.mono} ${s.ell}`}>{t.is_sender ? `→ ${t.recipient_email}` : `← ${t.sender_email}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className={s.empty}>送付・受領なし</div>}

            <div className={s.sec}>アイテム所持({dossier.items.reduce((a, b) => a + b.count, 0)})</div>
            {dossier.items.length > 0 ? (
              <div className={s.badges}>
                {dossier.items.map((it) => (
                  <span key={`${it.item_key}:${it.status}`} className={s.tag}>
                    {it.item_key} × {it.count}({it.status})
                  </span>
                ))}
              </div>
            ) : <div className={s.empty}>アイテムなし</div>}

            {/* このユーザーへの付与履歴 */}
            {dossier.fund_grants.length > 0 && (
              <>
                <div className={s.sec}>USDT付与の履歴</div>
                <div className={s.badges}>
                  {dossier.fund_grants.map((g) => (
                    <span key={g.id} className={`${s.st} ${g.status === 'APPROVED' ? s.stGood : g.status === 'PENDING' ? s.stWarn : s.stNeutral}`}>
                      {money(g.amount)} USDT · {g.status} · {g.reason}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* 管理アクション */}
            <div className={s.sec}>管理アクション</div>
            <div className={s.controls}>
              <AppSelect
                className={s.sel}
                value={grantItemKey}
                onChange={setGrantItemKey}
                ariaLabel="付与するアイテム"
                options={[
                  { value: '', label: 'アイテムを選択…' },
                  ...catalog.map((c) => ({ value: c.key, label: `${c.name_ja}(${c.band})` })),
                ]}
              />
              <AppSelect
                className={s.sel}
                value={String(grantQty)}
                onChange={(v) => setGrantQty(Number(v))}
                ariaLabel="付与する個数"
                options={[1, 2, 3, 5, 10].map((n) => ({ value: String(n), label: `${n}個` }))}
              />
              <button
                type="button"
                className={s.btn}
                disabled={!grantItemKey}
                onClick={() => void act(`/api/v1/admin/users/${u.id}/grant-item`, { item_key: grantItemKey, quantity: grantQty })}
              >
                アイテムを付与
              </button>
            </div>
            <div className={s.controls}>
              <input
                className={s.inp}
                style={{ maxWidth: 140, flex: 'none' }}
                value={fundAmount}
                placeholder="金額(USDT)"
                inputMode="decimal"
                onChange={(e) => setFundAmount(e.target.value)}
              />
              <input
                className={s.inp}
                value={fundReason}
                placeholder="理由(監査ログに残ります)"
                onChange={(e) => setFundReason(e.target.value)}
              />
              <button
                type="button"
                className={`${s.btn} ${s.btnPrimary}`}
                disabled={!(Number(fundAmount) > 0) || fundReason.trim() === ''}
                onClick={() => void act(`/api/v1/admin/users/${u.id}/fund-grant`, { amount: Number(fundAmount), reason: fundReason.trim() }, true)}
              >
                USDT付与
              </button>
              <span className={s.cnt}>※1,000以下は即時反映・1,000超は別の管理者の承認が必要です</span>
            </div>
            <div className={s.controls}>
              {dossier.user.status === 'ACTIVE' ? (
                <button
                  type="button"
                  className={`${s.btn} ${s.btnDanger}`}
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
                  className={s.btn}
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
    );
  }

  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>ユーザー</h1>
        </div>
      </div>

      {/* 承認待ちのUSDT付与(1,000超のみ・申請者と別の管理者が承認) */}
      {pending.length > 0 && (
        <div>
          <div className={s.sec}>承認待ちUSDT付与({pending.length})</div>
          <div className={`${s.tableWrap} ${s.desktopTable}`}>
            <table className={s.tbl}>
              <thead>
                <tr><th>メール</th><th className={s.tRight}>金額</th><th>理由</th><th>申請者</th><th className={s.tRight}>操作</th></tr>
              </thead>
              <tbody>
                {pending.map((g) => (
                  <tr key={g.id}>
                    <td className={s.strong}>{g.user_email}</td>
                    <td className={s.num}>{money(g.amount)}<span className={s.u}>USDT</span></td>
                    <td>{g.reason}</td>
                    <td className={`${s.mono} ${s.ell}`}>{g.requested_by_email}</td>
                    <td className={s.tRight}>
                      <button
                        type="button"
                        className={`${s.btn} ${s.btnPrimary}`}
                        onClick={() => void act(`/api/v1/admin/fund-grants/${g.id}/approve`, undefined)}
                      >
                        承認して送金
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {pending.map((g) => (
              <div key={g.id} className={s.mc}>
                <div className={s.mcTop}>
                  <span className={s.mcName}>{g.user_email}</span>
                  <span className={`${s.st} ${s.stWarn}`}>{money(g.amount)} USDT</span>
                </div>
                <div className={s.mcCell}><span className={s.k}>{g.requested_by_email}</span><span className={s.v}>{g.reason}</span></div>
                <button
                  type="button"
                  className={`${s.btn} ${s.btnPrimary}`}
                  onClick={() => void act(`/api/v1/admin/fund-grants/${g.id}/approve`, undefined)}
                >
                  承認して送金
                </button>
              </div>
            ))}
          </div>
          <div className={s.note}>
            憲法により<b>申請した管理者自身は承認できません</b>(FINANCE_ADMIN+SUPER_ADMINの2名承認)。
          </div>
        </div>
      )}

      <div className={s.controls}>
        <input
          className={s.inp}
          value={query}
          placeholder="メールアドレスで検索(部分一致)"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void search(query); }}
        />
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy} onClick={() => void search(query)}>
          {busy ? '検索中…' : '検索'}
        </button>
        <span className={s.cnt}>{rows.length}件(最新順・最大50件)</span>
      </div>

      {error ? <ErrorLine className={s.error}>{error}</ErrorLine> : null}

      {rows.length > 0 ? (
        <>
          <div className={`${s.tableWrap} ${s.desktopTable}`}>
            <table className={s.tbl}>
              <thead>
                <tr>
                  <th>メール</th><th>状態</th><th className={s.tRight}>残高</th>
                  <th className={s.tRight}>馬</th><th className={s.tRight}>BURN</th>
                  <th className={s.tRight}>所持品</th><th className={s.tRight}>直紹介</th><th>登録日</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    className={`${s.rowClick} ${openId === u.id ? s.rowSel : ''}`}
                    onClick={() => void toggleDetail(u.id)}
                  >
                    <td className={s.strong}>{u.email}</td>
                    <td>
                      <span className={`${s.st} ${u.status === 'ACTIVE' ? s.stGood : s.stBad}`}>{u.status}</span>
                    </td>
                    <td className={s.num}>{money(u.balance)}<span className={s.u}>USDT</span></td>
                    <td className={s.num}>{u.active_horses}</td>
                    <td className={s.num}>{u.burns}</td>
                    <td className={s.num}>{u.items_available}</td>
                    <td className={s.num}>{u.direct_referrals}</td>
                    <td className={s.date}>{localDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 展開中の台帳(デスクトップ: テーブル直下に接続) */}
          <div className={s.desktopTable}>
            {openUser ? renderDossier(openUser) : null}
          </div>

          <div className={s.mcard}>
            {rows.map((u) => (
              <div key={u.id}>
                <button
                  type="button"
                  onClick={() => void toggleDetail(u.id)}
                  style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}
                >
                  <div className={s.mc}>
                    <div className={s.mcTop}>
                      <span className={s.mcName}>{u.email}</span>
                      <span className={`${s.st} ${u.status === 'ACTIVE' ? s.stGood : s.stBad}`}>{u.status}</span>
                    </div>
                    <div className={s.mcGrid}>
                      <div className={s.mcCell}><span className={s.k}>残高</span><span className={s.v}>{money(u.balance)}</span></div>
                      <div className={s.mcCell}><span className={s.k}>馬</span><span className={s.v}>{u.active_horses}</span></div>
                      <div className={s.mcCell}><span className={s.k}>BURN</span><span className={s.v}>{u.burns}</span></div>
                      <div className={s.mcCell}><span className={s.k}>直紹介</span><span className={s.v}>{u.direct_referrals}</span></div>
                    </div>
                  </div>
                </button>
                {openId === u.id ? renderDossier(u) : null}
              </div>
            ))}
          </div>
        </>
      ) : !busy ? (
        <div className={s.empty}>該当するユーザーがいません。</div>
      ) : null}
    </div>
  );
}
