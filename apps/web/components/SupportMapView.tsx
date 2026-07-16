'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import {
  LEVEL_H,
  avatarHue,
  layoutSupportTree,
  type SupportTreeInput,
} from '@/lib/support-tree';
import type { PoolMember } from '@/components/SupportView';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/support-map.module.css';
import d from '../app/support.module.css';

/**
 * /support/map — 組織マップ(ジェネアロジーツリー)。
 * 見る: ツリー(PC)/ドリルダウンリスト(モバイル既定・切替可)+検索+
 *   メンバー詳細モーダル(馬数・価値・BURN・アイテム使用 — 金銭情報なし)。
 * 配置する: プールドックで「配置」→ 配置先をクリック → 不可逆確認 → 確定。
 *
 * ⚠ 配置API・不可逆確認ロジックは既存のまま。詳細は自分の配下7段のみ
 *   サーバー側で検証(/api/v1/support/member/:id)。R3コピー規範遵守。
 */

export interface SupportMapData {
  selfUserId: string;
  selfDisplay: string;
  network: SupportTreeInput[];
  pool: PoolMember[];
  tierAmounts: readonly string[];
}

interface MemberDetail {
  user_id: string;
  display: string;
  tier: number;
  placed_at: string | null;
  active_horses: number;
  horses_value: string;
  burns_total: number;
  items_used: number;
  direct_count: number;
  subtree_count: number;
}

const fmtDate = (iso: string): string => iso.slice(0, 10);
const nodeInitial = (display: string): string =>
  display.startsWith('0x') ? '◆' : display.slice(0, 1).toUpperCase();
const tierColor = (t: number): string =>
  ['#c9a86a', '#00eaff', '#5ff5ff', '#7ee0ff', '#a9c6ff', '#c9a8ff', '#ff8fe4', '#ff5ce0'][t] ?? '#8f8ac2';

