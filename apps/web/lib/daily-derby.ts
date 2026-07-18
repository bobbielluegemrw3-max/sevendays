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

import {
  PRICE_TABLE_V1,
  SURFACE_JA,
  TRACK_JA,
  WEATHER_JA,
  raceNightNameV2,
  type RaceConditions,
} from '@sevendays/domain';

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
  /** 今夜DAY7走破した頭数(2026-07-14: ログ濁流の件数実数化)。 */
  day7: number;
  /** 今夜起票された祝い金の行数(同上)。 */
  celebrations: number;
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

/* 流量はオーナー承認の案A(2026-07-10): 毎秒約6行 —
   旧の滝(14〜20行/秒)ほど激しくなく、正典(約1.6行/秒)より活気のある中間。 */
export const LOG_SECTIONS: readonly LogSection[] = [
  { key: 'BURN', tone: 'burn', header: '═══ BURN RESOLUTION ═══', startAt: 30, endAt: 40, rate: 6 },
  { key: 'SURVIVE', tone: 'survive', header: '═══ SURVIVORS ═══', startAt: 40, endAt: 50, rate: 6 },
  { key: 'VALUE', tone: 'value', header: '═══ VALUE PROGRESSION ═══', startAt: 50, endAt: 58, rate: 5 },
  { key: 'DAY7', tone: 'day7', header: '═══ DAY7 CLEAR ═══', startAt: 58, endAt: 62, rate: 2.5 },
  { key: 'RACE_END', tone: 'end', header: '═══ RACE TURN COMPLETE ═══', startAt: 62, endAt: 62.2, rate: 0 },
  { key: 'LIST', tone: 'list', header: '═══ P2P MARKETPLACE — SELL ORDERS ═══', startAt: 66, endAt: 72, rate: 6 },
  { key: 'BID', tone: 'bid', header: '═══ P2P MARKETPLACE — BUY ORDERS ═══', startAt: 72, endAt: 78, rate: 6 },
  { key: 'MATCH', tone: 'match', header: '═══ P2P MATCHING ═══', startAt: 78, endAt: 85, rate: 6 },
  { key: 'MINT', tone: 'mint', header: '═══ DAY0 NEW HORSES ═══', startAt: 85, endAt: 90, rate: 5 },
  { key: 'MLM', tone: 'mlm', header: '═══ SUPPORT BONUS ═══', startAt: 90, endAt: 93.5, rate: 6 },
  { key: 'ITEM', tone: 'item', header: '═══ REVENGE BUFF DROPS ═══', startAt: 93.5, endAt: 96.5, rate: 6 },
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
  /** 行に含まれる馬名(自分該当ハイライトの判定に使う)。 */
  name?: string;
  /** 自分の該当行(myNames にヒット)。 */
  mine?: boolean;
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
      const name = horseName(i, 1);
      return { id, tone: 'burn', name, text: `${tag('BURN')}${horseId(i, 1)}  ${pad(name, NAME_W)}  DAY ${day}  ELIMINATED` };
    }
    case 'SURVIVE': {
      const day = dayOf(i, 2, 0, 5);
      const name = horseName(i, 2);
      return { id, tone: 'survive', name, text: `${tag('SRVD')}${horseId(i, 2)}  ${pad(name, NAME_W)}  DAY ${day} → DAY ${day + 1}` };
    }
    case 'VALUE': {
      const day = dayOf(i, 3);
      const name = horseName(i, 3);
      return { id, tone: 'value', name, text: `${tag('VAL')}${pad(name, NAME_W)}  DAY ${day}  ${priceOfDay(day)} USDT  ▲` };
    }
    case 'DAY7':
    {
      const name = horseName(i, 4);
      return { id, tone: 'day7', name, text: `${tag('DAY7')}${pad(name, NAME_W)}  CLEARED — CHAMPION REWARD 200.00` };
    }
    case 'LIST': {
      const day = dayOf(i, 5);
      const name = horseName(i, 5);
      return { id, tone: 'list', name, text: `${tag('LIST')}${pad(name, NAME_W)}  ASK  ${priceOfDay(day)} USDT` };
    }
    case 'BID': {
      const day = dayOf(i, 6);
      return { id, tone: 'bid', text: `${tag('BID')}${pad(userId(i, 6), NAME_W)}  BUY  ${priceOfDay(day)} USDT` };
    }
    case 'MATCH': {
      const day = dayOf(i, 7);
      const name = horseName(i, 7);
      return { id, tone: 'match', name, text: `${tag('MATCH')}${pad(name, NAME_W)}  ${priceOfDay(day)} USDT → ${userId(i, 7)}` };
    }
    case 'MINT':
    {
      const name = horseName(i, 8);
      return { id, tone: 'mint', name, text: `${tag('MINT')}${pad(name, NAME_W)}  DAY0 → ${userId(i, 8)}` };
    }
    case 'MLM': {
      // サポートボーナス(Decision 092): チャンピオン誕生のお祝い金 T1=3 / T2=2 / T3-7=1 USDT
      const tiers = ['3.00', '2.00', '1.00', '1.00', '1.00', '1.00', '1.00'] as const;
      const t = 1 + (mix(i, 41) % 7);
      return { id, tone: 'mlm', text: `${tag('CELEB')}T${t}  +${tiers[t - 1]!} USDT → ${userId(i, 9)}` };
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

/** セクションごとの「実件数」上限(2026-07-14: 案①の結線漏れ修正 —
 *  行はダミー生成のままだが、流れる行数は当夜の実数を超えない)。 */
function sectionCap(key: string, c: DerbyCounts): number {
  switch (key) {
    case 'BURN': return c.burns;
    case 'SURVIVE': return Math.max(0, c.horses - c.burns);
    case 'VALUE': return Math.max(0, c.horses - c.burns);
    case 'DAY7': return c.day7;
    case 'LIST': return c.listed;
    case 'BID': return c.listed;
    case 'MATCH': return c.assignments;
    case 'MINT': return c.mints;
    case 'MLM': return c.celebrations;
    case 'ITEM': return c.buffs;
    default: return Number.POSITIVE_INFINITY; // RACE_END等のヘッダー行のみ
  }
}

/**
 * elapsed 時点で画面に出ているべきログの「末尾 window 行」を返す。
 * 全行は生成せず、必要な index だけ導出する(高速)。
 * counts を渡すと各セクションの行数が当夜の実件数でキャップされる
 * (件数0のセクションはヘッダー+「NO EVENTS」1行 — 静かな夜は静かに見せる)。
 */
export function logWindow(
  elapsed: number,
  window = 44,
  myNames?: ReadonlySet<string>,
  counts?: DerbyCounts,
): LogLine[] {
  const out: LogLine[] = [];
  for (let sIdx = LOG_SECTIONS.length - 1; sIdx >= 0 && out.length < window; sIdx--) {
    const sec = LOG_SECTIONS[sIdx]!;
    if (elapsed < sec.startAt) continue;
    const cap = counts ? sectionCap(sec.key, counts) : Number.POSITIVE_INFINITY;
    const emitted = Math.min(
      Math.floor((Math.min(elapsed, sec.endAt) - sec.startAt) * sec.rate),
      cap,
    );
    if (counts && cap === 0 && sec.rate > 0 && out.length < window) {
      out.push({ id: `${sec.key}:none`, tone: 'header', text: '        ─ NO EVENTS ─' });
    }
    for (let i = emitted - 1; i >= 0 && out.length < window; i--) {
      const line = makeLine(sec, i);
      if (myNames && line.name && myNames.has(line.name)) line.mine = true;
      out.push(line);
    }
    if (out.length < window) {
      out.push({ id: `${sec.key}:header`, tone: 'header', text: sec.header });
    }
  }
  return out.reverse();
}

/**
 * プレビュー用: ショーの途中で必ず流れる「自分の馬」の名前(各セクションの
 * 固定インデックスから逆引き)。実結線時はAPIの実保有馬名に差し替える。
 */
export function fixtureMyHorseNames(): string[] {
  // インデックスは各セクションの流量×尺の範囲内(正典レート化で再調整済み)
  return [
    makeLine(LOG_SECTIONS.find((s) => s.key === 'BURN')!, 12).name!,
    makeLine(LOG_SECTIONS.find((s) => s.key === 'SURVIVE')!, 14).name!,
    makeLine(LOG_SECTIONS.find((s) => s.key === 'DAY7')!, 3).name!,
    makeLine(LOG_SECTIONS.find((s) => s.key === 'MATCH')!, 9).name!,
  ];
}

/* ---- 個人結果 = その夜の全結果(オーナー指示 2026-07-11: 代表1件を廃止し、
        審判で1頭ずつ流れた結果をショーの最後に全件サマリーで出す。
        /api/v1/daily-derby/my-results/:date と同じ形 — 下の記録にも残り続ける)。 */

export interface DerbyNightResults {
  burned: { name: string; dna_hash: string; day: number | null; used_item_key: string | null; drop_item_key: string | null }[];
  survived: { name: string; dna_hash: string; from_day: number; to_day: number; day7: boolean }[];
  sold: { name: string; dna_hash: string; price: string; day: number | null; counterpart: string }[];
  bought: { name: string; dna_hash: string; price: string; day: number | null; is_mint: boolean; counterpart: string | null }[];
  /** V2実装-7c: このレースで精算された自分のプール(YOUR NEW STABLE幕)。 */
  pool?: PoolActView | null;
}

/** V2(Decision 103): プール購入の披露幕データ(derby status my_events.pool)。 */
export interface PoolActView {
  amount: string;
  horses: number;
  spent: string;
}

/** V2(Decision 106/108): ジャックポット幕データ(derby status jackpot)。 */
export interface DerbyJackpotView {
  status: string;
  prize_amount: string | null;
  total_tickets: number | null;
  winners: { name: string; amount: string | null }[];
}

/* ---- フィクスチャ(プレビュー/モック結線用。実結線時にAPI値へ差替) ------- */

export const FIXTURE_COUNTS: DerbyCounts = {
  horses: 28122,
  burns: 1874,
  buffs: 1874,
  listed: 26248,
  assignments: 24310,
  mints: 1938,
  day7: 812,
  celebrations: 3660,
};

/** ライブ結線でAPIのcountsが未着のときの空値(フィクスチャを本番に出さない)。 */
export const EMPTY_COUNTS: DerbyCounts = {
  horses: 0, burns: 0, buffs: 0, listed: 0, assignments: 0, mints: 0, day7: 0, celebrations: 0,
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

/* ---- レース条件(Decision 082)+ 審判演出のための自分の馬(DERBY_DRAMA) ---- */

export interface DerbyConditionsView {
  weather: string;
  track: string;
  surface: string;
  weather_ja: string;
  track_ja: string;
  surface_ja: string;
  night_name: string | null;
}

export interface MyDerbyHorse {
  name: string;
  dnaHash?: string;
  currentDay?: number;
  /** 次のレースに向けて調教済みか(待機パドックのリマインド用・不明はundefined) */
  trainedForNextRace?: boolean | undefined;
}

export function conditionsView(c: {
  weather: string; track: string; surface: string; night_name?: string | null;
}): DerbyConditionsView {
  const rc = c as unknown as RaceConditions;
  return {
    weather: c.weather,
    track: c.track,
    surface: c.surface,
    weather_ja: WEATHER_JA[rc.weather] ?? c.weather,
    track_ja: TRACK_JA[rc.track] ?? c.track,
    surface_ja: SURFACE_JA[rc.surface] ?? c.surface,
    night_name: c.night_name !== undefined ? c.night_name : raceNightNameV2(rc),
  };
}

/** プレビュー用: 「明日の予報」(ADR-012・ショー最終幕)。実結線はAPIのtomorrow_forecast。 */
export function fixtureForecast(dateISO: string): DerbyConditionsView {
  return fixtureConditions(`fc:${dateISO}`);
}

/** プレビュー用: 日付から決定論的に条件を作る(毎晩変わる)。 */
export function fixtureConditions(dateISO: string): DerbyConditionsView {
  let h = 2166136261;
  for (let i = 0; i < dateISO.length; i++) {
    h ^= dateISO.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (n: number) => (((h >>> (n * 7)) & 1023) % 1000) / 1000;
  const pick = <T,>(uu: number, table: [T, number][]): T => {
    let cum = 0;
    for (const [v, p] of table) {
      cum += p;
      if (uu < cum) return v;
    }
    return table[table.length - 1]![0];
  };
  const weather = pick(u(0), [['SUNNY', 0.4], ['CLOUDY', 0.3], ['RAIN', 0.2], ['STORM', 0.1]]);
  const track = pick(u(1), [['GOOD', 0.4], ['FAST', 0.25], ['SOFT', 0.25], ['HEAVY', 0.1]]);
  const surface = pick(u(2), [['TURF', 0.6], ['DIRT', 0.4]]);
  return conditionsView({ weather, track, surface });
}

/** プレビュー用: 審判演出つきの自分の馬(dna・Day込み)。 */
export function fixtureMyHorses(): MyDerbyHorse[] {
  const names = fixtureMyHorseNames();
  const days = [4, 3, 6, 2];
  const seeds = ['a1', '7e', 'f2', '4c'];
  return names.map((name, i) => ({
    name,
    dnaHash: dna(seeds[i % seeds.length]!),
    currentDay: days[i % days.length]!,
  }));
}

/** プレビュー用ダミー dna_hash(NftHorseArt のルック導出に使う)。 */
const dna = (seed: string): string => `0x${seed.repeat(32).slice(0, 64)}`;

/** プレビュー用: ショー最後の全結果サマリー(fixtureMyHorses と同じ4頭+新規発行1頭)。 */
export function fixtureNightResults(): DerbyNightResults {
  const [burnH, svH, day7H, matchH] = fixtureMyHorses();
  return {
    pool: { amount: '1000.00000000', horses: 8, spent: '923.80000000' },
    burned: [
      { name: burnH!.name, dna_hash: burnH!.dnaHash!, day: burnH!.currentDay!, used_item_key: 'rain_hood', drop_item_key: 'spirit_roar' },
    ],
    survived: [
      { name: day7H!.name, dna_hash: day7H!.dnaHash!, from_day: 6, to_day: 7, day7: true },
      { name: svH!.name, dna_hash: svH!.dnaHash!, from_day: svH!.currentDay!, to_day: svH!.currentDay! + 1, day7: false },
    ],
    sold: [
      { name: matchH!.name, dna_hash: matchH!.dnaHash!, price: '133.10', day: matchH!.currentDay!, counterpart: 'k*****i@gmail.com' },
    ],
    bought: [
      { name: 'Golden Storm', dna_hash: dna('4c'), price: '100.00', day: 0, is_mint: true, counterpart: null },
    ],
  };
}


/** ジャックポット幕のフィクスチャ(/dev/derby-preview)。 */
export function fixtureJackpot(): DerbyJackpotView {
  return {
    status: 'PAID',
    prize_amount: '100.00000000',
    total_tickets: 342,
    winners: [{ name: 'ta***', amount: '100.00000000' }],
  };
}
