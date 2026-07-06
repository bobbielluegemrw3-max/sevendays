'use client';

import { useMemo, useState } from 'react';
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
 * /support/map — 組織マップ(ジェネアロジーツリー)。
 * 見る: 自分を頂点にノードカードのツリー+ティア帯+ズーム。
 * 配置する: プールドックで「配置モード」→ ツリー上の配置先ノードをクリック
 * → 不可逆確認ダイアログ → 確定。コピー規範(R3)遵守。
 */

export interface SupportMapData {
  selfUserId: string;
  selfDisplay: string;
  network: SupportTreeInput[];
  pool: PoolMember[];
  tierAmounts: readonly string[];
}

const fmtDate = (iso: string): string => iso.slice(0, 10);

export function SupportMapView({ data, preview = false }: { data: SupportMapData; preview?: boolean }) {
  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [placing, setPlacing] = useState<PoolMember | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // preview: ローカル反映(API なし)
  const [localNodes, setLocalNodes] = useState<SupportTreeInput[]>([]);
  const [localPlaced, setLocalPlaced] = useState<string[]>([]);

  const network = useMemo(() => [...data.network, ...localNodes], [data.network, localNodes]);
  const pool = data.pool.filter((m) => !localPlaced.includes(m.user_id));
  const layout = useMemo(
    () => layoutSupportTree(data.selfDisplay, network),
    [data.selfDisplay, network],
  );

  const targetNode = targetId ? layout.nodes.find((n) => n.user_id === targetId) : null;

  const beginPlacement = (member: PoolMember) => {
    setPlacing(member);
    setTargetId(null);
    setConfirmed(false);
    setError(null);
  };
  const cancelPlacement = () => {
    setPlacing(null);
    setTargetId(null);
    setConfirmed(false);
  };

  const submitPlacement = async () => {
    if (!placing || !targetNode || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    const parentId = targetNode.isSelf ? data.selfUserId : targetNode.user_id;
    if (preview) {
      setLocalNodes((prev) => [
        ...prev,
        {
          user_id: placing.user_id,
          parent_user_id: parentId,
          tier: targetNode.tier + 1,
          display: placing.display,
          placed_at: new Date().toISOString(),
        },
      ]);
      setLocalPlaced((prev) => [...prev, placing.user_id]);
      cancelPlacement();
      setBusy(false);
      return;
    }
    const result = await apiFetch('/api/v1/support/place', {
      method: 'POST',
      body: { user_id: placing.user_id, parent_user_id: parentId },
    });
    setBusy(false);
    if (result.status === 200) {
      cancelPlacement();
      router.refresh();
    } else {
      setError(errorMessage(result.body) ?? '配置に失敗しました。');
    }
  };

  const placementMode = placing !== null;
  const nodeInitial = (display: string): string =>
    display.startsWith('0x') ? '◆' : display.slice(0, 1).toUpperCase();

  return (
    <div className={s.wrap}>
      {/* ---- ツールバー ---- */}
      <div className={s.toolbar}>
        <span className={s.toolTitle}>ORGANIZATION MAP</span>
        <span className={s.toolStats}>
          メンバー {network.length}名 · 配置待ち {pool.length}名 · 最深 T{layout.maxTier || 0}
        </span>
        <span className={s.zoomGroup}>
          <button type="button" className={s.zoomBtn} onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}>−</button>
          <button type="button" className={s.zoomBtn} onClick={() => setZoom(1)}>100%</button>
          <button type="button" className={s.zoomBtn} onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}>+</button>
        </span>
      </div>

      {/* ---- 配置モードバナー ---- */}
      {placementMode && (
        <div className={s.placeBanner}>
          <span>
            <span className={s.placeBannerName}>{placing.display}</span> の配置先を選択中 —
            ツリー上のメンバー(または自分)をクリックしてください
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" onClick={cancelPlacement}>
            キャンセル
          </button>
        </div>
      )}

      {/* ---- プールドック ---- */}
      <div className={s.dock}>
        <div className={s.dockHead}>
          <span className={s.dockTitle}>配置待ちの仲間</span>
          <span className={s.dockCount}>{pool.length}名</span>
        </div>
        {pool.length === 0 ? (
          <p className={s.dockEmpty}>配置待ちの仲間はいません。ダッシュボードから招待リンクを共有しましょう。</p>
        ) : (
          <div className={s.dockRow}>
            {pool.map((m) => (
              <div
                key={m.user_id}
                className={`${s.poolCard} ${placing?.user_id === m.user_id ? s.poolCardActive : ''}`}
              >
                <span
                  className={s.avatar}
                  style={{ background: `hsl(${avatarHue(m.display)} 70% 62%)`, width: 26, height: 26, fontSize: '0.62rem' }}
                >
                  {nodeInitial(m.display)}
                </span>
                <span>
                  <span className={s.poolName}>{m.display}</span>
                  <br />
                  <span className={s.poolMeta}>参加 {fmtDate(m.joined_at)}</span>
                </span>
                <button type="button" className={s.poolBtn} onClick={() => beginPlacement(m)}>
                  配置
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- ツリーキャンバス ---- */}
      <div className={s.canvasOuter}>
        {network.length === 0 && !placementMode ? (
          <div className={s.emptyTree}>
            まだ誰も配置されていません。仲間を招待して、最初の1人を配置しましょう。
          </div>
        ) : (
          <div
            className={s.canvas}
            style={{
              width: layout.width * zoom,
              height: layout.height * zoom + 30,
            }}
          >
            <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: layout.width, height: layout.height + 30, position: 'relative' }}>
              {/* ティア帯 */}
              {Array.from({ length: layout.maxTier + 1 }, (_, i) => i).map((tier) => (
                <div key={tier} className={s.tierBand} style={{ top: tier * LEVEL_H - (tier === 0 ? 0 : 18), height: LEVEL_H }}>
                  <span className={s.tierBandLabel}>
                    {tier === 0 ? 'YOU' : `TIER ${tier} · ${Number(data.tierAmounts[tier - 1] ?? '1').toFixed(0)} USDT`}
                  </span>
                </div>
              ))}
              {/* コネクタ */}
              <svg className={s.edges} width={layout.width} height={layout.height + 30}>
                {layout.edges.map((e, i) => (
                  <path
                    key={i}
                    className={s.edgePath}
                    d={`M ${e.fromX} ${e.fromY} C ${e.fromX} ${e.fromY + 26}, ${e.toX} ${e.toY - 26}, ${e.toX} ${e.toY}`}
                  />
                ))}
              </svg>
              {/* ノード */}
              {layout.nodes.map((n) => {
                const isTarget = placementMode;
                const active = targetId === n.user_id;
                return (
                  <div
                    key={n.user_id}
                    className={[
                      s.node,
                      n.isSelf ? s.nodeSelf : '',
                      isTarget ? s.nodeTarget : s.nodeDim,
                      active ? s.nodeTargetActive : '',
                    ].join(' ')}
                    style={{ left: n.x, top: n.y }}
                    onClick={isTarget ? () => setTargetId(n.user_id) : undefined}
                    role={isTarget ? 'button' : undefined}
                  >
                    {!n.isSelf && <span className={s.nodeTier}>T{n.tier}</span>}
                    <span
                      className={s.avatar}
                      style={{
                        background: n.isSelf
                          ? 'linear-gradient(120deg, var(--gold), var(--gold-bright))'
                          : `hsl(${avatarHue(n.display)} 70% 62%)`,
                      }}
                    >
                      {n.isSelf ? '★' : nodeInitial(n.display)}
                    </span>
                    <span className={s.nodeName}>{n.isSelf ? 'あなた' : n.display}</span>
                    <span className={s.nodeMeta}>
                      直下 {n.directCount}名{n.placed_at ? ` · ${fmtDate(n.placed_at)}` : ''}
                    </span>
                    {active && <span className={s.nodeTargetHint}>ここに配置(T{n.tier + 1})</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ---- 確定ダイアログ(不可逆の明示確認) ---- */}
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
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              変更できないことを理解しました
            </label>
            {error && <p className="error">{error}</p>}
            <div className={d.dialogActions}>
              <button type="button" className="secondary" onClick={() => setTargetId(null)}>
                配置先を選び直す
              </button>
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
