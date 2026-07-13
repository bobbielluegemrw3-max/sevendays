import type { EconomyStatus, Surface, TrackCondition, Weather } from './enums.js';
import type { RaceConditions } from './items.js';
import { BURN_TARGET_RATE_V1 } from './constants.js';

/**
 * ADR-012: 予報と荒れ相場(Forecast & Volatility)v1 — domain 層。
 *
 * A. 夜間BURN率の揺らぎ:
 *    rate = base(EconomyStatus) + δ(seed),  δ は ±amplitude の一様対称。
 *    対称ゆえ E[rate] = base が厳密に保たれ(平均保存)、夜間独立なら
 *    DAY7到達率 E[Π(1−r_t)] = Π(1−base) も厳密に不変 — 経済(買戻し・
 *    ボーナス・ミントカバレッジ)は数学的に無傷。
 *    範囲の器は 8.0%〜13.5% で固定(ADR-012 §7-1: 広げない・狭めるのみ可)。
 *    amplitude は設定値(既定 ±2.7pt)。基準率が器の端に近い場合は、対称性を
 *    壊さないよう amplitude を自動で縮める(クランプで非対称にはしない)。
 *
 * B. 天気予報(70%): 条件シードから実際の条件と予報を同時に導出する。
 *    予報チャネルの乱数が accuracy 未満なら予報=実際、そうでなければ
 *    「実際以外」から確率比例で再抽選。シードは事前コミットされるため
 *    運営裁量ゼロのまま、的中率は構造的に 70% になる。
 *    (シードを知らない限り予報から実際は確定できない — 70%のヒント。)
 *
 * 導出は全て SHA-256 ベースの決定論(コミット・リビールで事後検証可能)。
 * 同期実装のため軽量 FNV-1a 64bit を2連結した 128bit 混合を使う。
 * 検証仕様として公開する前提の関数群 — 変更はエンジンverの bump を伴うこと。
 */

/** 揺らぎ範囲の「器」(これより広げてはならない・ADR-012)。 */
export const BURN_JITTER_ENVELOPE_V1 = { min: '0.080', max: '0.135' } as const;
/** 既定の揺らぎ振幅(±2.7pt)。policy で狭める方向にのみ変更可。 */
export const BURN_JITTER_AMPLITUDE_DEFAULT_V1 = '0.027';
/** 予報の的中率(ADR-012 §7-2 オーナー確定)。 */
export const FORECAST_ACCURACY_V1 = '0.70';
export const VOLATILITY_POLICY_VERSION_V1 = 'volatility_v1.0';

