'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import {
  LEVEL_H,
  avatarHue,
  layoutSupportTree,
  type SupportTreeInput,
} from '@/lib/support-tree';
import type { PoolMember } from '@/components/SupportView';
import s from '../app/support-map.module.css';
import d from '../app/support.module.css';

/**
 * /support/map — 組織マップ(ジェネアロジーツリー) リデザイン。
 * 見る: 自分を頂点にノードカードのツリー + 左寄せティア帯 + 折りたたみ + ズーム
 *   + ドラッグパン。大きな組織でも構造とティアが一目で分かる。
 * 配置する: プールドックで「配置」→ ツリー上の配置先(緑枠)をクリック
 *   → 不可逆確認ダイアログ(チェック必須)→ 確定。コピー規範(R3)遵守。
 *
 * ⚠ props 型・配置API・不可逆確認ロジックは既存のまま(見た目/レイアウト/情報設計のみ改善)。
 */

export interface SupportMapData {
  selfUserId: string;
  selfDisplay: string;
  network: SupportTreeInput[];
  pool: PoolMember[];
  tierAmounts: readonly string[];
}

const fmtDate = (iso: string): string => iso.slice(0, 10);
const nodeInitial = (display: string): string =>
  display.startsWith('0x') ? '◆' : display.slice(0, 1).toUpperCase();
const tierColor = (t: number): string =>
  ['#c9a86a', '#00eaff', '#5ff5ff', '#7ee0ff', '#a9c6ff', '#c9a8ff', '#ff8fe4', '#ff5ce0'][t] ?? '#8f8ac2';

