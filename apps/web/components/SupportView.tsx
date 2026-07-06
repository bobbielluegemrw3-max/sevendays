'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/support.module.css';

/**
 * /support — サポートネットワーク(Decision 074)。
 * 世界観: 「紹介したから報酬」ではなく「あなたの厩舎が仲間の復帰を支えた
 * から、サポートボーナスが支払われる」。コピー規範(PRELAUNCH R3):
 * MLM/コミッション/紹介報酬という語は使わない。稼げる系の訴求もしない。
 *
 * 配置は一度確定すると本人にも運営UIにも変更手段がない(管理者の監査付き
 * 例外のみ)— ダイアログで明示的に確認させる。
 */

export interface SupportSummary {
  referral_code: string;
  has_sponsor: boolean;
  is_placed: boolean;
  unlocked_tiers: number;
  volume: string;
  max_tiers: number;
  tier_amounts: readonly string[];
  tier_thresholds: readonly string[];
  pool_count: number;
  bonuses_received_total: string;
  bonuses_received_count: number;
}
export interface PoolMember {
  user_id: string;
  display: string;
  joined_at: string;
}
export interface NetworkNode {
  user_id: string;
  parent_user_id: string | null;
  tier: number;
  display: string;
  placed_at: string | null;
}
export interface BonusRow {
  amount: string;
  tier: number | null;
  burn_event_id: string | null;
  created_at: string;
}

export interface SupportData {
  summary: SupportSummary;
  pool: PoolMember[];
  network: NetworkNode[];
  bonuses: BonusRow[];
}

const fmtUsdt = (v: string): string =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string): string => iso.slice(0, 10);

