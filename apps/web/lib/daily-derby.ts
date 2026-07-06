/**
 * The Daily Derby — live-event presentation model v2 (ADR-006/007/008).
 *
 * 20:00 MYT の日次精算バッチを約100秒の「THE DAILY DERBY」ライブイベントとして
 * 見せるための純粋なタイムライン計算+ログ生成。React も IO もない。
 *
 * 構成(オーナー指示 2026-07-06):
 *   T0        ファンファーレ(実尺16.8秒)+タイトル+オープニング手順
 *   17-30s    レース実走(蹄音ループ+プログレス)
 *   30-62s    レースターン結果 — BURN(赤)→生存(緑)→価値上昇→DAY7(金)の
 *             高速ログ濁流
 *   62-90s    P2Pターン — 出品→入札→マッチング→Day0新規発行のログ濁流
 *   90-96.5s  リワード — サポートボーナス(7ティア、Decision 074)+Revenge Buff 配布のログ
 *   97s       TODAY RACE END → 個人結果
 *
 * ログは全て決定論的に index から導出(乱数なし・表示専用のダミーデータ)。
 * 実結線時は counts をAPI値へ差し替える。個人を特定できる情報は出さない
 * (馬名+匿名ID U-xxxx のみ、ADR-007)。
 */

import { PRICE_TABLE_V1 } from '@sevendays/domain';

/** 開始3分前からデジタルカウントダウンを全面表示する。 */
export const PRE_SHOW_SECONDS = 180;
/** 残り30秒からカウントダウンの色が変わる。 */
export const ALERT_SECONDS = 30;

export type DerbyPhase =
  | 'WAITING'
  | 'COUNTDOWN'
  | 'LIVE'
  | 'PERSONAL_RESULT'
  | 'COMPLETED'
  | 'FAILED_SAFE_MODE';

/** ライブ演出に流し込む当日の集計値(実結線時はAPIから)。 */
export interface DerbyCounts {
  horses: number;
  burns: number;
  buffs: number;
  listed: number;
  assignments: number;
  mints: number;
}

/* ---- タイムライン(秒、T0 = 20:00) ------------------------------------- */

export const TITLE_UNTIL = 5;

export interface ShowStep {
  key: string;
  runLine: string;
  doneLine: string;
  countKey?: keyof DerbyCounts;
  startAt: number;
  duration: number;
  progress?: boolean;
}

/** オープニング(ファンファーレの尺 16.8s に合わせて T0+17 まで)。 */
export const OPENING_STEPS: readonly ShowStep[] = [
  { key: 'INIT', runLine: 'Initializing Race Engine...', doneLine: '✓ Race Engine Ready', startAt: 5, duration: 3.6 },
  { key: 'SNAPSHOT', runLine: 'Creating Participant Snapshots...', doneLine: '✓ {n} Horses Locked', countKey: 'horses', startAt: 8.6, duration: 4.2 },
  { key: 'SEED', runLine: 'Generating Race Seeds...', doneLine: '✓ Race Seeds Committed', startAt: 12.8, duration: 4.2 },
] as const;

/** レース実走(蹄音を鳴らす窓)。 */
export const RACE_RUN = { startAt: 17, endAt: 30 } as const;

/* ---- ログ濁流セクション -------------------------------------------------- */

export type LogTone =
  | 'header'
  | 'burn'
  | 'survive'
  | 'value'
  | 'day7'
  | 'list'
  | 'bid'
  | 'match'
  | 'mint'
  | 'mlm'
  | 'item'
  | 'end';

export interface LogSection {
  key: string;
  tone: LogTone;
  header: string;
  startAt: number;
  endAt: number;
  /** 1秒あたりの行数(猛スピード感の調整口)。 */
  rate: number;
}

