import type { HorseType } from './enums.js';

/**
 * ============================================================================
 * V2 定数(FUN改修 — Decision 101/102/104)
 * ============================================================================
 * レースエンジンV2「総合値0〜100」の公開ルール。すべての値はDecision Logが正。
 *  - 101: スコア = 総合値 + 条件補正(±4) + 運(±3)。ミント幅40〜75・減衰2.0/レース・
 *         ソフトキャップ85(超過分の上昇は半減)。レアリティ廃止・タイプ存続
 *  - 104: 調教メニュー6種(公開レンジ)・1レースにつき2つまで・隠れた好み
 *         (タイプ相関70%+個体例外30%)・大好物込みコンボにシナジー・確定の瞬間にロール
 * 表示・エンジン・シミュレーションはこの単一の定数を参照する(嘘の数字を見せない原則)。
 */

/** レースエンジンV2のバージョン文字列(race_engine_versionsに登録・リセット時に有効化)。 */
export const RACE_ENGINE_V2_VERSION = 'race_engine_v2.0';

/** 保存済みバージョン文字列でV1/V2経路を分岐する(リプレイはこの判定に従う)。 */
export function isRaceEngineV2(version: string): boolean {
  return version.startsWith('race_engine_v2');
}

export const TOTAL_VALUE_V2 = {
  /** 新規発行馬の総合値(一様分布)。90台は生まれでは出ない — 育成でのみ到達。 */
  mintMin: 40,
  mintMax: 75,
  /** 毎レースの自然減衰(手入れしないと下がる)。RESTで1回無効化できる。 */
  decayPerRace: 2.0,
  /** ソフトキャップ: これを超える上昇は半減(90台を特別に保つ)。 */
  softCap: 85,
  softCapFactor: 0.5,
  min: 0,
  max: 100,
} as const;

/** 条件補正(天候×馬場×コースへの「備え」— タイプ適性+レースアイテム)の器。 */
export const CONDITION_PREP_RANGE_V2 = { min: -4.0, max: 4.0 } as const;

/** 運(Irwin-Hall)。LUCKタイプ+調教済みは従来どおり広がる(Decision 052/101)。 */
export const LUCK_RANGE_V2 = { min: -3.0, max: 3.0 } as const;
export const LUCK_TRAINED_RANGE_V2 = { min: -2.0, max: 4.0 } as const;

/** 調教メニュー(公開レンジ・Decision 104)。RESTは減衰1回無効・好み無関係。 */
export const TRAINING_MENUS_V2 = [
  { key: 'HILL', min: 1.0, max: 5.0 },
  { key: 'POOL', min: 0.0, max: 3.0 },
  { key: 'SPAR', min: -2.0, max: 6.0 },
  { key: 'GATE', min: 0.0, max: 4.0 },
  { key: 'WOOD', min: 1.0, max: 4.0 },
  { key: 'REST', min: 0.0, max: 0.0 },
] as const;
export type TrainingMenuV2 = (typeof TRAINING_MENUS_V2)[number]['key'];
export const TRAINING_MENU_KEYS_V2: readonly TrainingMenuV2[] = TRAINING_MENUS_V2.map((m) => m.key);
export const TRAINING_MENU_BY_KEY_V2: ReadonlyMap<TrainingMenuV2, { key: TrainingMenuV2; min: number; max: number }> =
  new Map(TRAINING_MENUS_V2.map((m) => [m.key, m]));

/** 1レースサイクルの組み合わせ上限(同一メニュー2回も可)。 */
export const TRAINING_COMBO_SIZE_V2 = 2;

/** 隠れた好みの法則(Decision 104): タイプごとの「好まれやすい」メニュー集合。
 *  70%はこの集合から大好物が出る(攻略で学べる)・30%は例外(個体で試すしかない)。
 *  RESTは好みの対象外。 */
export const PREFERENCE_LAW_V2: Readonly<Record<HorseType, readonly TrainingMenuV2[]>> = {
  SPRINTER: ['HILL', 'GATE'],
  POWER: ['HILL', 'SPAR'],
  ENDURANCE: ['WOOD', 'POOL'],
  BALANCED: ['WOOD', 'GATE'],
  LUCK: ['POOL', 'SPAR'],
};
export const PREFERENCE_TYPE_CORRELATION_V2 = 0.7;

/** 大好物を含むコンボの追加シナジー(一様)。 */
export const SYNERGY_BONUS_RANGE_V2 = { min: 1.0, max: 3.0 } as const;
/** 苦手メニューはレンジ下限がさらに下がる(下振れ拡大)。 */
export const DISLIKE_EXTRA_DOWNSIDE_V2 = 2.0;

/** レーススロット(Decision 102): 朝8:00 MYT / 夜20:00 MYT。 */
export const RACE_SLOTS_V2 = ['MORNING', 'NIGHT'] as const;
export type RaceSlotV2 = (typeof RACE_SLOTS_V2)[number];
export const RACE_SLOT_HOUR_UTC_V2: Readonly<Record<RaceSlotV2, number>> = {
  MORNING: 0, // 8:00 MYT = 00:00 UTC
  NIGHT: 12, // 20:00 MYT = 12:00 UTC(現行と同じ)
};

/** スロットの発走時刻(MYT暦日+スロット → UTC instant)。 */
export function raceSlotStartUtcV2(mytDate: string, slot: RaceSlotV2): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mytDate)) {
    throw new TypeError(`Expected YYYY-MM-DD: "${mytDate}"`);
  }
  const hour = String(RACE_SLOT_HOUR_UTC_V2[slot]).padStart(2, '0');
  return new Date(`${mytDate}T${hour}:00:00.000Z`);
}

/** ジャックポット(Decision 106・テストネット仮値。本番値は公開判断時にオーナー決定)。 */
export const JACKPOT_DEFAULTS_V2 = {
  prizeUsdt: '100.00',
  winners: 1,
  /** チケットは週次リセット。 */
  ticketReset: 'WEEKLY',
} as const;
