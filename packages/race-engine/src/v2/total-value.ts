import {
  DISLIKE_EXTRA_DOWNSIDE_V2,
  PREFERENCE_LAW_V2,
  PREFERENCE_TYPE_CORRELATION_V2,
  SYNERGY_BONUS_RANGE_V2,
  TOTAL_VALUE_V2,
  TRAINING_COMBO_SIZE_V2,
  TRAINING_MENU_BY_KEY_V2,
  TRAINING_MENU_KEYS_V2,
  type HorseType,
  type TrainingMenuV2,
} from '@sevendays/domain';
import { round2, uniformInRange, unitFromParts } from '../random.js';

/**
 * ============================================================================
 * エンジンV2 — 総合値の生成と変動(Decision 101/104)
 * ============================================================================
 * すべて純関数・決定論(sha256Parts系のシードから導出)。
 *  - ミント: 総合値40〜75の一様ロール
 *  - 隠れた好み: dna_hashから大好物1つ・苦手1つを決定論生成(タイプ相関70%+例外30%)。
 *    後日 reveal 可能(同じ関数を公開すれば誰でも再計算・検証できる = イカサマ反証可能)
 *  - 調教ロール: メニュー2つまで。公開レンジ内で確定の瞬間にロール。
 *    大好物=上振れ寄り・苦手=下振れ寄り+下限拡大・大好物込みコンボにシナジー
 *  - 変動: 減衰2.0/レース(RESTで1回無効)・ソフトキャップ85(超過分の上昇半減)・0〜100クランプ
 * ============================================================================
 */

const TV = TOTAL_VALUE_V2;

/** 好みの対象になるメニュー(REST除外 — Decision 104)。 */
const PREFERABLE_MENUS: readonly TrainingMenuV2[] = TRAINING_MENU_KEYS_V2.filter((k) => k !== 'REST');

export interface HiddenPreferencesV2 {
  favorite: TrainingMenuV2;
  dislike: TrainingMenuV2;
}

/** ミント時の総合値(40〜75・一様)。シードは mint_seed 系から呼び出し側が渡す。 */
export function mintTotalValueV2(seedParts: readonly string[]): number {
  const u = unitFromParts(...seedParts, 'total-value-v2:mint');
  return round2(uniformInRange(u, TV.mintMin, TV.mintMax));
}

/**
 * 隠れた好みの導出(決定論)。
 * 70%: タイプの法則集合(PREFERENCE_LAW_V2)から大好物が出る — 攻略で学べる。
 * 30%: 法則外(REST以外の全メニューから法則集合を除いた中から) — 個体の例外。
 * 苦手は大好物以外から一様。
 */
export function hiddenPreferencesV2(dnaHash: string, horseType: HorseType): HiddenPreferencesV2 {
  const lawSet = PREFERENCE_LAW_V2[horseType];
  const uLaw = unitFromParts(dnaHash, 'pref-v2', 'law');
  const uFav = unitFromParts(dnaHash, 'pref-v2', 'favorite');
  const followsLaw = uLaw < PREFERENCE_TYPE_CORRELATION_V2;
  const favPool = followsLaw
    ? lawSet
    : PREFERABLE_MENUS.filter((m) => !lawSet.includes(m));
  const favorite = favPool[Math.min(favPool.length - 1, Math.floor(uFav * favPool.length))]!;

  const dislikePool = PREFERABLE_MENUS.filter((m) => m !== favorite);
  const uDis = unitFromParts(dnaHash, 'pref-v2', 'dislike');
  const dislike = dislikePool[Math.min(dislikePool.length - 1, Math.floor(uDis * dislikePool.length))]!;
  return { favorite, dislike };
}

export interface TrainingRollInputV2 {
  dnaHash: string;
  horseType: HorseType;
  /** 選んだメニュー(1〜2個・同一2回可)。 */
  menus: readonly TrainingMenuV2[];
  /** 確定の一意性を担うシード(例: `${horseId}:${batchDate}:${slot}:${confirmNonce}`)。 */
  rollSeed: string;
}

export interface TrainingRollResultV2 {
  perMenu: { menu: TrainingMenuV2; roll: number }[];
  synergy: number;
  /** perMenu合計+シナジー(減衰・キャップ適用前の生デルタ)。 */
  delta: number;
  /** RESTを含む=このレースの減衰を1回無効化。 */
  restsDecay: boolean;
}

/** 調教ロール(確定の瞬間に呼ぶ — プレビューには使わない)。 */
export function resolveTrainingRollV2(input: TrainingRollInputV2): TrainingRollResultV2 {
  if (input.menus.length < 1 || input.menus.length > TRAINING_COMBO_SIZE_V2) {
    throw new Error(`TRAINING_COMBO_INVALID: choose 1..${TRAINING_COMBO_SIZE_V2} menus`);
  }
  const prefs = hiddenPreferencesV2(input.dnaHash, input.horseType);
  const perMenu: { menu: TrainingMenuV2; roll: number }[] = [];
  let restsDecay = false;

  input.menus.forEach((menu, i) => {
    const spec = TRAINING_MENU_BY_KEY_V2.get(menu);
    if (!spec) throw new Error(`TRAINING_MENU_UNKNOWN: ${menu}`);
    if (menu === 'REST') {
      restsDecay = true;
      perMenu.push({ menu, roll: 0 });
      return;
    }
    let u = unitFromParts(input.rollSeed, input.dnaHash, 'train-v2', String(i), menu);
    let min = spec.min;
    const max = spec.max;
    if (menu === prefs.favorite) {
      u = Math.sqrt(u); // 上振れ寄り(分布は上側に歪む・レンジ外には出ない)
    } else if (menu === prefs.dislike) {
      u = u * u; // 下振れ寄り
      min = spec.min - DISLIKE_EXTRA_DOWNSIDE_V2; // 苦手はさらに沈み得る
    }
    perMenu.push({ menu, roll: round2(uniformInRange(u, min, max)) });
  });

  let synergy = 0;
  if (input.menus.includes(prefs.favorite)) {
    const u = unitFromParts(input.rollSeed, input.dnaHash, 'train-v2', 'synergy');
    synergy = round2(uniformInRange(u, SYNERGY_BONUS_RANGE_V2.min, SYNERGY_BONUS_RANGE_V2.max));
  }

  const delta = round2(perMenu.reduce((s, m) => s + m.roll, 0) + synergy);
  return { perMenu, synergy, delta, restsDecay };
}

/** 上昇分にソフトキャップを適用して総合値に加算(下降はそのまま)。0〜100クランプ。 */
export function applyTotalValueGainV2(current: number, gain: number): number {
  let next: number;
  if (gain <= 0) {
    next = current + gain;
  } else if (current >= TV.softCap) {
    next = current + gain * TV.softCapFactor;
  } else {
    const headroom = TV.softCap - current;
    next = gain <= headroom ? current + gain : TV.softCap + (gain - headroom) * TV.softCapFactor;
  }
  return round2(Math.max(TV.min, Math.min(TV.max, next)));
}

/** レース1回ぶんの減衰(RESTで無効化)。 */
export function applyDecayV2(current: number, restsDecay: boolean): number {
  if (restsDecay) return round2(current);
  return round2(Math.max(TV.min, current - TV.decayPerRace));
}