export const LOG_SECTIONS: readonly LogSection[] = [
  { key: 'BURN', tone: 'burn', header: '═══ BURN RESOLUTION ═══', startAt: 30, endAt: 40, rate: 18 },
  { key: 'SURVIVE', tone: 'survive', header: '═══ SURVIVORS ═══', startAt: 40, endAt: 50, rate: 20 },
  { key: 'VALUE', tone: 'value', header: '═══ VALUE PROGRESSION ═══', startAt: 50, endAt: 58, rate: 18 },
  { key: 'DAY7', tone: 'day7', header: '═══ DAY7 CLEAR ═══', startAt: 58, endAt: 62, rate: 8 },
  { key: 'RACE_END', tone: 'end', header: '═══ RACE TURN COMPLETE ═══', startAt: 62, endAt: 62.2, rate: 0 },
  { key: 'LIST', tone: 'list', header: '═══ P2P MARKETPLACE — SELL ORDERS ═══', startAt: 66, endAt: 72, rate: 18 },
  { key: 'BID', tone: 'bid', header: '═══ P2P MARKETPLACE — BUY ORDERS ═══', startAt: 72, endAt: 78, rate: 20 },
  { key: 'MATCH', tone: 'match', header: '═══ P2P MATCHING ═══', startAt: 78, endAt: 85, rate: 20 },
  { key: 'MINT', tone: 'mint', header: '═══ DAY0 NEW HORSES ═══', startAt: 85, endAt: 90, rate: 14 },
  { key: 'MLM', tone: 'mlm', header: '═══ SUPPORT BONUS ═══', startAt: 90, endAt: 93.5, rate: 14 },
  { key: 'ITEM', tone: 'item', header: '═══ REVENGE BUFF DROPS ═══', startAt: 93.5, endAt: 96.5, rate: 14 },
] as const;

export const LOGS_FROM = 30;
/** P2Pターンの開幕演出(62-66s、GLOBAL MARKETPLACE OPENING)。 */
export const MARKET_OPEN = { startAt: 62, endAt: 66 } as const;
export const COMPLETE_AT = 97;
/** ここを過ぎたら個人結果カードへ。 */
export const SHOW_TOTAL = 101;

/** その時点のターン表示(ログ画面のヘッダー)。 */
export function turnLabel(elapsed: number): string {
  if (elapsed < 62) return 'RACE TURN';
  if (elapsed < 90) return 'P2P MARKETPLACE TURN';
  return 'REWARDS TURN';
}

/** マッチングカウンター(MATCHセクション中に総成約数まで数え上げ)。 */
export function matchingCount(elapsed: number, counts: DerbyCounts): number {
  const sec = LOG_SECTIONS.find((s) => s.key === 'MATCH')!;
  const t = (elapsed - sec.startAt) / (sec.endAt - sec.startAt);
  if (t <= 0) return 0;
  if (t >= 1) return counts.assignments;
  return Math.floor(counts.assignments * (1 - Math.pow(1 - t, 2.2)));
}

/* ---- 決定論ログ生成 ------------------------------------------------------ */

const PREFIXES = [
  'Royal', 'Golden', 'Black', 'Silver', 'Crimson', 'Azure', 'Neon', 'Iron',
  'Phantom', 'Emerald', 'Silent', 'Burning', 'Lunar', 'Solar', 'Storm',
  'Shadow', 'Cosmic', 'Turbo', 'Mystic', 'Blazing', 'Frozen', 'Wild',
  'Noble', 'Savage', 'Electric', 'Velvet', 'Rapid', 'Grand',
] as const;
const SUFFIXES = [
  'Thunder', 'Storm', 'Comet', 'Wolf', 'Tiger', 'Frost', 'Dash', 'Meteor',
  'Wind', 'Nova', 'Mirage', 'Aurora', 'Blade', 'Spirit', 'Flame', 'Arrow',
  'King', 'Queen', 'Star', 'Rocket', 'Drift', 'Echo', 'Pulse', 'Glory',
  'Fang', 'Bolt', 'Crown', 'Legend',
] as const;

