'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { BonusRow, SupportSummary } from '@/components/SupportView';
import { localDateTime } from '@/lib/format-time';
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
        <Link href="/support/map" className={s.mapCta}>組織マップを開く →</Link>
      </div>
      <p className={s.lead}>
        あなたの組織からチャンピオン(7日間走破)が誕生したとき、支えたネットワークに
        お祝い金が支払われます。紹介しただけでは発生しません。
      </p>

      {/* ---- ⓪ あなたの紹介単価(Decision 099 スターターレート) ---- */}
      <section className={s.rateCard}>
        <div className={s.rateLeft}>
          <div className={s.rateK}>STARTER RATE · あなたの紹介単価</div>
          <div className={s.rateV}>
            {fmtUsdt(summary.starter_rate)}
            <span className="unit">USDT</span>
          </div>
          <div className={s.rateWho}>直接招待した仲間のチャンピオン1頭ごとに、あなたへ</div>
        </div>
        <div className={s.rateMid}>
          <div className={s.rateGaugeLabels}>
            <span className={s.rateGaugeStart}>スターター 8.00</span>
            <span className={s.rateGaugeEnd}>リーダー 3.00</span>
          </div>
          <div className={s.rateGauge}>
            <span className={s.rateGaugeFill} style={{ width: `${ratePos}%` }} />
            <span className={s.rateGaugeDot} style={{ left: `${ratePos}%` }} />
          </div>
          <div className={s.rateGaugeSub}>
            組織が育つほど単価は 8.00 → 3.00 へ滑らかに移行します(組織 50,000 USDT で 3.00)。
            単価×組織規模は一定になる設計 — <b>組織が育っても、直接分の収入合計は下がりません。</b>
          </div>
        </div>
        <div className={s.rateRight}>
          {boost > 1.005 ? (
            <span className={s.ratePill}>スターターブースト ×{boost.toFixed(1)}</span>
          ) : (
            <span className={s.ratePillStd}>スタンダード</span>
          )}
          <div className={s.rateNote}>
            単価はチャンピオン誕生の夜のものが適用され、毎日 20:00 (GMT+8) に再評価されます。
          </div>
        </div>
      </section>

      {/* ---- ① ヒーロー: ティア状態 + 次のアクション ---- */}
      <div className={s.hero}>
        <div className={s.tierHero}>
          <div className={s.tierHeroK}>SUPPORT TIER · 現在のティア</div>
          <div className={s.tierHeroRow}>
            <span className={s.tierHeroNum}>T{summary.unlocked_tiers}<span className={s.of}> / {summary.max_tiers}</span></span>
            <span className={s.tierHeroBar}>
              <span className={s.progress}><span style={{ width: `${progress}%` }} /></span>
              <span className={s.tierHeroNext} style={{ display: 'block' }}>
                {nextOrgThreshold
                  ? `T${summary.unlocked_tiers + 1}まで 組織 ${fmtUsdt(nextOrgThreshold)} USDT 以上を維持` +
                    (nextDirectThreshold ? `(+直接 ${fmtUsdt(nextDirectThreshold)} 以上)` : '')
                  : '最上位ティアに到達しています'}
              </span>
            </span>
          </div>
          <div className={s.tierHeroVol}>
            組織(配下7段)の稼働馬 現在価値: <b>{fmtUsdt(summary.org_volume)} USDT</b> ·
            直接招待分: <b>{fmtUsdt(summary.direct_volume)} USDT</b> ·
            毎日20:00 (GMT+8) に再評価(下回ると自動で下がります)
          </div>
        </div>

        <div className={`${s.action} ${hasPool ? s.actionPlace : s.actionGrow}`}>
          <div className={s.actionK}>次のアクション · NEXT</div>
          <div className={s.actionText}>
            {hasPool
              ? `配置待ちの仲間が ${summary.pool_count}名 います。配置するとネットワークに加わり、ティア維持につながります。`
              : nextOrgThreshold
                ? `次のティア解放は組織 ${fmtUsdt(nextOrgThreshold)} USDT から。仲間を招待して、ネットワーク全体を育てましょう。`
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
        <div className={s.tierMeta}>
          チャンピオン1頭の誕生で、お祝い金(T1=あなたの紹介単価 3〜8 / T2=2 / T3〜7=各1 USDT)が上位7ティアに配られます。
        </div>
        <div className={s.tierTable}>
          {summary.tier_amounts.map((amount, i) => {
            const open = i < summary.unlocked_tiers;
            return (
              <div key={i} className={`${s.tierCell} ${open ? s.tierCellOpen : ''}`}>
                <div className={s.tierCellName}>T{i + 1}{open ? ' ✓' : ''}</div>
                <div className={s.tierCellAmount}>
                  {i === 0 ? `${fmtUsdt(summary.starter_rate)} (3〜8)` : Number(amount).toFixed(0)} USDT
                </div>
                <div className={s.tierCellCond}>
                  {i === 0
                    ? '常時'
                    : `組織 ≥ ${Number(summary.org_thresholds[i]).toLocaleString('en-US')}` +
                      (i + 1 >= summary.direct_required_from_tier
                        ? ` +直接 ≥ ${Number(summary.direct_thresholds[i]).toLocaleString('en-US')}`
                        : '')}
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.tierFoot}>
          組織ボリューム = あなたの組織マップ配下7段(サポートボーナスが届く範囲)の稼働馬価値の合計。
          T5以上は「直接招待した仲間の稼働馬価値」も併せて必要です。横並び(直下の系列数)は無制限。
        </div>
      </section>

      {/* ---- ④ 招待リンク(1cカード: リンクピル+一体型コピーCTA) ---- */}
      <section className={s.invite}>
        <div className={s.inviteHead}>
          <span className={s.inviteTitle}>招待リンク · INVITE</span>
          <span className={s.inviteCode}>あなたのコード <b>{summary.referral_code}</b></span>
        </div>
        <div className={s.inviteRow}>
          <span className={s.inviteLink}>{inviteUrl}</span>
          <button type="button" className={s.inviteCopy} onClick={copyInvite}>
            {copied ? '✓ コピーしました' : 'リンクをコピー'}
          </button>
        </div>
        <p className={s.inviteNote}>
          招待しただけではボーナスは発生しません。サポートボーナスは、あなたのネットワーク内で
          チャンピオン(7日間走破)が誕生したときにだけ、所定の額(T1=紹介単価3〜8 / T2=2 /
          T3〜7=各1 USDT)の範囲でお祝い金として支払われます。金額・頻度の保証はありません。
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
                <span className={s.histDate}>{localDateTime(b.created_at)}</span>
                <span className={s.histWhy}>組織のチャンピオン誕生</span>
                <span className={s.histAmt}>+{fmtUsdt(b.amount)}<span className="unit">USDT</span></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
