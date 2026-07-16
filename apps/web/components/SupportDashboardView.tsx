'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { BonusRow, SupportSummary } from '@/components/SupportView';
import { localDateTime } from '@/lib/format-time';
import { fill, type AppDict } from '@/lib/i18n-shared';
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

export function SupportDashboardView({ data, t }: { data: SupportDashboardData; t: AppDict['support'] }) {
  const { summary } = data;
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('https://sevendaysderby.com');
  useEffect(() => setOrigin(window.location.origin), []);
  const inviteUrl = `${origin.replace(/\/$/, '')}/?ref=${summary.referral_code}`;

  // Decision 077: 主条件=組織(配下7段)ボリューム、T5以上は直接紹介も必要
  const nextTier = summary.unlocked_tiers < summary.max_tiers ? summary.unlocked_tiers + 1 : null;
  const nextOrgThreshold = nextTier ? summary.org_thresholds[nextTier - 1]! : null;
  const nextDirectThreshold =
    nextTier && nextTier >= summary.direct_required_from_tier
      ? summary.direct_thresholds[nextTier - 1]!
      : null;
  const progress = nextOrgThreshold
    ? Math.min(100, Math.round((Number(summary.org_volume) / Number(nextOrgThreshold)) * 100))
    : 100;

  const copyInvite = () => {
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const hasPool = summary.pool_count > 0;

  // Decision 099 スターターレート: 8.00(新人)→3.00(リーダー)への旅をゲージで表示。
  // ゲージ位置 = (8 − 現在単価) / (8 − 3)。ブースト表記 = 現在単価 ÷ 標準3.00。
  const rate = Number(summary.starter_rate);
  const ratePos = Math.min(100, Math.max(0, Math.round(((8 - rate) / 5) * 100)));
  const boost = rate / 3;

  return (
    <>
      <div className="section-head">
        <h1>Support Bonus</h1>
        <Link href="/support/map" className={s.mapCta}>{t.map_cta}</Link>
      </div>
      <p className={s.lead}>
        {t.lead}
      </p>

      {/* ---- ⓪ あなたの紹介単価(Decision 099 スターターレート) ---- */}
      <section className={s.rateCard}>
        <div className={s.rateLeft}>
          <div className={s.rateK}>{t.rate_k}</div>
          <div className={s.rateV}>
            {fmtUsdt(summary.starter_rate)}
            <span className="unit">USDT</span>
          </div>
          <div className={s.rateWho}>{t.rate_who}</div>
        </div>
        <div className={s.rateMid}>
          <div className={s.rateGaugeLabels}>
            <span className={s.rateGaugeStart}>{t.gauge_starter} 8.00</span>
            <span className={s.rateGaugeEnd}>{t.gauge_leader} 3.00</span>
          </div>
          <div className={s.rateGauge}>
            <span className={s.rateGaugeFill} style={{ width: `${ratePos}%` }} />
            <span className={s.rateGaugeDot} style={{ left: `${ratePos}%` }} />
          </div>
          <div className={s.rateGaugeSub}>
            {t.gauge_sub_a}<b>{t.gauge_sub_bold}</b>
          </div>
        </div>
        <div className={s.rateRight}>
          {boost > 1.005 ? (
            <span className={s.ratePill}>{fill(t.boost_tpl, { x: boost.toFixed(1) })}</span>
          ) : (
            <span className={s.ratePillStd}>{t.standard}</span>
          )}
          <div className={s.rateNote}>
            {t.rate_note}
          </div>
        </div>
      </section>

      {/* ---- ① ヒーロー: ティア状態 + 次のアクション ---- */}
      <div className={s.hero}>
        <div className={s.tierHero}>
          <div className={s.tierHeroK}>{t.tier_hero_k}</div>
          <div className={s.tierHeroRow}>
            <span className={s.tierHeroNum}>T{summary.unlocked_tiers}<span className={s.of}> / {summary.max_tiers}</span></span>
            <span className={s.tierHeroBar}>
              <span className={s.progress}><span style={{ width: `${progress}%` }} /></span>
              <span className={s.tierHeroNext} style={{ display: 'block' }}>
                {nextOrgThreshold
                  ? fill(t.next_maintain_tpl, { n: summary.unlocked_tiers + 1, v: fmtUsdt(nextOrgThreshold) }) +
                    (nextDirectThreshold ? fill(t.next_direct_tpl, { d: fmtUsdt(nextDirectThreshold) }) : '')
                  : t.tier_max}
              </span>
            </span>
          </div>
          <div className={s.tierHeroVol}>
            {t.vol_a}<b>{fmtUsdt(summary.org_volume)} USDT</b>{t.vol_b}<b>{fmtUsdt(summary.direct_volume)} USDT</b>{t.vol_c}
          </div>
        </div>

        <div className={`${s.action} ${hasPool ? s.actionPlace : s.actionGrow}`}>
          <div className={s.actionK}>{t.action_k}</div>
          <div className={s.actionText}>
            {hasPool
              ? fill(t.action_pool_tpl, { n: summary.pool_count })
              : nextOrgThreshold
                ? fill(t.action_grow_tpl, { v: fmtUsdt(nextOrgThreshold) })
                : t.action_max}
          </div>
          <Link href="/support/map" className={s.actionBtn}>
            {hasPool ? t.action_btn_place : t.action_btn_view}
          </Link>
        </div>
      </div>

      {/* ---- ② KPI ---- */}
      <div className={s.kpis}>
        <div className={`${s.kpi} ${s.kpiGold}`}>
          <div className={s.kpiK}>{t.kpi_total}</div>
          <div className={s.kpiV}>{fmtUsdt(summary.bonuses_received_total)}<span className="unit">USDT</span></div>
          <div className={s.kpiSub}>{fill(t.kpi_total_sub_tpl, { n: summary.bonuses_received_count })}</div>
        </div>
        <div className={`${s.kpi} ${s.kpiCyan}`}>
          <div className={s.kpiK}>{t.kpi_network}</div>
          <div className={s.kpiV}>{data.networkCount}<span className="unit">{t.unit_people}</span></div>
          <div className={s.kpiSub}>{t.kpi_network_sub}</div>
        </div>
        <Link href="/support/map" className={`${s.kpi} ${hasPool ? s.kpiPoolActive : s.kpiPool}`}>
          <div className={s.kpiK}>{t.kpi_pool}</div>
          <div className={s.kpiV}>{summary.pool_count}<span className="unit">{t.unit_people}</span></div>
          <div className={s.kpiSub}>{hasPool ? t.kpi_pool_place : t.kpi_pool_none}</div>
        </Link>
      </div>

      {/* ---- ③ ティアと支払額 ---- */}
      <section className="panel">
        <h2>{t.tier_table_h}</h2>
        <div className={s.tierMeta}>
          {t.tier_meta}
        </div>
        <div className={s.tierTable}>
          {summary.tier_amounts.map((amount, i) => {
            const open = i < summary.unlocked_tiers;
            return (
              <div key={i} className={`${s.tierCell} ${open ? s.tierCellOpen : ''}`}>
                <div className={s.tierCellName}>T{i + 1}{open ? ' ✓' : ''}</div>
                <div className={s.tierCellAmount}>
                  {i === 0 ? `${fmtUsdt(summary.starter_rate)}${t.t1_range}` : Number(amount).toFixed(0)} USDT
                </div>
                <div className={s.tierCellCond}>
                  {i === 0
                    ? t.tier_cond_always
                    : fill(t.tier_cond_org_tpl, { v: Number(summary.org_thresholds[i]).toLocaleString('en-US') }) +
                      (i + 1 >= summary.direct_required_from_tier
                        ? fill(t.tier_cond_direct_tpl, { d: Number(summary.direct_thresholds[i]).toLocaleString('en-US') })
                        : '')}
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.tierFoot}>
          {t.tier_foot}
        </div>
      </section>

      {/* ---- ④ 招待リンク(1cカード: リンクピル+一体型コピーCTA) ---- */}
      <section className={s.invite}>
        <div className={s.inviteHead}>
          <span className={s.inviteTitle}>{t.invite_title}</span>
          <span className={s.inviteCode}>{t.invite_code_label}<b>{summary.referral_code}</b></span>
        </div>
        <div className={s.inviteRow}>
          <span className={s.inviteLink}>{inviteUrl}</span>
          <button type="button" className={s.inviteCopy} onClick={copyInvite}>
            {copied ? t.invite_copied : t.invite_copy}
          </button>
        </div>
        <p className={s.inviteNote}>
          {t.invite_note}
        </p>
      </section>

      {/* ---- ⑤ ボーナス履歴 ---- */}
      <section className="panel">
        <h2>{t.hist_h}</h2>
        {data.bonuses.length === 0 ? (
          <p className="empty">{t.hist_empty}</p>
        ) : (
          <div className={s.histList}>
            {data.bonuses.map((b, i) => (
              <div key={i} className={s.histRow}>
                <span className={s.histTier} style={{ color: b.tier ? tierColor(b.tier) : 'var(--muted)' }}>
                  {b.tier ? `T${b.tier}` : '—'}
                </span>
                <span className={s.histDate}>{localDateTime(b.created_at)}</span>
                <span className={s.histWhy}>{t.hist_why}</span>
                <span className={s.histAmt}>+{fmtUsdt(b.amount)}<span className="unit">USDT</span></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