/** 決定論ハッシュ(表示用ダミーデータの多様性のためだけの整数ミキサー)。 */
function mix(i: number, salt: number): number {
  let h = (i + 1) * 2654435761 + salt * 40503;
  h = (h ^ (h >>> 15)) * 2246822519;
  h = (h ^ (h >>> 13)) * 3266489917;
  return (h ^ (h >>> 16)) >>> 0;
}

function horseName(i: number, salt: number): string {
  const h = mix(i, salt);
  return `${PREFIXES[h % PREFIXES.length]!} ${SUFFIXES[(h >>> 8) % SUFFIXES.length]!}`;
}
function horseId(i: number, salt: number): string {
  return `#${String(mix(i, salt + 7) % 90000 + 10000)}`;
}
function userId(i: number, salt: number): string {
  return `U-${String(mix(i, salt + 13) % 9000 + 1000)}`;
}
function dayOf(i: number, salt: number, min = 1, max = 6): number {
  return min + (mix(i, salt + 29) % (max - min + 1));
}
const priceOfDay = (day: number): string => PRICE_TABLE_V1[day] ?? '100.00';

export interface LogLine {
  /** 全セクション通しの一意キー(Reactのkey用)。 */
  id: string;
  tone: LogTone;
  text: string;
}

/* 絵文字は使わない(オーナー指示 2026-07-06)— Bloomberg端末風の
   固定幅タグ+桁揃え(モノスペース+white-space:pre 前提)で識別する。 */
const pad = (t: string, w: number): string => (t.length >= w ? t : t + ' '.repeat(w - t.length));
const TAG_W = 7;
const NAME_W = 18;

function makeLine(section: LogSection, i: number): LogLine {
  const id = `${section.key}:${i}`;
  const tag = (t: string) => pad(t, TAG_W);
  switch (section.key) {
    case 'BURN': {
      const day = dayOf(i, 1);
      return { id, tone: 'burn', text: `${tag('BURN')}${horseId(i, 1)}  ${pad(horseName(i, 1), NAME_W)}  DAY ${day}  ELIMINATED` };
    }
    case 'SURVIVE': {
      const day = dayOf(i, 2, 0, 5);
      return { id, tone: 'survive', text: `${tag('SRVD')}${horseId(i, 2)}  ${pad(horseName(i, 2), NAME_W)}  DAY ${day} → DAY ${day + 1}` };
    }
    case 'VALUE': {
      const day = dayOf(i, 3);
      return { id, tone: 'value', text: `${tag('VAL')}${pad(horseName(i, 3), NAME_W)}  DAY ${day}  ${priceOfDay(day)} USDT  ▲` };
    }
    case 'DAY7':
      return { id, tone: 'day7', text: `${tag('DAY7')}${pad(horseName(i, 4), NAME_W)}  CLEARED — CHAMPION REWARD 200.00` };
    case 'LIST': {
      const day = dayOf(i, 5);
      return { id, tone: 'list', text: `${tag('LIST')}${pad(horseName(i, 5), NAME_W)}  ASK  ${priceOfDay(day)} USDT` };
    }
    case 'BID': {
      const day = dayOf(i, 6);
      return { id, tone: 'bid', text: `${tag('BID')}${pad(userId(i, 6), NAME_W)}  BUY  ${priceOfDay(day)} USDT` };
    }
    case 'MATCH': {
      const day = dayOf(i, 7);
      return { id, tone: 'match', text: `${tag('MATCH')}${pad(horseName(i, 7), NAME_W)}  ${priceOfDay(day)} USDT → ${userId(i, 7)}` };
    }
    case 'MINT':
      return { id, tone: 'mint', text: `${tag('MINT')}${pad(horseName(i, 8), NAME_W)}  DAY0 → ${userId(i, 8)}` };
    case 'MLM': {
      // サポートボーナス(Decision 074): T1=3 / T2=2 / T3-7=1 USDT
      const tiers = ['3.00', '2.00', '1.00', '1.00', '1.00', '1.00', '1.00'] as const;
      const t = 1 + (mix(i, 41) % 7);
      return { id, tone: 'mlm', text: `${tag('BONUS')}T${t}  +${tiers[t - 1]!} USDT → ${userId(i, 9)}` };
    }
    case 'ITEM': {
      const rarities = ['N', 'N', 'N', 'R', 'R', 'SR'] as const;
      const rarity = rarities[mix(i, 31) % rarities.length]!;
      return { id, tone: 'item', text: `${tag('ITEM')}REVENGE BUFF (${rarity}) → ${userId(i, 10)}` };
    }
    default:
      return { id, tone: section.tone, text: section.header };
  }
}

