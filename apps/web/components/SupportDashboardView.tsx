'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { BonusRow, SupportSummary } from '@/components/SupportView';
import s from '../app/support.module.css';

/**
 * /support — サポートボーナス ダッシュボード(数字と状態に集中)。
 * 組織を見る・配置する操作は /support/map(組織マップ)に分離。
 * コピー規範(R3): MLM/コミッション/紹介報酬という語は使わない。
 */

export interface SupportDashboardData {
  summary: SupportSummary;
  bonuses: BonusRow[];
  networkCount: number;
}

const fmtUsdt = (v: string): string =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SupportDashboardView({ data }: { data: SupportDashboardData }) {
  const { summary } = data;
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('https://sevendaysderby.com');
  useEffect(() => setOrigin(window.location.origin), []);
  const inviteUrl = `${origin.replace(/\/$/, '')}/?ref=${summary.referral_code}`;

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

  return (
    <>
      <div className="section-head">
        <h1>Support Bonus</h1>
        <Link href="/support/map" className={s.mapCta}>
          組織マップを開く →
        </Link>
      </div>
      <p className={s.lead}>
        仲間の馬がBurnから立ち直るとき、支えたネットワークにサポートボーナスが支払われます。
        紹介しただけでは発生しません。
      </p>

      {/* ---- KPI タイル ---- */}
      <div className="grid cols-3" style={{ marginTop: '0.9rem' }}>
        <div className="panel stat" style={{ margin: 0 }}>
          <div className="label">Support Tier</div>
          <div className="value" style={{ color: 'var(--cyan)' }}>
            T{summary.unlocked_tiers}
            <span className="unit">/ {summary.max_tiers}</span>
          </div>
          <div className={s.tierProgress}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className={s.tierNext}>
            {nextThreshold
              ? `T${summary.unlocked_tiers + 1}まで ${fmtUsdt(nextThreshold)} USDT 以上を維持`
              : '最上位ティア到達'}
          </div>
        </div>
        <div className="panel stat" style={{ margin: 0 }}>
          <div className="label">累計サポートボーナス</div>
          <div className="value">
            {fmtUsdt(summary.bonuses_received_total)}
            <span className="unit">USDT</span>
          </div>
          <div className={s.tierNext}>{summary.bonuses_received_count}回の受け取り</div>
        </div>
        <div className="panel stat" style={{ margin: 0 }}>
          <div className="label">ネットワーク</div>
          <div className="value">
            {data.networkCount}
            <span className="unit">名</span>
          </div>
          <div className={s.tierNext}>
            {summary.pool_count > 0 ? (
              <Link href="/support/map">配置待ち {summary.pool_count}名 → マップで配置する</Link>
            ) : (
              '配置待ちなし'
            )}
          </div>
        </div>
      </div>

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

      {/* ---- ティア表 ---- */}
      <section className="panel">
        <h2>ティアと支払額</h2>
        <div className={s.tierHead}>
          <span className={s.tierVolume}>
            直接招待した仲間の稼働馬 現在価値: {fmtUsdt(summary.volume)} USDT ·
            毎日20:00 (GMT+8) に再評価(下回ると自動で下がります)
          </span>
        </div>
        <div className={s.tierTable}>
          {summary.tier_amounts.map((amount, i) => {
            const open = i < summary.unlocked_tiers;
            return (
              <div key={i} className={`${s.tierCell} ${open ? s.tierCellOpen : ''}`}>
                <div className={s.tierCellName}>T{i + 1}{open ? ' ✓' : ''}</div>
                <div className={s.tierCellAmount}>{Number(amount).toFixed(0)} USDT</div>
                <div className={s.tierCellCond}>
                  {i === 0 ? '常時' : `≥ ${Number(summary.tier_thresholds[i]).toLocaleString('en-US')}`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- ボーナス履歴 ---- */}
      <section className="panel">
        <h2>サポートボーナス履歴</h2>
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
    </>
  );
}