export function SupportView({
  data,
  selfUserId,
  preview = false,
}: {
  data: SupportData;
  selfUserId: string;
  preview?: boolean;
}) {
  const router = useRouter();
  const { summary } = data;
  const [copied, setCopied] = useState(false);
  const [placing, setPlacing] = useState<PoolMember | null>(null);
  const [parentChoice, setParentChoice] = useState<string>('self');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // preview では配置をローカルに反映する(APIなし)
  const [previewPlaced, setPreviewPlaced] = useState<string[]>([]);

  // SSRとクライアントで origin が異なるとハイドレーション不一致になるため、
  // マウント後に実オリジンへ差し替える(初期表示は本番ドメイン)。
  const [origin, setOrigin] = useState('https://sevendaysderby.com');
  useEffect(() => setOrigin(window.location.origin), []);
  const inviteUrl = `${origin.replace(/\/$/, '')}/?ref=${summary.referral_code}`;

  const pool = data.pool.filter((m) => !previewPlaced.includes(m.user_id));
  const nextThreshold =
    summary.unlocked_tiers < summary.max_tiers
      ? summary.tier_thresholds[summary.unlocked_tiers]!
      : null;
  const progress = nextThreshold
    ? Math.min(100, Math.round((Number(summary.volume) / Number(nextThreshold)) * 100))
    : 100;

  const copyInvite = () => {
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const openPlacement = (member: PoolMember) => {
    setPlacing(member);
    setParentChoice('self');
    setConfirmed(false);
    setError(null);
  };

  const submitPlacement = async () => {
    if (!placing || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    if (preview) {
      setPreviewPlaced((prev) => [...prev, placing.user_id]);
      setPlacing(null);
      setBusy(false);
      return;
    }
    const result = await apiFetch('/api/v1/support/place', {
      method: 'POST',
      body: {
        user_id: placing.user_id,
        parent_user_id: parentChoice === 'self' ? selfUserId : parentChoice,
      },
    });
    setBusy(false);
    if (result.status === 200) {
      setPlacing(null);
      router.refresh();
    } else {
      setError(errorMessage(result.body) ?? '配置に失敗しました。');
    }
  };

  return (
    <>
      <h1>Support Network</h1>
      <p className={s.lead}>
        仲間を招待して、あなたの厩舎のネットワークを育てましょう。仲間の馬がBurnから立ち直るとき、
        支えたネットワークにサポートボーナスが支払われます。
      </p>

      {/* ---- 招待リンク ---- */}
      <section className="panel">
        <h2>招待リンク</h2>
        <div className={s.inviteRow}>
          <span className={s.inviteLink}>{inviteUrl}</span>
          <button type="button" onClick={copyInvite}>コピー</button>
          {copied && <span className={s.copied}>コピーしました</span>}
        </div>
        <p className={s.inviteNote}>
          招待しただけではボーナスは発生しません。サポートボーナスは、あなたのネットワーク内で
          Burnが起きたときにだけ、固定額(合計10 USDT/件)の範囲で支払われます。金額・頻度の保証はありません。
        </p>
      </section>

      {/* ---- ティア ---- */}
      <section className="panel">
        <h2>サポートティア</h2>
        <div className={s.tierHead}>
          <span className={s.tierNow}>TIER {summary.unlocked_tiers}</span>
          <span className={s.tierVolume}>
            直接招待した仲間の稼働馬 現在価値: {fmtUsdt(summary.volume)} USDT
          </span>
        </div>
        <div className={s.tierProgress}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className={s.tierNext}>
          {nextThreshold
            ? `TIER ${summary.unlocked_tiers + 1} まで: ${fmtUsdt(nextThreshold)} USDT 以上を維持`
            : '最上位ティアに到達しています'}
          {' · 毎日20:00 (GMT+8) に再評価されます(下回ると自動で下がります)'}
        </div>
        <div className={s.tierTable}>
          {data.summary.tier_amounts.map((amount, i) => {
            const open = i < summary.unlocked_tiers;
            return (
              <div key={i} className={`${s.tierCell} ${open ? s.tierCellOpen : ''}`}>
                <div className={s.tierCellName}>T{i + 1}{open ? ' ✓' : ''}</div>
                <div className={s.tierCellAmount}>{Number(amount).toFixed(0)}$</div>
                <div className={s.tierCellCond}>
                  {i === 0 ? '常時' : `≥ ${Number(summary.tier_thresholds[i]).toLocaleString('en-US')}`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- 配置待ちの仲間 ---- */}
      <section className="panel">
        <div className="section-head">
          <h2>配置待ちの仲間</h2>
          <span className="muted">{pool.length}名</span>
        </div>
        {pool.length === 0 ? (
          <p className="empty">配置待ちの仲間はいません。招待リンクを共有しましょう。</p>
        ) : (
          pool.map((m) => (
            <div key={m.user_id} className={s.memberRow}>
              <span className={s.memberName}>{m.display}</span>
              <span className={s.memberMeta}>参加 {fmtDate(m.joined_at)}</span>
              <span className="spacer" style={{ flex: 1 }} />
              <button type="button" className="secondary" onClick={() => openPlacement(m)}>
                配置する
              </button>
            </div>
          ))
        )}
      </section>

      {/* ---- ネットワーク ---- */}
      <section className="panel">
        <div className="section-head">
          <h2>あなたのネットワーク</h2>
          <span className="muted">{data.network.length}名</span>
        </div>
        {data.network.length === 0 ? (
          <p className="empty">まだ誰も配置されていません。</p>
        ) : (
          data.network.map((n) => (
            <div key={n.user_id} className={s.memberRow}>
              <span className={s.indent} style={{ width: `${(n.tier - 1) * 18}px` }} />
              <span className={s.tierTag}>T{n.tier}</span>
              <span className={s.memberName}>{n.display}</span>
              {n.placed_at && <span className={s.memberMeta}>配置 {fmtDate(n.placed_at)}</span>}
            </div>
          ))
        )}
      </section>

      {/* ---- ボーナス履歴 ---- */}
      <section className="panel">
        <div className="section-head">
          <h2>サポートボーナス履歴</h2>
          <span className={s.bonusTotal}>
            {fmtUsdt(summary.bonuses_received_total)}
            <span className="unit"> USDT 累計</span>
          </span>
        </div>
        {data.bonuses.length === 0 ? (
          <p className="empty">まだサポートボーナスはありません。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>ティア</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              {data.bonuses.map((b, i) => (
                <tr key={i}>
                  <td>{b.created_at.slice(0, 16).replace('T', ' ')}</td>
                  <td>{b.tier ? `T${b.tier}` : '—'}</td>
                  <td>+{fmtUsdt(b.amount)} USDT</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---- 配置ダイアログ(不可逆の明示確認) ---- */}
      {placing && (
        <div className={s.overlay} role="dialog" aria-modal="true">
          <div className={s.dialog}>
            <div className={s.dialogTitle}>仲間を配置する</div>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              <strong>{placing.display}</strong> をネットワークのどこに配置しますか?
            </p>
            <label>
              配置先
              <select value={parentChoice} onChange={(e) => setParentChoice(e.target.value)}>
                <option value="self">自分の直下(TIER 1)</option>
                {data.network.map((n) => (
                  <option key={n.user_id} value={n.user_id}>
                    {`T${n.tier} ${n.display} の直下(TIER ${Math.min(n.tier + 1, 99)})`}
                  </option>
                ))}
              </select>
            </label>
            <div className={s.warnBox}>
              ⚠ 配置は一度確定すると<strong>二度と変更できません</strong>。
              配置換えの依頼は受け付けられません(システム上の例外処理は運営管理者のみ)。
              確定する前に配置先をよく確認してください。
            </div>
            <label className={s.confirmLabel}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              変更できないことを理解しました
            </label>
            {error && <p className="error">{error}</p>}
            <div className={s.dialogActions}>
              <button type="button" className="secondary" onClick={() => setPlacing(null)}>
                キャンセル
              </button>
              <button type="button" disabled={!confirmed || busy} onClick={() => void submitPlacement()}>
                {busy ? '配置中…' : 'この位置で確定する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
