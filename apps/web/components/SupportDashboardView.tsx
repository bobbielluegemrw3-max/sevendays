'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { BonusRow, SupportSummary } from '@/components/SupportView';
import s from '../app/support.module.css';

/**
 * /support — サポートボーナス ダッシュボード リデザイン(情報優先度を再設計)。
 * 最初に目に入る順: ①現在のティア + 次のアクション → ②KPI(累計/ネットワーク/配置待ち)
 * → ③ティア表 → ④招待リンク → ⑤履歴。組織を見る/配置する操作は /support/map に分離。
 *
 * コピー規範(R3): MLM/コミッション/紹介報酬/稼げる 等は使わない。世界観は
 * 「あなたの厩舎が仲間の復帰を支えたから手当が支払われる」。props 型は既存のまま。
 */

export interface SupportDashboardData {
  summary: SupportSummary;
  bonuses: BonusRow[];
  networkCount: number;
}

const fmtUsdt = (v: string): string =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tierColor = (t: number): string =>
  ['#c9a86a', '#00eaff', '#5ff5ff', '#7ee0ff', '#a9c6ff', '#c9a8ff', '#ff8fe4', '#ff5ce0'][t] ?? '#8f8ac2';

export function SupportDashboardView({ data }: { data: SupportDashboardData }) {
  const { summary } = data;
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('https://sevendaysderby.com');
  useEffect(() => setOrigin(window.location.origin), []);
  const inviteUrl = `${origin.replace(/\/$/, '')}/?ref=${summary.referral_code}`;

  const nextThreshold =
    summary.unlocked_tiers < summary.max_tiers ? summary.tier_thresholds[summary.unlocked_tiers]! : null;
  const progress = nextThreshold
    ? Math.min(100, Math.round((Number(summary.volume) / Number(nextThreshold)) * 100))
    : 100;

  const copyInvite = () => {
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const hasPool = summary.pool_count > 0;

  return (
    <>
      <div className="section-head">
        <h1>Support Bonus</h1>
        <Link href="/support/map" className={s.mapCta}>組織マップを開く →</Link>
      </div>
      <p className={s.lead}>
        仲間の馬がBurnから立ち直るとき、支えたネットワークにサポートボーナスが支払われます。
        紹介しただけでは発生しません。
      </p>

      {/* ---- ① ヒーロー: ティア状態 + 次のアクション ---- */}
      <div className={s.hero}>
        <div className={s.tierHero}>
          <div className={s.tierHeroK}>SUPPORT TIER · 現在のティア</div>
          <div className={s.tierHeroRow}>
            <span className={s.tierHeroNum}>T{summary.unlocked_tiers}<span className={s.of}> / {summary.max_tiers}</span></span>
            <span className={s.tierHeroBar}>
              <span className={s.progress}><span style={{ width: `${progress}%` }} /></span>
              <span className={s.tierHeroNext} style={{ display: 'block' }}>
                {nextThreshold
                  ? `T${summary.unlocked_tiers + 1}まで ${fmtUsdt(nextThreshold)} USDT 以上を維持`
                  : '最上位ティアに到達しています'}
              </span>
            </span>
          </div>
          <div className={s.tierHeroVol}>
            直接招待した仲間の稼働馬 現在価値: <b>{fmtUsdt(summary.volume)} USDT</b> ·
            毎日20:00 (GMT+8) に再評価(下回ると自動で下がります)
          </div>
        </div>

        <div className={`${s.action} ${hasPool ? s.actionPlace : s.actionGrow}`}>
          <div className={s.actionK}>次のアクション · NEXT</div>
          <div className={s.actionText}>
            {hasPool
              ? `配置待ちの仲間が ${summary.pool_count}名 います。配置するとネットワークに加わり、ティア維持につながります。`
              : nextThreshold
                ? `次のティア解放まで ${fmtUsdt(nextThreshold)} USDT。仲間を招待して、稼働馬の価値合計を伸ばしましょう。`
                : 'すべてのティアが解放されています。ネットワークの維持を続けましょう。'}
          </div>
          <Link href="/support/map" className={s.actionBtn}>
            {hasPool ? 'マップで配置する' : '組織マップを見る'}
          </Link>
        </div>
      </div>

      {/* ---- ② KPI ---- */}
      <div className={s.kpis}>
        <div className={`${s.kpi} ${s.kpiGold}`}>
          <div className={s.kpiK}>累計サポートボーナス</div>
          <div className={s.kpiV}>{fmtUsdt(summary.bonuses_received_total)}<span className="unit">USDT</span></div>
          <div className={s.kpiSub}>{summary.bonuses_received_count}回の受け取り</div>
        </div>
        <div className={`${s.kpi} ${s.kpiCyan}`}>
          <div className={s.kpiK}>ネットワーク</div>
          <div className={s.kpiV}>{data.networkCount}<span className="unit">名</span></div>
          <div className={s.kpiSub}>あなたが支える仲間</div>
        </div>
        <Link href="/support/map" className={`${s.kpi} ${hasPool ? s.kpiPoolActive : s.kpiPool}`}>
          <div className={s.kpiK}>配置待ち</div>
          <div className={s.kpiV}>{summary.pool_count}<span className="unit">名</span></div>
          <div className={s.kpiSub}>{hasPool ? 'マップで配置する →' : '配置待ちなし'}</div>
        </Link>
      </div>

      {/* ---- ③ ティアと支払額 ---- */}
      <section className="panel">
        <h2>ティアと支払額</h2>
        <div className={s.tierMeta}>1件のBurnで合計10 USDT が上位7ティアに配られます。</div>
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
        <div className={s.tierFoot}>
          ティア解放条件 = 直接招待した仲間の稼働馬の現在価値合計。横並び(直下の系列数)は無制限です。
        </div>
      </section>

      {/* ---- ④ 招待リンク ---- */}
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

      {/* ---- ⑤ ボーナス履歴 ---- */}
      <section className="panel">
        <h2>サポートボーナス履歴</h2>
        {data.bonuses.length === 0 ? (
          <p className="empty">まだサポートボーナスはありません。</p>
        ) : (
          <div className={s.histList}>
            {data.bonuses.map((b, i) => (
              <div key={i} className={s.histRow}>
                <span className={s.histTier} style={{ color: b.tier ? tierColor(b.tier) : 'var(--muted)' }}>
                  {b.tier ? `T${b.tier}` : '—'}
                </span>
                <span className={s.histDate}>{b.created_at.slice(0, 16).replace('T', ' ')}</span>
                <span className={s.histWhy}>仲間の復帰を支援</span>
                <span className={s.histAmt}>+{fmtUsdt(b.amount)}<span className="unit">USDT</span></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