export function SupportMapView({ data, preview = false }: { data: SupportMapData; preview?: boolean }) {
  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [placing, setPlacing] = useState<PoolMember | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // preview: ローカル反映(API なし)
  const [localNodes, setLocalNodes] = useState<SupportTreeInput[]>([]);
  const [localPlaced, setLocalPlaced] = useState<string[]>([]);

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
  const targetNode = targetId ? layout.nodes.find((n) => n.user_id === targetId) : null;
  const placementMode = placing !== null;

  const beginPlacement = (member: PoolMember) => {
    setPlacing(member); setTargetId(null); setConfirmed(false); setError(null);
  };
  const cancelPlacement = () => { setPlacing(null); setTargetId(null); setConfirmed(false); };

  const submitPlacement = async () => {
    if (!placing || !targetNode || !confirmed || busy) return;
    setBusy(true); setError(null);
    const parentId = targetNode.isSelf ? data.selfUserId : targetNode.user_id;
    if (preview) {
      setLocalNodes((prev) => [
        ...prev,
        { user_id: placing.user_id, parent_user_id: parentId, tier: targetNode.tier + 1, display: placing.display, placed_at: new Date().toISOString() },
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
    else setError(errorMessage(result.body) ?? '配置に失敗しました。');
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

  // pan handlers (無視: クリック配置と両立するため閾値なしのシンプルパン)
  const onPointerDown = (e: React.PointerEvent) => {
    if (placementMode) return; // 配置中はクリック選択を優先
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

  return (
    <div className={s.wrap}>
      {/* ---- ツールバー ---- */}
      <div className={s.toolbar}>
        <span className={s.toolTitle}>ORGANIZATION MAP</span>
        <span className={s.toolStats}>
          メンバー {network.length}名 · 配置待ち {pool.length}名 · 最深 T{layout.maxTier || 0}
        </span>
        <span className={s.toolSpacer} />
        <button type="button" className={s.ghostBtn} onClick={collapseAll}>
          {collapsed.size > 0 ? 'すべて展開' : 'すべて折りたたむ'}
        </button>
        <span className={s.zoomGroup}>
          <button type="button" className={s.zoomBtn} onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}>−</button>
          <button type="button" className={s.zoomBtn} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" className={s.zoomBtn} onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}>+</button>
        </span>
      </div>

      {/* ---- 配置モードバナー ---- */}
      {placementMode && (
        <div className={s.placeBanner}>
          <span className={s.placeDot} />
          <span>
            <span className={s.placeBannerName}>{placing.display}</span> の配置先を選択中 —
            マップ上の緑枠(あなた or 配下メンバー)をクリックしてください
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" onClick={cancelPlacement}>キャンセル</button>
        </div>
      )}

      {/* ---- ツリーキャンバス ---- */}
      <div
        ref={scrollRef}
        className={`${s.canvasOuter} ${grabbing ? s.grabbing : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
      >
        {network.length === 0 && !placementMode ? (
          <div className={s.emptyTree}>まだ誰も配置されていません。仲間を招待して、最初の1人を配置しましょう。</div>
        ) : (
          <div className={s.canvasPad} style={{ width: layout.width * zoom + 40, height: (layout.height + 20) * zoom + 20 }}>
            <div className={s.canvasScale} style={{ transform: `scale(${zoom})`, width: layout.width, height: layout.height + 20 }}>
              {/* ティア帯(左寄せラベル) */}
              {Array.from({ length: railN + 1 }, (_, t) => t).map((tier) => {
                const opened = tier === 0 || tier <= /* 解放済みティア数は amounts で判断できないため全表示 */ railN;
                return (
                  <div
                    key={tier}
                    className={`${s.tierBand} ${tier === 0 ? s.tierBandRoot : ''}`}
                    style={{ top: tier * LEVEL_H, width: layout.width, height: LEVEL_H }}
                  >
                    <span className={`${s.tierChipRail} ${opened ? s.open : ''}`}>
                      <b style={{ color: tierColor(tier) }}>{tier === 0 ? 'YOU' : `TIER ${tier}`}</b>
                      {tier > 0 && (
                        <span className={s.amt} style={{ color: '#a9f6ff' }}>
                          {Number(data.tierAmounts[tier - 1] ?? '1').toFixed(0)} USDT
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}

              {/* コネクタ */}
              <svg className={s.edges} width={layout.width} height={layout.height + 20}>
                {layout.edges.map((e, i) => (
                  <path key={i} className={s.edgePath} d={`M ${e.fromX} ${e.fromY} C ${e.fromX} ${e.fromY + 24}, ${e.toX} ${e.toY - 24}, ${e.toX} ${e.toY}`} />
                ))}
              </svg>

              {/* ノード */}
              {layout.nodes.map((n) => {
                const eligible = placementMode; // すべてのノードが配置先候補(自分の配下ツリー)
                const active = targetId === n.user_id;
                const hasKids = n.directCount > 0 && !n.isSelf;
                return (
                  <div
                    key={n.user_id}
                    className={[
                      s.node,
                      n.isSelf ? s.nodeSelf : '',
                      eligible ? s.nodeTarget : '',
                      active ? s.nodeTargetActive : '',
                    ].join(' ')}
                    style={{ left: n.x, top: n.y }}
                    onClick={eligible ? () => { setTargetId(n.user_id); setConfirmed(false); } : undefined}
                    role={eligible ? 'button' : undefined}
                  >
                    {!n.isSelf && <span className={s.nodeTier} style={{ color: tierColor(n.tier) }}>T{n.tier}</span>}
                    <span
                      className={s.avatar}
                      style={{ background: n.isSelf ? 'linear-gradient(120deg, var(--gold), var(--gold-bright))' : `hsl(${avatarHue(n.display)} 70% 60%)` }}
                    >
                      {n.isSelf ? '★' : nodeInitial(n.display)}
                    </span>
                    <span className={s.nodeBody}>
                      <span className={s.nodeName}>{n.isSelf ? 'あなた' : n.display}</span>
                      <span className={s.nodeMeta}>
                        {n.isSelf
                          ? `直下 ${n.directCount}系列`
                          : n.collapsed ? `+${n.hiddenCount}名 折りたたみ中` : `直下 ${n.directCount}名`}
                      </span>
                    </span>
                    {hasKids && (
                      <span
                        className={`${s.toggle} ${n.collapsed ? s.collapsed : ''}`}
                        role="button"
                        aria-label={n.collapsed ? '展開' : '折りたたむ'}
                        onClick={(e) => { e.stopPropagation(); toggleCollapse(n.user_id); }}
                      >
                        {n.collapsed ? '▸' : '▾'}
                      </span>
                    )}
                    {active && <span className={s.nodeTargetHint}>ここに配置 · T{n.tier + 1}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ---- プールドック ---- */}
      <div className={s.dock}>
        <div className={s.dockHead}>
          <span className={s.dockTitle}>配置待ちの仲間</span>
          <span className={s.dockCount}>{pool.length}名</span>
          <span className={s.dockHint}>配置は確定すると変更不可</span>
        </div>
        {pool.length === 0 ? (
          <p className={s.dockEmpty}>配置待ちの仲間はいません。ダッシュボードから招待リンクを共有しましょう。</p>
        ) : (
          <div className={s.dockRow}>
            {pool.map((m) => (
              <div key={m.user_id} className={`${s.poolCard} ${placing?.user_id === m.user_id ? s.poolCardActive : ''}`}>
                <span className={s.avatar} style={{ background: `hsl(${avatarHue(m.display)} 70% 60%)`, width: 26, height: 26, fontSize: '0.62rem' }}>
                  {nodeInitial(m.display)}
                </span>
                <span className={s.poolText}>
                  <span className={s.poolName}>{m.display}</span>
                  <span className={s.poolMeta}>参加 {fmtDate(m.joined_at)}</span>
                </span>
                <button type="button" className={s.poolBtn} onClick={() => beginPlacement(m)}>配置</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- 確定ダイアログ(不可逆の明示確認 — 既存ロジックを維持) ---- */}
      {placing && targetNode && (
        <div className={d.overlay} role="dialog" aria-modal="true">
          <div className={d.dialog}>
            <div className={d.dialogTitle}>配置を確定する</div>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              <strong>{placing.display}</strong> を{' '}
              <strong>{targetNode.isSelf ? 'あなたの直下(TIER 1)' : `${targetNode.display} の直下(TIER ${targetNode.tier + 1})`}</strong>{' '}
              に配置します。
            </p>
            <div className={d.warnBox}>
              ⚠ 配置は一度確定すると<strong>二度と変更できません</strong>。
              配置換えの依頼は受け付けられません(システム上の例外処理は運営管理者のみ)。
            </div>
            <label className={d.confirmLabel}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              変更できないことを理解しました
            </label>
            {error && <p className="error">{error}</p>}
            <div className={d.dialogActions}>
              <button type="button" className="secondary" onClick={() => setTargetId(null)}>配置先を選び直す</button>
              <button type="button" disabled={!confirmed || busy} onClick={() => void submitPlacement()}>
                {busy ? '配置中…' : 'この位置で確定する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