/** preview/デモ用の決定論スタッツ(APIなしでモーダルを見せる)。 */
function synthDetail(node: SupportTreeInput, direct: number, subtree: number): MemberDetail {
  let h = 0;
  for (const ch of node.user_id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const horses = node.horses ?? h % 6;
  return {
    user_id: node.user_id,
    display: node.display,
    tier: node.tier,
    placed_at: node.placed_at,
    active_horses: horses,
    horses_value: (horses * 121).toFixed(2),
    burns_total: h % 9,
    items_used: (h >> 3) % 14,
    direct_count: direct,
    subtree_count: subtree,
  };
}

export function SupportMapView({ data, preview = false, t }: { data: SupportMapData; preview?: boolean; t: AppDict['support'] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [placing, setPlacing] = useState<PoolMember | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 検索+詳細モーダル(オーナー要望 2026-07-08)
  const [searchQ, setSearchQ] = useState('');
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  // ドリルダウン(モバイル既定)
  const [drillId, setDrillId] = useState<string | null>(null); // null = あなた
  // preview: ローカル反映(API なし)
  const [localNodes, setLocalNodes] = useState<SupportTreeInput[]>([]);
  const [localPlaced, setLocalPlaced] = useState<string[]>([]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 700px)').matches) setMode('list');
  }, []);

  // ドラッグパン
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pan = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const network = useMemo(() => [...data.network, ...localNodes], [data.network, localNodes]);
  const pool = data.pool.filter((m) => !localPlaced.includes(m.user_id));
  const layout = useMemo(
    () => layoutSupportTree(data.selfDisplay, network, collapsed),
    [data.selfDisplay, network, collapsed],
  );
  const byId = useMemo(() => new Map(network.map((n) => [n.user_id, n])), [network]);
  const childrenOf = useMemo(() => {
    const map = new Map<string, SupportTreeInput[]>();
    for (const n of network) {
      const key = n.tier === 1 ? '__self__' : (n.parent_user_id ?? '__self__');
      const arr = map.get(key) ?? [];
      arr.push(n);
      map.set(key, arr);
    }
    return map;
  }, [network]);
  const subtreeCount = useMemo(() => {
    const counts = new Map<string, number>();
    const count = (id: string): number => {
      if (counts.has(id)) return counts.get(id)!;
      const kids = childrenOf.get(id) ?? [];
      const total = kids.reduce((acc, k) => acc + 1 + count(k.user_id), 0);
      counts.set(id, total);
      return total;
    };
    for (const n of network) count(n.user_id);
    return counts;
  }, [network, childrenOf]);

  const targetInfo = targetId
    ? targetId === data.selfUserId
      ? { isSelf: true, tier: 0, display: t.self }
      : (() => {
          const n = byId.get(targetId);
          return n ? { isSelf: false, tier: n.tier, display: n.display } : null;
        })()
    : null;
  const placementMode = placing !== null;

  const beginPlacement = (member: PoolMember) => {
    setPlacing(member); setTargetId(null); setConfirmed(false); setError(null);
  };
  const cancelPlacement = () => { setPlacing(null); setTargetId(null); setConfirmed(false); };

  const submitPlacement = async () => {
    if (!placing || !targetInfo || !confirmed || busy) return;
    setBusy(true); setError(null);
    const parentId = targetId!;
    if (preview) {
      setLocalNodes((prev) => [
        ...prev,
        { user_id: placing.user_id, parent_user_id: targetInfo.isSelf ? null : parentId, tier: targetInfo.tier + 1, display: placing.display, placed_at: new Date().toISOString() },
      ]);
      setLocalPlaced((prev) => [...prev, placing.user_id]);
      cancelPlacement(); setBusy(false);
      return;
    }
    const result = await apiFetch('/api/v1/support/place', {
      method: 'POST',
      body: { user_id: placing.user_id, parent_user_id: parentId },
    });
    setBusy(false);
    if (result.status === 200) { cancelPlacement(); router.refresh(); }
    else setError(errorMessage(result.body) ?? t.err_place);
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const collapseAll = () => {
    if (collapsed.size > 0) { setCollapsed(new Set()); return; }
    const parents = new Set<string>();
    for (const n of network) if (n.tier > 1 && n.parent_user_id) parents.add(n.parent_user_id);
    setCollapsed(parents);
  };

  /* ---- 検索(表示名の部分一致 + 完全メールはサーバー照合) ---- */
  const revealNode = (id: string) => {
    // 折りたたまれた祖先を展開してからハイライト+スクロール
    setCollapsed((prev) => {
      const next = new Set(prev);
      let cur = byId.get(id);
      while (cur) {
        if (cur.parent_user_id) next.delete(cur.parent_user_id);
        cur = cur.parent_user_id ? byId.get(cur.parent_user_id) : undefined;
      }
      return next;
    });
    setHighlightId(id);
    if (mode === 'list') {
      const n = byId.get(id);
      setDrillId(n && n.tier > 1 ? (n.parent_user_id ?? null) : null);
    } else {
      setTimeout(() => {
        document.getElementById(`org-node-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }, 60);
    }
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 4000);
  };

  const runSearch = async () => {
    const q = searchQ.trim();
    setSearchMsg(null);
    if (!q) return;
    const local = network.find((n) => n.display.toLowerCase().includes(q.toLowerCase()));
    if (local) { revealNode(local.user_id); return; }
    if (q.includes('@') && !q.includes('*') && !preview) {
      const r = await apiFetch<{ user_id: string | null }>('/api/v1/support/search', {
        method: 'POST',
        body: { email: q },
      });
      const hit = r.status === 200 ? (r.body as { user_id: string | null }).user_id : null;
      if (hit && byId.has(hit)) { revealNode(hit); return; }
    }
    setSearchMsg(t.map_search_notfound);
  };

  /* ---- 詳細モーダル ---- */
  const openDetail = async (node: SupportTreeInput) => {
    if (placementMode) { setTargetId(node.user_id); setConfirmed(false); return; }
    const direct = (childrenOf.get(node.user_id) ?? []).length;
    const subtree = subtreeCount.get(node.user_id) ?? 0;
    if (preview) { setDetail(synthDetail(node, direct, subtree)); return; }
    setDetailBusy(true);
    setDetail(synthDetail(node, direct, subtree)); // 骨組みを即表示
    const r = await apiFetch<MemberDetail>(`/api/v1/support/member/${node.user_id}`);
    setDetailBusy(false);
    if (r.status === 200) setDetail(r.body as MemberDetail);
  };

  // pan handlers
  const onPointerDown = (e: React.PointerEvent) => {
    if (placementMode) return;
    const el = scrollRef.current;
    if (!el) return;
    pan.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
    setGrabbing(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!pan.current || !el) return;
    el.scrollLeft = pan.current.l - (e.clientX - pan.current.x);
    el.scrollTop = pan.current.t - (e.clientY - pan.current.y);
  };
  const endPan = () => { pan.current = null; setGrabbing(false); };

  const railN = Math.max(layout.maxTier, 3);

  /* ---- ドリルダウン用データ ---- */
  const drillNode = drillId ? byId.get(drillId) ?? null : null;
  const drillChildren = childrenOf.get(drillId ?? '__self__') ?? [];
  const crumbs: SupportTreeInput[] = [];
  {
    let cur = drillNode;
    while (cur) {
      crumbs.unshift(cur);
      cur = cur.parent_user_id ? byId.get(cur.parent_user_id) ?? null : null;
    }
  }

  return (
    <div className={s.wrap}>
      {/* ---- ツールバー ---- */}
      <div className={s.toolbar}>
        <span className={s.toolTitle}>ORGANIZATION MAP</span>
        <span className={s.toolStats}>
          {fill(t.toolbar_stats_tpl, { members: network.length, pool: pool.length, depth: layout.maxTier || 0 })}
        </span>
        <span className={s.toolSpacer} />
        <span className={s.modeGroup}>
          <button type="button" className={`${s.modeBtn} ${mode === 'map' ? s.modeOn : ''}`} onClick={() => setMode('map')}>{t.mode_map}</button>
          <button type="button" className={`${s.modeBtn} ${mode === 'list' ? s.modeOn : ''}`} onClick={() => setMode('list')}>{t.mode_list}</button>
        </span>
        {mode === 'map' && (
          <>
            <button type="button" className={s.ghostBtn} onClick={collapseAll}>
              {collapsed.size > 0 ? t.expand_all : t.collapse_all}
            </button>
            <span className={s.zoomGroup}>
              <button type="button" className={s.zoomBtn} onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}>−</button>
              <button type="button" className={s.zoomBtn} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" className={s.zoomBtn} onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}>+</button>
            </span>
          </>
        )}
      </div>

      {/* ---- 検索 ---- */}
      <form
        className={s.search}
        onSubmit={(e) => { e.preventDefault(); void runSearch(); }}
      >
        <input
          className={s.searchInput}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder={t.map_search_ph}
          aria-label={t.map_search_aria}
        />
        <button type="submit" className={s.ghostBtn}>{t.map_search_btn}</button>
        {searchMsg && <span className={s.searchMsg}>{searchMsg}</span>}
      </form>

      {/* ---- 配置モードバナー ---- */}
      {placementMode && (
        <div className={s.placeBanner}>
          <span className={s.placeDot} />
          <span>
            <span className={s.placeBannerName}>{placing.display}</span>{t.place_select_a}
            {mode === 'map' ? t.place_hint_map : t.place_hint_list}{t.place_select_b}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" onClick={cancelPlacement}>{t.cancel}</button>
        </div>
      )}

      {/* ---- リスト(ドリルダウン)モード ---- */}
      {mode === 'list' ? (
        <div className={s.drill}>
          <div className={s.crumbs}>
            <button
              type="button"
              className={`${s.crumbBtn} ${drillId === null ? s.crumbOn : ''}`}
              onClick={() => setDrillId(null)}
            >
              {t.you_crumb}
            </button>
            {crumbs.map((c) => (
              <span key={c.user_id} className={s.crumbSeg}>
                <span className={s.crumbSep}>›</span>
                <button
                  type="button"
                  className={`${s.crumbBtn} ${drillId === c.user_id ? s.crumbOn : ''}`}
                  onClick={() => setDrillId(c.user_id)}
                >
                  {c.display}
                </button>
              </span>
            ))}
          </div>

          <div className={s.focusCard}>
            <span
              className={s.avatar}
              style={{ background: drillNode ? `hsl(${avatarHue(drillNode.display)} 70% 60%)` : 'linear-gradient(120deg, var(--gold), var(--gold-bright))' }}
            >
              {drillNode ? nodeInitial(drillNode.display) : '★'}
            </span>
            <span className={s.focusBody}>
              <span className={s.focusName}>{drillNode ? drillNode.display : t.self}</span>
              <span className={s.focusMeta}>
                {drillNode ? fill(t.focus_tier_tpl, { t: drillNode.tier }) : ''}{fill(t.focus_meta_tpl, { direct: drillChildren.length, sub: drillNode ? subtreeCount.get(drillNode.user_id) ?? 0 : network.length })}
              </span>
            </span>
            {drillNode && (
              <button type="button" className={s.ghostBtn} onClick={() => void openDetail(drillNode)}>{t.detail_btn}</button>
            )}
            {placementMode && (
              <button
                type="button"
                className={s.poolBtn}
                onClick={() => { setTargetId(drillNode ? drillNode.user_id : data.selfUserId); setConfirmed(false); }}
              >
                {t.place_here}
              </button>
            )}
          </div>

          <div className={s.childList}>
            {drillChildren.length === 0 ? (
              <p className={s.dockEmpty}>{t.drill_empty}</p>
            ) : (
              drillChildren.map((n) => {
                const kids = (childrenOf.get(n.user_id) ?? []).length;
                const sub = subtreeCount.get(n.user_id) ?? 0;
                return (
                  <div
                    key={n.user_id}
                    id={`org-node-${n.user_id}`}
                    className={`${s.childCard} ${highlightId === n.user_id ? s.nodeHl : ''}`}
                  >
                    <span className={s.avatar} style={{ background: `hsl(${avatarHue(n.display)} 70% 60%)` }}>
                      {nodeInitial(n.display)}
                    </span>
                    <button
                      type="button"
                      className={s.childBody}
                      onClick={() => (placementMode ? (setTargetId(n.user_id), setConfirmed(false)) : void openDetail(n))}
                    >
                      <span className={s.childName}>
                        <span className={s.nodeTier} style={{ color: tierColor(n.tier), position: 'static', marginRight: 6 }}>T{n.tier}</span>
                        {n.display}
                      </span>
                      <span className={s.childMeta}>
                        {typeof n.horses === 'number' ? fill(t.child_horse_tpl, { h: n.horses }) : ''}{fill(t.child_meta_tpl, { kids, sub })}
                      </span>
                    </button>
                    {kids > 0 && (
                      <button type="button" className={s.drillBtn} aria-label={t.drill_open_aria} onClick={() => setDrillId(n.user_id)}>
                        ▸
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* ---- ツリーキャンバス(マップモード) ---- */
        <div
          ref={scrollRef}
          className={`${s.canvasOuter} ${grabbing ? s.grabbing : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerLeave={endPan}
        >
          {network.length === 0 && !placementMode ? (
            <div className={s.emptyTree}>{t.empty_tree}</div>
          ) : (
            <div className={s.canvasPad} style={{ width: layout.width * zoom + 40, height: (layout.height + 20) * zoom + 20 }}>
              <div className={s.canvasScale} style={{ transform: `scale(${zoom})`, width: layout.width, height: layout.height + 20 }}>
                {Array.from({ length: railN + 1 }, (_, t) => t).map((tier) => (
                  <div
                    key={tier}
                    className={`${s.tierBand} ${tier === 0 ? s.tierBandRoot : ''}`}
                    style={{ top: tier * LEVEL_H, width: layout.width, height: LEVEL_H }}
                  >
                    <span className={`${s.tierChipRail} ${s.open}`}>
                      <b style={{ color: tierColor(tier) }}>{tier === 0 ? 'YOU' : `TIER ${tier}`}</b>
                      {tier > 0 && (
                        <span className={s.amt} style={{ color: '#a9f6ff' }}>
                          {Number(data.tierAmounts[tier - 1] ?? '1').toFixed(0)} USDT
                        </span>
                      )}
                    </span>
                  </div>
                ))}

                <svg className={s.edges} width={layout.width} height={layout.height + 20}>
                  {layout.edges.map((e, i) => (
                    <path key={i} className={s.edgePath} d={`M ${e.fromX} ${e.fromY} C ${e.fromX} ${e.fromY + 24}, ${e.toX} ${e.toY - 24}, ${e.toX} ${e.toY}`} />
                  ))}
                </svg>

                {layout.nodes.map((n) => {
                  const eligible = placementMode;
                  const active = targetId === n.user_id;
                  const hasKids = n.directCount > 0 && !n.isSelf;
                  const clickable = eligible || !n.isSelf;
                  return (
                    <div
                      key={n.user_id}
                      id={`org-node-${n.user_id}`}
                      className={[
                        s.node,
                        n.isSelf ? s.nodeSelf : '',
                        eligible ? s.nodeTarget : '',
                        active ? s.nodeTargetActive : '',
                        highlightId === n.user_id ? s.nodeHl : '',
                      ].join(' ')}
                      style={{ left: n.x, top: n.y }}
                      onClick={
                        clickable
                          ? () => {
                              if (eligible) { setTargetId(n.isSelf ? data.selfUserId : n.user_id); setConfirmed(false); return; }
                              const raw = byId.get(n.user_id);
                              if (raw) void openDetail(raw);
                            }
                          : undefined
                      }
                      role={clickable ? 'button' : undefined}
                    >
                      {!n.isSelf && <span className={s.nodeTier} style={{ color: tierColor(n.tier) }}>T{n.tier}</span>}
                      <span
                        className={s.avatar}
                        style={{ background: n.isSelf ? 'linear-gradient(120deg, var(--gold), var(--gold-bright))' : `hsl(${avatarHue(n.display)} 70% 60%)` }}
                      >
                        {n.isSelf ? '★' : nodeInitial(n.display)}
                      </span>
                      <span className={s.nodeBody}>
                        <span className={s.nodeName}>{n.isSelf ? t.self : n.display}</span>
                        <span className={s.nodeMeta}>
                          {n.isSelf
                            ? fill(t.node_series_tpl, { n: n.directCount })
                            : n.collapsed ? fill(t.node_collapsed_tpl, { n: n.hiddenCount }) : fill(t.node_direct_tpl, { n: n.directCount })}
                        </span>
                      </span>
                      {hasKids && (
                        <span
                          className={`${s.toggle} ${n.collapsed ? s.collapsed : ''}`}
                          role="button"
                          aria-label={n.collapsed ? t.toggle_expand_aria : t.toggle_collapse_aria}
                          onClick={(e) => { e.stopPropagation(); toggleCollapse(n.user_id); }}
                        >
                          {n.collapsed ? '▸' : '▾'}
                        </span>
                      )}
                      {active && <span className={s.nodeTargetHint}>{fill(t.node_place_hint_tpl, { n: n.tier + 1 })}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- プールドック ---- */}
      <div className={s.dock}>
        <div className={s.dockHead}>
          <span className={s.dockTitle}>{t.dock_title}</span>
          <span className={s.dockCount}>{pool.length}{t.unit_people}</span>
          <span className={s.dockHint}>{t.dock_hint}</span>
        </div>
        {pool.length === 0 ? (
          <p className={s.dockEmpty}>{t.dock_empty}</p>
        ) : (
          <div className={s.dockRow}>
            {pool.map((m) => (
              <div key={m.user_id} className={`${s.poolCard} ${placing?.user_id === m.user_id ? s.poolCardActive : ''}`}>
                <span className={s.avatar} style={{ background: `hsl(${avatarHue(m.display)} 70% 60%)`, width: 26, height: 26, fontSize: '0.62rem' }}>
                  {nodeInitial(m.display)}
                </span>
                <span className={s.poolText}>
                  <span className={s.poolName}>{m.display}</span>
                  <span className={s.poolMeta}>{fill(t.pool_joined_tpl, { d: fmtDate(m.joined_at) })}</span>
                </span>
                <button type="button" className={s.poolBtn} onClick={() => beginPlacement(m)}>{t.pool_place_btn}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- メンバー詳細モーダル ---- */}
      {detail && !placementMode && (
        <div className={d.overlay} role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
          <div className={d.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={s.mHead}>
              <span className={s.avatar} style={{ background: `hsl(${avatarHue(detail.display)} 70% 60%)`, width: 40, height: 40, fontSize: '0.9rem' }}>
                {nodeInitial(detail.display)}
              </span>
              <span>
                <div className={d.dialogTitle} style={{ margin: 0 }}>{detail.display}</div>
                <span className={s.mSub}>
                  {fill(t.m_sub_tpl, { t: detail.tier })}{detail.placed_at ? fill(t.m_placed_tpl, { d: fmtDate(detail.placed_at) }) : ''}
                </span>
              </span>
            </div>
            <div className={s.mGrid}>
              <div className={s.mCell}><span className={s.mKey}>{t.m_active_horses}</span><span className={s.mVal}>{detail.active_horses}<small>{t.unit_horses}</small></span></div>
              <div className={s.mCell}><span className={s.mKey}>{t.m_horses_value}</span><span className={s.mVal}>{Number(detail.horses_value).toLocaleString('en-US')}<small>USDT</small></span></div>
              <div className={s.mCell}><span className={s.mKey}>{t.m_burns}</span><span className={s.mVal}>{detail.burns_total}<small>{t.unit_times}</small></span></div>
              <div className={s.mCell}><span className={s.mKey}>{t.m_items}</span><span className={s.mVal}>{detail.items_used}<small>{t.unit_items}</small></span></div>
              <div className={s.mCell}><span className={s.mKey}>{t.m_direct}</span><span className={s.mVal}>{detail.direct_count}<small>{t.unit_people}</small></span></div>
              <div className={s.mCell}><span className={s.mKey}>{t.m_subtree}</span><span className={s.mVal}>{detail.subtree_count}<small>{t.unit_people}</small></span></div>
            </div>
            <p className={s.mNote}>
              {t.m_note}
              {detailBusy ? t.m_note_loading : ''}
            </p>
            <div className={d.dialogActions}>
              <button type="button" className="secondary" onClick={() => setDetail(null)}>{t.close}</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- 確定ダイアログ(不可逆の明示確認 — 既存ロジックを維持) ---- */}
      {placing && targetInfo && (
        <div className={d.overlay} role="dialog" aria-modal="true">
          <div className={d.dialog}>
            <div className={d.dialogTitle}>{t.confirm_title}</div>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              <strong>{placing.display}</strong>{t.confirm_body_a}
              <strong>{targetInfo.isSelf ? t.confirm_target_self : fill(t.confirm_target_tpl, { name: targetInfo.display, t: targetInfo.tier + 1 })}</strong>
              {t.confirm_body_b}
            </p>
            <div className={d.warnBox}>
              {t.warn_a}<strong>{t.warn_bold}</strong>{t.warn_b}
            </div>
            <label className={d.confirmLabel}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              {t.confirm_check}
            </label>
            {error && <p className="error">{error}</p>}
            <div className={d.dialogActions}>
              <button type="button" className="secondary" onClick={() => setTargetId(null)}>{t.reselect}</button>
              <button type="button" disabled={!confirmed || busy} onClick={() => void submitPlacement()}>
                {busy ? t.placing : t.confirm_btn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