/**
 * elapsed 時点で画面に出ているべきログの「末尾 window 行」を返す。
 * 全行は生成せず、必要な index だけ導出する(高速)。
 */
export function logWindow(elapsed: number, window = 44): LogLine[] {
  const out: LogLine[] = [];
  for (let sIdx = LOG_SECTIONS.length - 1; sIdx >= 0 && out.length < window; sIdx--) {
    const sec = LOG_SECTIONS[sIdx]!;
    if (elapsed < sec.startAt) continue;
    const emitted = Math.floor((Math.min(elapsed, sec.endAt) - sec.startAt) * sec.rate);
    for (let i = emitted - 1; i >= 0 && out.length < window; i--) {
      out.push(makeLine(sec, i));
    }
    if (out.length < window) {
      out.push({ id: `${sec.key}:header`, tone: 'header', text: sec.header });
    }
  }
  return out.reverse();
}

/* ---- 個人結果(ADR-006 §6) --------------------------------------------- */

export type PersonalResult =
  | { kind: 'SOLD'; horseName: string; fromDay: number; soldPrice: string; newHorseName: string; newHorseDay: number; dnaHash?: string; newDnaHash?: string }
  | { kind: 'SURVIVED'; horseName: string; fromDay: number; dnaHash?: string }
  | { kind: 'BURNED'; horseName: string; buffRarity: 'N' | 'R' | 'SR'; dnaHash?: string }
  | { kind: 'DAY7'; horseName: string; buybackTotal: string; dnaHash?: string };

/* ---- フィクスチャ(プレビュー/モック結線用。実結線時にAPI値へ差替) ------- */

export const FIXTURE_COUNTS: DerbyCounts = {
  horses: 28122,
  burns: 1874,
  buffs: 1874,
  listed: 26248,
  assignments: 24310,
  mints: 1938,
};

export const FIXTURE_TICKER: readonly string[] = [
  'SOLD — Royal Thunder 177.16 USDT',
  'BURN — Black Storm',
  'DAY7 — Golden Wind CLEARED',
  'CHAMPION REWARD — 28.57 USDT',
  'REVENGE BUFF GENERATED',
  'SOLD — Azure Comet 146.41 USDT',
  'SOLD — Neon Mirage 161.05 USDT',
  'BURN — Iron Meteor',
  'SOLD — Silver Aurora 133.10 USDT',
  'DAY7 — Crimson Nova CLEARED',
  'REVENGE BUFF GENERATED',
  'SOLD — Phantom Frost 121.00 USDT',
] as const;

/** プレビュー用ダミー dna_hash(NftHorseArt のルック導出に使う)。 */
const dna = (seed: string): string => `0x${seed.repeat(32).slice(0, 64)}`;

export const FIXTURE_RESULTS: Record<string, PersonalResult> = {
  sold: { kind: 'SOLD', horseName: 'Royal Thunder', fromDay: 5, soldPrice: '177.16', newHorseName: 'Golden Storm', newHorseDay: 2, dnaHash: dna('a1'), newDnaHash: dna('4c') },
  survived: { kind: 'SURVIVED', horseName: 'Emerald Storm', fromDay: 3, dnaHash: dna('7e') },
  burned: { kind: 'BURNED', horseName: 'Royal Thunder', buffRarity: 'R', dnaHash: dna('a1') },
  day7: { kind: 'DAY7', horseName: 'Golden Wind', buybackTotal: '200.00', dnaHash: dna('f2') },
};