/** 決定論 0..1(FNV-1a 64bit ×2 チャネル混合)。検証仕様として公開する。 */
export function seedUnit(seedHex: string, channel: string): number {
  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x100000001b3n * 31n + 0x9e3779b97f4a7c15n;
  const src = `${channel}:${seedHex}`;
  for (let i = 0; i < src.length; i++) {
    const c = BigInt(src.charCodeAt(i));
    h1 = ((h1 ^ c) * 0x100000001b3n) & 0xffffffffffffffffn;
    h2 = ((h2 ^ ((c << 1n) | 1n)) * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  const mixed = (h1 ^ (h2 >> 3n) ^ (h2 << 7n)) & 0xffffffffffffffffn;
  return Number(mixed % 1_000_000_007n) / 1_000_000_007;
}

/**
 * BURN枠(公開表示用): 出走頭数から、当夜あり得るBURN数の下限〜上限。
 * 率の「器」[8.0%, 13.5%] と floor則(憲法)だけから導く — 経済ステータスや
 * ポリシーの如何にかかわらず、実際のBURN数は必ずこの範囲に収まる。
 * 少頭数では min=max に潰れ、「今夜のBURN枠 N頭(確定)」と掲示できる。
 */
export function burnSlotRangeV1(entrants: number): { min: number; max: number } {
  const n = Math.max(0, Math.floor(entrants));
  return {
    min: Math.floor(n * Number(BURN_JITTER_ENVELOPE_V1.min)),
    max: Math.floor(n * Number(BURN_JITTER_ENVELOPE_V1.max)),
  };
}

/**
 * 夜間BURN率(小数文字列・4桁)。対称ジッターで平均=基準率を厳守。
 * amplitude は器と基準率から自動縮小されるため常に器の内側に収まる。
 */
export function nightlyBurnRateV2(
  seedHex: string,
  status: EconomyStatus,
  amplitude: string = BURN_JITTER_AMPLITUDE_DEFAULT_V1,
): string {
  const base = Number(BURN_TARGET_RATE_V1[status]);
  const requested = Math.abs(Number(amplitude));
  const cap = Math.min(
    Number(BURN_JITTER_AMPLITUDE_DEFAULT_V1),
    requested,
    Number(BURN_JITTER_ENVELOPE_V1.max) - base,
    base - Number(BURN_JITTER_ENVELOPE_V1.min),
  );
  const u = seedUnit(seedHex, 'burn-jitter-v1');
  const rate = base + (2 * u - 1) * cap;
  return rate.toFixed(4);
}

/* ---- 予報(条件シードから実際+予報を同時導出) --------------------------- */

const WEATHERS: readonly [Weather, number][] = [
  ['SUNNY', 0.4], ['CLOUDY', 0.3], ['RAIN', 0.2], ['STORM', 0.1],
];
const TRACKS: readonly [TrackCondition, number][] = [
  ['FAST', 0.25], ['GOOD', 0.4], ['SOFT', 0.25], ['HEAVY', 0.1],
];
const SURFACES: readonly [Surface, number][] = [
  ['TURF', 0.6], ['DIRT', 0.4],
];

function pick<T>(u: number, table: readonly [T, number][]): T {
  let cum = 0;
  for (const [v, p] of table) {
    cum += p;
    if (u < cum) return v;
  }
  return table[table.length - 1]![0];
}

/** 実際以外から確率比例で再抽選(予報ハズレ側の分布)。 */
function pickOther<T>(u: number, table: readonly [T, number][], actual: T): T {
  const rest = table.filter(([v]) => v !== actual);
  const total = rest.reduce((t, [, p]) => t + p, 0);
  return pick(u * total, rest.map(([v, p]) => [v, p] as [T, number]));
}

export interface NightForecast {
  actual: RaceConditions;
  forecast: RaceConditions;
}

/**
 * 条件シード(前夜にコミット)から、翌夜の実際の条件と予報を同時に導出する。
 * 各軸それぞれ確率 FORECAST_ACCURACY_V1 で予報=実際。
 */
export function deriveNightForecastV1(seedHex: string): NightForecast {
  const acc = Number(FORECAST_ACCURACY_V1);
  const actual: RaceConditions = {
    weather: pick(seedUnit(seedHex, 'cond-weather-v1'), WEATHERS),
    track: pick(seedUnit(seedHex, 'cond-track-v1'), TRACKS),
    surface: pick(seedUnit(seedHex, 'cond-surface-v1'), SURFACES),
  };
  const forecast: RaceConditions = {
    weather: seedUnit(seedHex, 'fc-hit-weather-v1') < acc
      ? actual.weather
      : pickOther(seedUnit(seedHex, 'fc-alt-weather-v1'), WEATHERS, actual.weather),
    track: seedUnit(seedHex, 'fc-hit-track-v1') < acc
      ? actual.track
      : pickOther(seedUnit(seedHex, 'fc-alt-track-v1'), TRACKS, actual.track),
    surface: seedUnit(seedHex, 'fc-hit-surface-v1') < acc
      ? actual.surface
      : pickOther(seedUnit(seedHex, 'fc-alt-surface-v1'), SURFACES, actual.surface),
  };
  return { actual, forecast };
}
