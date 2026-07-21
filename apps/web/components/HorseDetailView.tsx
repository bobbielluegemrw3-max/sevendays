import Link from 'next/link';
import type { JSX } from 'react';
import { PRICE_TABLE_V1, trainingModifierV1, type HorseType as DomainHorseType, type TrainingType as DomainTrainingType } from '@sevendays/domain';
import { NftHorseArt } from '@/components/NftHorseArt';
import { HorsePager, type PagerNav } from '@/components/HorsePager';
import { TrainingForm } from '@/components/TrainingForm';
import { TrainingFormV2, type TrainingV2Confirmed } from '@/components/TrainingFormV2';
import { ItemBoostPanel } from '@/components/ItemBoostPanel';
import { ItemPrepPanelV3 } from '@/components/ItemPrepPanelV3';
import { HeroArtFx } from '@/components/HeroArtFx';
import { HeroReactionOverlay } from '@/components/HeroReactionOverlay';
import { HorseTransferForm } from '@/components/HorseTransferForm';
import { HorseReserveControl } from '@/components/HorseReserveControl';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { deriveNftLook, NIGHT_LOOK } from '@/lib/nft-visual';
import { uncollectedGain } from '@/components/stable-shared';
import { APP_COPY, isLvDisplayMode, type Lang } from '@/lib/i18n';
import { tvArtGlowStyle, tvChipStyle, tvNumStyle, tvMedalStyle } from '@/lib/tv-tier';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/horse-detail.module.css';

/* ============================================================================
 * /horses/[id](馬詳細・調教)全面リデザイン v2 — ダッシュボード/厩舎(Option 1c)と
 * 同じ部品言語。純粋な表示コンポーネント。props は { horse: HorseDetail } のみ。
 *
 * v2 の情報設計:
 *  1) MASTHEAD  : 名前 + レアリティ/タイプ/状態バッジ + 現在価値の大きなスタット。
 *  2) HERO ROW  : ヒーロー馬アート | 今日の調教(=最重要の日課)を「横並び同格」に配置。
 *                 出品中/結末では調教枠が「出品カード / 結末カード」に切り替わる。
 *  3) VALUE LADDER: 7日間の価格表(PRICE_TABLE_V1)を上昇する棒グラフで可視化し、
 *                 「現在地」と「今夜生き残れば/走破すれば」を1本の物語に集約。
 *  4) LOWER ROW : 状態と能力(COND/FATIGUE + ABILITY + レアリティ凡例) | 戦績。
 *  5) PROVENANCE: 検証情報(DNA/シード/世代)。
 *
 * 表示してよい数値は HorseDetail の値と PRICE_TABLE_V1(+ Day7買戻し 200)だけ。
 * 架空の統計は入れない。馬の絵は既存 NftHorseArt(dna_hash 決定論)のみ。調教は
 * 既存 TrainingForm / ItemBoostPanel をそのまま利用(ロジック不変)。データ取得層
 * page.tsx は依頼側で結線。087監査: 手動出品中は「今夜走らない」を明示し調教UIを出さない。
 * ========================================================================== */

/** 隠し演出(EASTER_EGG_PLAN.md): 原色ルックの着色。 */
const HERO_COLOR: Record<string, string> = {
  black: 'rgba(6,6,10,0.72)', red: '#e5322d', blue: '#2f6bff', yellow: '#ffcf1f', green: '#22c55e',
};

export interface HorseRaceResult {
  batch_date: string; final_rank: number; final_score: string; is_burned: boolean;
  participant_count: number;
  weather: string | null; track_condition: string | null; surface: string | null;
  /** その夜の調教(スナップショット由来・帰属表示用 — A2)。 */
  training_type?: string | null;
  snapshot_horse_type?: string | null;
}

export interface HorseDetail {
  id: string; name: string; status: string; current_day: number;
  horse_type: string; rarity: string; dna_hash: string; dna_modifier: string;
  ability_json: Record<string, number>;
  condition: string; fatigue: string;
  /** 総合値V0(0-100)。ACTIVE以外は null(FUN_V2_PLAN.md §3 A1)。 */
  total_value?: number | null;
  tonight_rank?: number | null;
  tonight_entrants?: number | null;
  tonight_band?: 'SAFE' | 'MID' | 'RISK' | null;
  mint_seed_hash: string; horse_generation_version: string;
  /** 譲渡された馬(Decision 094)— 手動出品不可の恒久マーク。 */
  gifted_at?: string | null;
  /** 'SMART' | 'MANUAL' | null(087監査)。 */
  listing: string | null;
  /** 施策C(FUN_V3): 非売指定(自動出品から保護する1頭)か。 */
  reserved?: boolean;
  /** 次のレース向けの調教済みか(2026-07-14: 調教フォームの完了表示用)。 */
  trained_for_next_race?: boolean;
  /** 確定済みの調教タイプ(A2: やり直しUIの初期値)。 */
  tonight_training?: string | null;
  /** V2エンジンがアクティブ(Decision 101)— 調教UIをメニュー方式へ切替。 */
  engine_v2?: boolean;
  /** 次サイクルの確定済みV2ロール(Decision 107: 変更不可の完了表示)。 */
  training_v2?: TrainingV2Confirmed | null;
  /** 次レースに装着中のレースアイテム(装備バッジ 2026-07-18)。 */
  race_item_v2?: { item_key: string; effective_race_date: string; slot: string } | null;
  /** 減衰シールドの残レース数(星霜の砂)。 */
  decay_shield_v2?: number;
  /** 隠し演出(EASTER_EGG_PLAN.md)。 */
  night_variant?: boolean;
  golden_star?: boolean;
  golden_aura?: boolean;
  revenge_flame?: boolean;
  revenge_gold?: boolean;
  milestone?: boolean;
  color_variant?: 'black' | 'red' | 'blue' | 'yellow' | 'green' | null;
  /** この馬の全戦績(日付昇順)。 */
  history: HorseRaceResult[];
  /** 施策D(FUN_V3): 育成者クレジット。この馬を育てた人ごとの貢献(delta_v2合計)。
   *  所有権移転でも残る恒久記録。breeder=null は「あなた」(is_you)。 */
  breeder_credits?: Array<{
    breeder: string | null; is_you: boolean; delta: number;
    item_bonus: number; sessions: number; pct: number;
  }>;
}

type TH = AppDict['horse'];

/* 総合値バッジ/安全圏の色(FUN_V2_PLAN.md §3 A1)。 */
function bandClsDetail(band: string | null | undefined): string {
  return band === 'SAFE' ? s.bandSafe! : band === 'RISK' ? s.bandRisk! : s.bandMid!;
}
type TC = AppDict['conds'];

/** テンプレの {v} の前後で分割して値だけ太字にする(語順の言語差を吸収)。 */
function boldV(tpl: string, v: string): JSX.Element {
  const [a, b] = tpl.split('{v}');
  return (
    <>
      {a}
      <b>{v}</b>
      {b}
    </>
  );
}

/** 能力ラベル(生キーのままでは読めない — 087監査 #5)。辞書から生成。 */
function abilityLabels(t: TH): Record<string, string> {
  return {
    base_speed: t.ab_speed,
    base_power: t.ab_power,
    base_stamina: t.ab_stamina,
    base_guts: t.ab_guts,
    base_luck: t.ab_luck,
  };
}
/** 能力の仕様上の上限(ABILITY_DISTRIBUTION_V1.max)— バーは絶対スケールで描く。 */
const ABILITY_MAX = 100;
/** Day7 走破の買い戻し額(価格表の外側・チャンピオン報酬)。 */
const CHAMPION_VALUE = '200';

function pct(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(6, Math.min(100, n)) : 60;
}
/** NUMERIC(20,8)のテキスト("82.00000000")を人間向けの整数表示に。 */
function stat(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? String(Math.round(n)) : raw;
}
function score2(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2) : raw;
}
function horseValue(currentDay: number): string {
  return PRICE_TABLE_V1[Math.max(0, Math.min(6, currentDay))] ?? PRICE_TABLE_V1[0]!;
}
function short(hash: string, head = 6, tail = 4): string {
  if (!hash || hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
function conditionsText(r: HorseRaceResult, tc: TC): string {
  if (!r.weather || !r.track_condition || !r.surface) return '—';
  const name = (k: string) => (tc as Record<string, string>)[k] ?? k;
  return `${name(r.weather)} · ${name(r.track_condition)} · ${name(r.surface)}`;
}

/* ---- 状態モデル ----------------------------------------------------------- */
type Mode = 'ACTIVE' | 'LISTED' | 'BURNED' | 'DAY7_CLEARED' | 'MEMORIALIZED';

/** 087監査: 手動出品中の ACTIVE は Market Lock(今夜走らない)として扱う。 */
function modeOf(horse: HorseDetail): Mode {
  if (horse.status === 'ACTIVE') return horse.listing === 'MANUAL' ? 'LISTED' : 'ACTIVE';
  if (horse.status === 'DAY7_CLEARED' || horse.status === 'MEMORIALIZED' || horse.status === 'BURNED') {
    return horse.status;
  }
  return 'ACTIVE';
}

interface StatusBadgeInfo { cls: string; label: string; }
function statusBadge(mode: Mode, t: TH): StatusBadgeInfo {
  switch (mode) {
    case 'LISTED': return { cls: s.stListed!, label: t.st_listed };
    case 'BURNED': return { cls: s.stBurned!, label: t.st_burned };
    case 'DAY7_CLEARED': return { cls: s.stCleared!, label: t.st_champion };
    case 'MEMORIALIZED': return { cls: s.stMemorial!, label: t.st_memorial };
    case 'ACTIVE':
    default: return { cls: s.stActive!, label: t.st_active };
  }
}

interface MastValue { k: string; v: string; unit: string; muted: boolean; }
function mastValue(horse: HorseDetail, mode: Mode, t: TH): MastValue {
  const d = horse.current_day;
  switch (mode) {
    case 'LISTED': return { k: t.k_listed, v: horseValue(d), unit: 'USDT', muted: false };
    case 'BURNED': return { k: t.k_outcome, v: t.v_burned, unit: '', muted: true };
    case 'DAY7_CLEARED': return { k: t.k_reward, v: CHAMPION_VALUE, unit: 'USDT', muted: false };
    case 'MEMORIALIZED': return { k: t.k_outcome, v: t.v_memorial, unit: '', muted: false };
    case 'ACTIVE':
    default: return { k: t.k_value, v: horseValue(d), unit: 'USDT', muted: false };
  }
}

function dayNote(horse: HorseDetail, mode: Mode, t: TH): string {
  const d = horse.current_day;
  switch (mode) {
    case 'ACTIVE':
      if (d >= 6) return fill(t.note_active_d6_tpl, { d });
      return fill(t.note_active_tpl, { d, next: Math.min(7, d + 1) })
        + (horse.listing === 'SMART' ? t.note_smart_suffix : '');
    case 'LISTED': return fill(t.note_listed_tpl, { d });
    case 'BURNED': return fill(t.note_burned_tpl, { d });
    case 'DAY7_CLEARED': return t.note_cleared;
    case 'MEMORIALIZED': return t.note_memorial;
  }
}

/* ---- 7日レール ------------------------------------------------------------ */
function DayRail({ horse, mode }: { horse: HorseDetail; mode: Mode }) {
  const day = horse.current_day;
  const reached = mode === 'DAY7_CLEARED' || mode === 'MEMORIALIZED' ? 7 : day;
  return (
    <div className={s.rail}>
      {Array.from({ length: 7 }, (_, i) => {
        const dd = i + 1;
        let cls = s.pip!;
        if (mode === 'BURNED') {
          if (dd < day + 1) cls = s.pipDone!;
          if (dd === day + 1) cls = s.pipBurn!;
        } else {
          if (dd < reached + 1) cls = s.pipDone!;
          if (dd === reached + 1 && mode === 'ACTIVE') cls = s.pipToday!;
        }
        return <span key={dd} className={cls} />;
      })}
    </div>
  );
}

/* ---- バリューラダー(価値の階段) ------------------------------------------- */
function ValueLadder({ horse, mode, t }: { horse: HorseDetail; mode: Mode; t: TH }) {
  const day = horse.current_day;

  let headline: JSX.Element;
  if (mode === 'ACTIVE') {
    headline = day >= 6 ? (
      <>
        <span className={s.ladNow}>{boldV(t.lad_now_tpl, PRICE_TABLE_V1[6]!)}</span>
        <span className={s.ladArrow}>→</span>
        <span className={`${s.ladNext} ${s.ladNextChamp}`}><span className={s.ladNextK}>{t.lad_champ_k}</span> <b>{CHAMPION_VALUE}</b> USDT {t.lad_champ_suffix}</span>
      </>
    ) : (
      <>
        <span className={s.ladNow}>{boldV(t.lad_now_tpl, horseValue(day))}</span>
        <span className={s.ladArrow}>→</span>
        <span className={s.ladNext}><span className={s.ladNextK}>{t.lad_next_k}</span> <b>{PRICE_TABLE_V1[day + 1]}</b> USDT</span>
      </>
    );
  } else if (mode === 'LISTED') {
    headline = (
      <>
        <span className={s.ladNow}>{boldV(t.lad_listed_now_tpl, horseValue(day))}</span>
        <span className={s.ladNext}><span className={`${s.ladNextK} ${s.ladNextKWarn}`}>{t.lad_listed_note}</span></span>
      </>
    );
  } else if (mode === 'BURNED') {
    headline = (
      <>
        <span className={`${s.ladNow} ${s.ladNowBurn}`}>{fill(t.lad_burn_now_tpl, { d: day })}</span>
        <span className={s.ladNext}><span className={`${s.ladNextK} ${s.ladNextKFaint}`}>{t.lad_burn_note}</span></span>
      </>
    );
  } else if (mode === 'DAY7_CLEARED') {
    headline = <span className={s.ladNow}>{boldV(t.lad_cleared_tpl, CHAMPION_VALUE)}</span>;
  } else {
    headline = <span className={s.ladNow}>{boldV(t.lad_memorial_tpl, CHAMPION_VALUE)}</span>;
  }

  const cols: JSX.Element[] = [];
  for (let i = 0; i < 7; i++) {
    let cls = s.barFuture!;
    let pin: JSX.Element | null = null;
    if (mode === 'ACTIVE' || mode === 'LISTED') {
      if (i < day) cls = s.barPast!;
      else if (i === day) { cls = s.barNow!; pin = <span className={`${s.ladPin} ${s.pinNow}`}>{t.pin_now}</span>; }
      else if (i === day + 1 && mode === 'ACTIVE') { cls = s.barNext!; pin = <span className={`${s.ladPin} ${s.pinNext}`}>{t.pin_next}</span>; }
    } else if (mode === 'BURNED') {
      if (i < day) cls = s.barPast!;
      else if (i === day) { cls = s.barBurn!; pin = <span className={`${s.ladPin} ${s.pinBurn}`}>{t.pin_burn}</span>; }
    } else {
      cls = s.barPast!;
    }
    const price = PRICE_TABLE_V1[i] ?? '0';
    const h = Math.max(24, Math.round((Number(price) / 200) * 100));
    cols.push(
      <div key={i} className={s.ladCol}>
        <div className={s.ladPrice}>{price}</div>
        <div className={`${s.ladBar} ${cls}`} style={{ height: `${h}%` }}>{pin}</div>
        <div className={s.ladDay}>Day{i}</div>
      </div>,
    );
  }
  // Day7 チャンピオン列
  let ccls = s.barChampFuture!;
  let cpin: JSX.Element | null = null;
  if (mode === 'DAY7_CLEARED' || mode === 'MEMORIALIZED') { ccls = s.barChamp!; cpin = <span className={`${s.ladPin} ${s.pinChamp}`}>{t.pin_clear}</span>; }
  else if (mode === 'ACTIVE' && day >= 6) { ccls = s.barChamp!; cpin = <span className={`${s.ladPin} ${s.pinChamp}`}>{t.pin_next}</span>; }
  cols.push(
    <div key="champ" className={s.ladCol}>
      <div className={`${s.ladPrice} ${s.ladPriceGold}`}>{CHAMPION_VALUE}</div>
      <div className={`${s.ladBar} ${ccls}`} style={{ height: '100%' }}>{cpin}</div>
      <div className={`${s.ladDay} ${s.ladDayChamp}`}>{t.lad_champ_day}</div>
    </div>,
  );

  return (
    <div>
      <div className={s.secLabel}>{t.lad_sec}</div>
      <div className={s.ladWrap}>
        <div className={s.ladHead}>{headline}</div>
        <div className={s.ladBars}>{cols}</div>
        <div className={s.ladNote}>{t.lad_note}</div>
      </div>
    </div>
  );
}

/* ---- メイン --------------------------------------------------------------- */
export function HorseDetailView({
  horse,
  nav,
  lang = 'ja',
}: {
  horse: HorseDetail;
  nav?: PagerNav | undefined;
  lang?: Lang;
}) {
  const t = APP_COPY[lang].horse;
  const tc = APP_COPY[lang].conds;
  const ts = APP_COPY[lang].stable;
  // 隠し演出(EASTER_EGG_PLAN.md): 真夜中の馬は夜色ルック。
  const look = horse.night_variant ? NIGHT_LOOK : deriveNftLook(horse.dna_hash, horse.name);
  const mode = modeOf(horse);
  const badge = statusBadge(mode, t);
  const mv = mastValue(horse, mode, t);
  const abLabel = abilityLabels(t);
  const abilities = Object.entries(horse.ability_json ?? {});
  const history = horse.history ?? [];
  const isActive = mode === 'ACTIVE';
  // 未回収(利確待ち)の上昇分 — A2の収穫の儀式(FUN_V2_PLAN §3)
  const uncollected = uncollectedGain({
    status: horse.status,
    current_day: horse.current_day,
    trained_for_next_race: horse.trained_for_next_race === true,
    listing: horse.listing,
  });

  return (
    <div className={s.wrap}>
      <Link href="/horses" className={s.crumb}>{t.crumb}</Link>

      {/* MASTHEAD */}
      <div className={s.mast}>
        <div className={s.mastL}>
          <div className={s.titleRow}>
            <span className={s.title}>{horse.name}</span>
            {horse.total_value !== null && horse.total_value !== undefined ? (
              <span className={`${s.badge} ${s.tvBadge}`} style={tvChipStyle(horse.total_value)}>
                {ts.tv_chip} <b style={tvNumStyle(horse.total_value)}>{Number(horse.total_value).toFixed(1)}</b>
              </span>
            ) : null}
            <span className={`${s.badge} ${s.typeBadge}`}>{horse.horse_type}</span>
            <span className={`${s.badge} ${badge.cls}`}>{badge.label}</span>
            {horse.listing === 'SMART' ? <span className={`${s.badge} ${s.stSmart}`}>{t.st_smart}</span> : null}
            {horse.reserved ? <span className={`${s.badge} ${s.stReserved}`}>{t.st_reserved}</span> : null}
            {horse.gifted_at ? <span className={`${s.badge} ${s.stGifted}`}>{t.st_gifted}</span> : null}
            {uncollected > 0 ? (
              <span className={`${s.badge} ${s.uncollectedBadge}`}>{fill(ts.uncollected_tpl, { v: uncollected.toFixed(2) })}</span>
            ) : null}
          </div>
        </div>
        <div className={s.mastR}>
          <div className={s.mastValK}>{mv.k}</div>
          <div className={`${s.mastVal} ${mv.muted ? s.mastValMuted : ''}`}>
            {mv.v}{mv.unit ? <small>{mv.unit}</small> : null}
          </div>
        </div>
      </div>

      {/* HERO ROW: 馬アート | 今日の調教(=最重要の日課) */}
      <div className={s.heroRow}>
        <div className={`${s.hero} ${mode === 'BURNED' ? s.heroBurned : ''}`}>
          <div className={s.heroInner}>
            <div
              className={`${s.artBox} ${horse.golden_aura ? s.heroAura : ''}`}
              style={tvArtGlowStyle(horse.total_value)}
            >
              {/* モバイル中央反応(案A): アートがスクロールアウトしていても反応を見せる */}
              <HeroReactionOverlay horseId={horse.id} horseName={horse.name} dnaHash={horse.dna_hash} />
              <HeroArtFx horseId={horse.id}>
                <NftHorseArt look={look} className={s.heroCanvas} />
                {(horse.decay_shield_v2 ?? 0) > 0 ? <span className={s.shieldFilm} aria-hidden="true" /> : null}
              </HeroArtFx>
              {horse.race_item_v2 ? (
                /* 装備バッジ(常駐): この馬は次のレースに備えている — 戦略の可視化 */
                <span className={s.gearBadge} title={`装着中: ${horse.race_item_v2.item_key}`}>
                  <img src={`/items/${horse.race_item_v2.item_key}.webp`} alt="装着中のレースアイテム" />
                </span>
              ) : null}
              {(horse.decay_shield_v2 ?? 0) > 0 ? (
                <span className={s.shieldChip}>SHIELD ×{horse.decay_shield_v2}</span>
              ) : null}
              {/* 隠し演出(EASTER_EGG_PLAN.md) */}
              {horse.color_variant ? (
                <span
                  className={s.heroColorSkin}
                  style={{ background: HERO_COLOR[horse.color_variant], mixBlendMode: horse.color_variant === 'black' ? 'multiply' : 'color' }}
                />
              ) : null}
              {horse.golden_star ? <span className={s.heroGoldenStar} title={ts.tip_golden}>★</span> : null}
              {horse.night_variant ? <span className={s.heroNightTag}>MIDNIGHT</span> : null}
              {horse.revenge_flame ? (
                <span className={`${s.heroFlameTag} ${horse.revenge_gold ? s.heroFlameGold : ''}`}>{t.mark_flame}</span>
              ) : null}
              {horse.milestone ? <span className={s.heroMilestone}>{t.mark_milestone}</span> : null}
              <div className={s.scrim} />
              <div className={s.artCap}>
                <div>
                  <div className={s.artCapK}>{horse.name.toUpperCase()}</div>
                  <div className={s.artCapSub}>{horse.horse_type}</div>
                </div>
                <div className={s.capBlocks}>
                  {horse.total_value !== null && horse.total_value !== undefined ? (
                    <div className={s.tvBig}>
                      <div className="l">TOTAL</div>
                      {/* Decision 112: 調教確定は総合値へ即反映されるため、ここの数値が常に実値。
                          再取得で値が変わったら登らせる(2026-07-21・1-1)— 調教の手応えは
                          演出のポップだけでなく、この常設の数字が動くことでも伝わる */}
                      <AnimatedNumber
                        className="v"
                        style={tvMedalStyle(horse.total_value)}
                        value={Number(horse.total_value)}
                        digits={1}
                        durationMs={800}
                      />
                    </div>
                  ) : null}
                  <div className={s.dayBig}>
                    <div className="l">{isLvDisplayMode() ? 'LV' : 'DAY'}</div>
                    <div className="v">{Math.min(7, horse.current_day)}<small>/7</small></div>
                  </div>
                </div>
              </div>
              {/* 前/次の馬へ(厩舎に戻らず回れる) */}
              {nav ? <HorsePager nav={nav} t={t} /> : null}
            </div>
            <div className={s.heroFoot}>
              <DayRail horse={horse} mode={mode} />
              {horse.tonight_rank && horse.tonight_entrants ? (
                <div className={`${s.rankLine} ${bandClsDetail(horse.tonight_band)}`}>
                  {fill(ts.rank_tpl, { r: horse.tonight_rank, n: horse.tonight_entrants })} ·{' '}
                  {horse.tonight_band === 'SAFE' ? ts.band_safe : horse.tonight_band === 'RISK' ? ts.band_risk : ts.band_mid}
                  <span className={s.rankNote}> — {ts.rank_note}</span>
                </div>
              ) : null}
              <div className={s.dayNote}>{dayNote(horse, mode, t)}</div>
            </div>
          </div>
        </div>

        <div className={s.action}>
          {isActive ? (
            <div className={s.trainCard}>
              <div className={s.trainTop}>
                <span className={s.trainTitle}>{t.train_title}</span>
                <span className={s.freeTag}>{t.free_tag}</span>
              </div>
              {/* V2は手順UI(案B・2026-07-20): 長い説明は①の「?」に畳むのでここには出さない */}
              {horse.engine_v2 ? null : <div className={s.trainDesc}>{t.train_desc}</div>}
              <div className={s.trainForm}>
                {horse.engine_v2 ? (
                  <TrainingFormV2
                    horseId={horse.id}
                    confirmed={horse.training_v2 ?? null}
                    lv={horse.current_day}
                    totalValue={horse.total_value ?? null}
                    desc={t.train_desc}
                    t={t}
                  />
                ) : (
                  <TrainingForm
                    horseId={horse.id}
                    horseType={horse.horse_type}
                    fatigue={Number(horse.fatigue)}
                    trained={horse.trained_for_next_race === true}
                    currentTraining={horse.tonight_training ?? null}
                    uncollected={uncollected}
                    t={t}
                  />
                )}
                {horse.engine_v2 ? (
                  <ItemPrepPanelV3 horseId={horse.id} t={t} />
                ) : (
                  <ItemBoostPanel horseId={horse.id} currentDay={horse.current_day} t={t} />
                )}
              </div>
              <div className={s.trainNote}>{t.train_note}</div>
              {/* 施策C(FUN_V3): 1頭非売指定。ACTIVE馬に表示(出品状態に依らない)。 */}
              <HorseReserveControl horseId={horse.id} reserved={horse.reserved ?? false} t={t} />
              {/* 馬の転送(Decision 094): ACTIVEかつ出品中でない馬のみ */}
              {horse.listing === null ? (
                <HorseTransferForm horseId={horse.id} horseName={horse.name} t={t} />
              ) : null}
            </div>
          ) : mode === 'LISTED' ? (
            <div className={`${s.outcome} ${s.outListed}`}>
              <div className={s.outHead}>{t.out_listed_head}</div>
              <div className={s.outText}>{fill(t.out_listed_text_tpl, { d: horse.current_day })}</div>
              <Link href="/market" className={s.outCta}>{t.out_manage}</Link>
            </div>
          ) : mode === 'BURNED' ? (
            <div className={`${s.outcome} ${s.outBurned}`}>
              <div className={s.outHead}>{t.out_burned_head}</div>
              <div className={s.outText}>{fill(t.out_burned_text_tpl, { d: horse.current_day })}</div>
            </div>
          ) : mode === 'DAY7_CLEARED' ? (
            <div className={`${s.outcome} ${s.outGold}`}>
              <div className={s.outHead}>{t.out_cleared_head}</div>
              <div className={s.outText}>{t.out_cleared_text}</div>
            </div>
          ) : (
            <div className={`${s.outcome} ${s.outGold}`}>
              <div className={s.outHead}>{t.out_memorial_head}</div>
              <div className={s.outText}>{t.out_memorial_text}</div>
            </div>
          )}
        </div>
      </div>

      {/* VALUE LADDER */}
      <ValueLadder horse={horse} mode={mode} t={t} />

      {/* LOWER ROW: 状態と能力 | 戦績 */}
      {/* V2(Decision 101): 調子・疲労・能力値は総合値に内包 — 凍結された旧数値を
          見せると誤解を生むため、V2では正直な説明カードに置き換える */}
      <div className={s.lowRow}>
        {horse.engine_v2 ? (
          <div>
            <div className={s.secLabel}>TOTAL VALUE</div>
            <div className={s.vitals}>
              <div className={`${s.mini} ${s.miniCond}`} style={{ gridColumn: '1 / -1' }}>
                <div className={s.miniK}>強さは総合値ひとつ</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7, marginTop: '4px' }}>
                  この馬の強さは総合値(0〜100)に集約されています。調子・疲労・能力値という
                  個別ステータスはありません。総合値は調教で伸び、レースごとに−2.0減衰します
                  (RESTで1回無効)。「大好物」「苦手」の隠れた好みは公開されません —
                  調教の結果から探り当てるのがこのゲームの攻略です。
                </div>
              </div>
            </div>
          </div>
        ) : (
        <div>
          <div className={s.secLabel}>{t.vit_sec}</div>
          <div className={s.vitals}>
            <div className={`${s.mini} ${s.miniCond}`}>
              <div className={s.miniK}>{t.cond_k}</div>
              <div className={s.miniRow}>
                <span className={s.miniNum}>{stat(horse.condition)}</span>
                <span className={s.track}><span className={s.fillCyan} style={{ width: `${pct(horse.condition)}%` }} /></span>
              </div>
            </div>
            <div
              className={`${s.mini} ${s.miniFtg}`}
              title={t.ftg_tip}
            >
              <div className={s.miniK}>{t.ftg_k}</div>
              <div className={s.miniRow}>
                <span className={s.miniNum}>{stat(horse.fatigue)}</span>
                <span className={s.track}><span className={s.fillMag} style={{ width: `${pct(horse.fatigue)}%` }} /></span>
              </div>
            </div>
          </div>
          <div className={s.abilityBox}>
            {abilities.map(([key, val]) => (
              <div key={key} className={s.abRow}>
                <span className={s.abLabel}>{abLabel[key] ?? key}</span>
                <span className={s.track}>
                  <span className={s.fillCyan} style={{ width: `${Math.max(3, Math.min(100, (Number(val) / ABILITY_MAX) * 100))}%` }} />
                </span>
                <span className={s.abVal}>{val}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {history.length > 0 ? (
          <div>
            <div className={s.secLabel}>{t.hist_sec}</div>
            <div className={s.histBox}>
              {history.map((r, i) => (
                <div key={r.batch_date} className={`${s.histRow} ${r.is_burned ? s.histBurned : ''}`}>
                  <span className={s.histDay}>{fill(t.race_n_tpl, { n: i + 1 })}</span>
                  <span className={s.histDate}>{r.batch_date.slice(5).replace('-', '/')}</span>
                  <span className={s.histRank}>
                    <b>{r.final_rank.toLocaleString('en-US')}</b>
                    <small>{fill(t.heads_tpl, { n: r.participant_count.toLocaleString('en-US') })}</small>
                  </span>
                  <span className={s.histScore}>SCORE {score2(r.final_score)}</span>
                  {r.training_type ? (
                    <span className={s.histTrain}>
                      {fill(t.attr_tpl, {
                        n: trainingModifierV1(
                          (r.snapshot_horse_type ?? horse.horse_type) as DomainHorseType,
                          r.training_type as DomainTrainingType,
                        ),
                      })}
                    </span>
                  ) : null}
                  <span className={s.histCond}>{conditionsText(r, tc)}</span>
                  <span className={s.histRes}>
                    {r.is_burned ? <span className={s.burnTag}>BURN</span> : <span className={s.survTag}>{t.surv_tag}</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className={s.histNote}>{t.hist_note}</div>
          </div>
        ) : (
          <div>
            <div className={s.secLabel}>{t.hist_sec}</div>
            <div className={s.histEmpty}>{t.hist_empty}</div>
          </div>
        )}
      </div>

      {/* 施策D(FUN_V3): 育成者クレジット — 誰が育てたか(名誉)。売った後も残る。 */}
      {horse.breeder_credits && horse.breeder_credits.length > 0 ? (
        <div className={s.breeders}>
          <div className={s.secLabel}>{t.breeders_sec}</div>
          <div className={s.histBox}>
            {horse.breeder_credits.map((b, i) => (
              <div key={i} className={`${s.breederRow} ${b.is_you ? s.breederYou : ''}`}>
                <span className={s.breederName}>{b.is_you ? t.breeders_you : (b.breeder ?? '—')}</span>
                <span className={s.breederPct}>{fill(t.breeders_pct_tpl, { p: b.pct })}</span>
                <span className={s.breederDelta}>+{b.delta.toFixed(1)}</span>
                {b.item_bonus > 0 ? (
                  <span className={s.breederItem}>{fill(t.breeders_item_tpl, { v: b.item_bonus.toFixed(1) })}</span>
                ) : null}
              </div>
            ))}
          </div>
          <div className={s.histNote}>{t.breeders_note}</div>
        </div>
      ) : null}

      {/* PROVENANCE
          UI_FOUNDATION_PLAN Tier 2-1 は「ブロック全体を切る」としているが、
          DNA/シード/世代は公正性の検証情報であり、透明性台帳(/ledger)と同じく
          弁護士レビューの前提でもある。消さずに畳む — 既定では閉じているので
          画面の数字は減り、検証したい人はいつでも開ける。 */}
      <details className={s.provDetails}>
        <summary className={`${s.secLabel} ${s.secLabelDim} ${s.provSummary}`}>{t.prov_sec}</summary>
        <div className={s.prov}>
          <div className={s.provRow}>
            <span className={s.provK}>DNA HASH</span>
            <span className={s.provV}>{short(horse.dna_hash)} (mod {horse.dna_modifier})</span>
          </div>
          <div className={s.provRow}>
            <span className={s.provK}>MINT SEED</span>
            <span className={s.provV}>{short(horse.mint_seed_hash)}</span>
          </div>
          <div className={s.provRow}>
            <span className={s.provK}>GEN VERSION</span>
            <span className={s.provV}>{horse.horse_generation_version}</span>
          </div>
          <div className={s.provNote}>{t.prov_note}</div>
        </div>
      </details>
    </div>
  );
}
