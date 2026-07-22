import type { CSSProperties } from 'react';

/**
 * 総合値ティアカラー(オーナー承認 2026-07-18 / プレミアム化 2026-07-18b)。
 * レアリティ廃止後の「馬の強さがひと目で分かる」5帯。V2で総合値(0〜100)は
 * 馬の強さを表す唯一の数値 = ゲームのワクワクの源泉。数字を「打刻された金属
 * メダリオン」として主役化する。色はサイト既存パレット由来:
 *   金=チャンピオン金 / 銀 / 銅 / 鋼=ブランドシアン / 鉄=灰。
 *   赤はBURN(消滅)専用のため価値表示には絶対に使わない。
 * 帯: 90+ GOLD / 80+ SILVER / 70+ BRONZE / 55+ STEEL / それ未満 IRON。
 * クライアント/サーバー両用の純関数のみ(hooksなし・DOM非依存)。
 *
 * プレミアム化の要点(新規ライブラリ・外部フォント・画像なし。CSS Modules+
 * インラインstyleだけで完結):
 *  - tvNumStyle: 数字そのものを金属グラデ(background-clip:text)+層状グロー。
 *    tabular-nums 前提。GOLDは強い鏡面ハイライトで「宝物」に見せる。
 *    非対応環境は WebkitTextFillColor が効かず color(単色)にフォールバック。
 *  - tvChipStyle: チップを「メダリオン台座」に(帯色の枠 + 台座グラデ +
 *    内側ハイライト + GOLD/SILVERのみ外側グロー)。枠線"色"は帯を表すが、
 *    カード枠(未調教=マゼンタ等の機能色)には触れない — カードはtvCardGlowで発光のみ。
 *  - tvMedalStyle: 結果一覧/馬詳細ヒーローの「大きい数字」用の強化版(より強い
 *    グロー + ドロップシャドウ)。数値整形(小数1桁)は呼び出し側で .toFixed(1)。
 */

export type TvTierKey = 'GOLD' | 'SILVER' | 'BRONZE' | 'STEEL' | 'IRON';

export interface TvTierDef {
  key: TvTierKey;
  label: string;
  /** 本体色(単色フォールバック・チップ文字色)。 */
  color: string;
  /** 数字用の金属グラデ(background-clip:text)。 */
  numGradient: string;
  /** グロー(text-shadow / box-shadow 用の透過色)。 */
  glow: string;
  /** グローを連続的に強弱させるための素の RGB("r,g,b")。 */
  rgb: string;
  /** カード枠線の透過色。 */
  border: string;
  /** メダリオン台座の帯ティント(上端)。 */
  tint: string;
  /** メダリオンチップの box-shadow(内側ハイライト + 上位帯は外側グロー)。 */
  chipShadow: string;
  /** カードの発光(GOLD/SILVERのみ強め・下位は none)。 */
  frameShadow: string;
}

const TIERS: readonly (TvTierDef & { min: number })[] = [
  {
    min: 90, key: 'GOLD', label: 'GOLD',
    color: '#ffd97a',
    numGradient: 'linear-gradient(135deg,#fff4cf 0%,#ffe9a8 20%,#ffd97a 44%,#d9a441 58%,#ffe490 76%,#fff6dc 100%)',
    rgb: '255,217,122',
    glow: 'rgba(255,217,122,0.65)', border: 'rgba(255,217,122,0.6)',
    tint: 'rgba(255,217,122,0.18)',
    chipShadow: '0 0 16px rgba(255,217,122,0.28), inset 0 1px 0 rgba(255,255,255,0.42), inset 0 0 14px rgba(255,217,122,0.14)',
    frameShadow: '0 0 30px rgba(255,217,122,0.45), 0 0 0 1px rgba(255,217,122,0.5), inset 0 0 34px rgba(255,217,122,0.13)',
  },
  {
    min: 80, key: 'SILVER', label: 'SILVER',
    color: '#d4e0f4',
    numGradient: 'linear-gradient(135deg,#ffffff 0%,#e8f0ff 28%,#bccdea 52%,#f2f7ff 72%,#d4e0f4 100%)',
    rgb: '212,224,244',
    glow: 'rgba(212,224,244,0.5)', border: 'rgba(212,224,244,0.5)',
    tint: 'rgba(212,224,244,0.15)',
    chipShadow: '0 0 13px rgba(212,224,244,0.18), inset 0 1px 0 rgba(255,255,255,0.34)',
    frameShadow: '0 0 20px rgba(212,224,244,0.3), inset 0 0 20px rgba(212,224,244,0.07)',
  },
  {
    min: 70, key: 'BRONZE', label: 'BRONZE',
    color: '#d8a05a',
    numGradient: 'linear-gradient(135deg,#ffdca8 0%,#e6a860 38%,#bd7d38 58%,#f0c088 100%)',
    rgb: '216,160,90',
    glow: 'rgba(216,160,90,0.48)', border: 'rgba(216,160,90,0.42)',
    tint: 'rgba(216,160,90,0.14)',
    chipShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
    frameShadow: '0 0 14px rgba(216,160,90,0.24)',
  },
  {
    min: 55, key: 'STEEL', label: 'STEEL',
    color: '#00eaff',
    numGradient: 'linear-gradient(135deg,#d3fbff 0%,#5ff5ff 38%,#00eaff 68%,#7ff8ff 100%)',
    rgb: '0,234,255',
    glow: 'rgba(0,234,255,0.45)', border: 'rgba(0,234,255,0.34)',
    tint: 'rgba(0,234,255,0.12)',
    chipShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
    frameShadow: 'none',
  },
  {
    min: -Infinity, key: 'IRON', label: 'IRON',
    color: '#8c8fa0',
    // 2026-07-22: 旧 #cbd3e4→#9aa3ba(淡い青灰)は STEEL のシアンと隣り合うと
    // 見分けがつかなかった。名前どおり「鈍い鉄」の無彩色へ落とす
    numGradient: 'linear-gradient(135deg,#a9adba 0%,#7c8090 52%,#969aa8 100%)',
    rgb: '140,143,160',
    glow: 'rgba(140,143,160,0.3)', border: 'rgba(140,143,160,0.28)',
    tint: 'rgba(140,143,160,0.08)',
    chipShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
    frameShadow: 'none',
  },
];

export function tvTier(value: number): TvTierDef {
  // 2026-07-19 本番障害の教訓: NaN/undefinedが渡ると find が undefined を返し、
  // .color 参照で全ページのレンダーが死ぬ。表示ヘルパーは絶対に落ちない —
  // 不正値は最下帯(IRON)として描画する。
  if (!Number.isFinite(value)) return TIERS[TIERS.length - 1]!;
  return TIERS.find((t) => value >= t.min)!;
}

/** 数字そのものに打刻金属の質感(グラデ + グロー)。tabular-nums 込み。 */
export function tvNumStyle(value: number): CSSProperties {
  const t = tvTier(value);
  return {
    backgroundImage: t.numGradient,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: t.color, // 非対応環境のフォールバック
    WebkitTextFillColor: 'transparent',
    textShadow: `0 0 10px ${t.glow}`,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.01em',
  };
}

/**
 * 結果一覧 / 馬詳細ヒーローの「大きい数字」専用。tvNumStyle をベースに
 * グローを一段強め、ドロップシャドウで台座から浮かせる。90点台は宝物級に。
 */
export function tvMedalStyle(value: number): CSSProperties {
  const t = tvTier(value);
  const strong = t.key === 'GOLD' || t.key === 'SILVER';
  return {
    ...tvNumStyle(value),
    textShadow: `0 0 16px ${t.glow}, 0 0 2px ${t.glow}`,
    filter: strong ? `drop-shadow(0 2px 6px ${t.glow})` : `drop-shadow(0 1px 3px ${t.glow})`,
    fontWeight: 900,
  };
}

/** チップ(メダリオン台座つきピル)に。文字色 + 帯枠 + 台座グラデ + 内外グロー。 */
export function tvChipStyle(value: number): CSSProperties {
  const t = tvTier(value);
  return {
    color: t.color,
    borderColor: t.border,
    backgroundImage: `linear-gradient(180deg, ${t.tint}, rgba(10,8,19,0.72))`,
    boxShadow: t.chipShadow,
  };
}

/** カード枠に(枠線+発光。STEEL/IRONは枠色のみで発光なし=グリッドが眩しくならない)。 */
export function tvFrameStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined) return undefined;
  const t = tvTier(value);
  const style: CSSProperties = { borderColor: t.border };
  if (t.frameShadow !== 'none') style.boxShadow = t.frameShadow;
  return style;
}

/* ---------------------------------------------------------------------------
 * 連続マッピング(2026-07-22・オーナー実機で2度「違いが分からない」)。
 *
 * 原因は強度ではなく **階段** だった。実プレイの厩舎は 50〜76 に固まる
 * (ミント 40〜75・domain/v2.ts)。この帯は BRONZE/STEEL/IRON の下位3ティアに
 * 全部入るので、光るカード(GOLD/SILVER)が1枚も無く、しかも 53.3 と 50.2 は
 * 同じ IRON = 完全に同じ見た目になっていた。
 *
 * ティアの意味(色・ラベル・GOLD 90+ の特別さ)は保ったまま、
 * **見た目の強弱だけを総合値の連続関数**にする。これで隣り合う馬が必ず違う。
 * 基準域は実分布に合わせて 45〜85。
 * ------------------------------------------------------------------------- */
const MOOD_LO = 45;
const MOOD_HI = 85;
function moodT(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, (value - MOOD_LO) / (MOOD_HI - MOOD_LO)));
}

/**
 * カードのグロー(box-shadowのみ)。枠線色は触らない — 厩舎カードの枠線は
 * 「未調教=マゼンタ」等の機能色を担っているため、ティアは発光でだけ語る。
 * 強さは連続。58 あたりから灯りはじめ、85 で最大になる。
 */
export function tvCardGlowStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  const t = tvTier(value);
  // 灯りはじめ(58)〜最大(85)。下位帯は完全に無灯 = 「暗い厩舎」が成立する
  const g = Math.max(0, Math.min(1, (value - 58) / (85 - 58)));
  if (g <= 0.02) return undefined;
  const blur = 10 + 26 * g;
  const alpha = (0.08 + 0.46 * g).toFixed(3);
  const ring = (0.05 + 0.45 * g).toFixed(3);
  return {
    boxShadow: `0 0 ${blur.toFixed(1)}px rgba(${t.rgb},${alpha}), 0 0 0 1px rgba(${t.rgb},${ring}), inset 0 0 ${(blur * 1.2).toFixed(1)}px rgba(${t.rgb},${(Number(alpha) * 0.3).toFixed(3)})`,
  };
}

/**
 * カードの気分(STABLE_CARDS_SPEC 2026-07-22)。
 * 強い側を明るくすると厩舎グリッドが眩しくなるので、感情の振れ幅は
 * **暗い側を沈めて**作る。STEEL/IRON だけ わずかに減彩・減光し、
 * 「くすんだ厩舎 = 鍛えなきゃ」を出す。GOLD/SILVER/BRONZE は触らない。
 * 強度は控えめから始める(戻すより足す方が安全)。
 */
export function tvCardMoodStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  // ティアの階段ではなく総合値の連続関数。45=くすみ最大 / 85=最も鮮やか。
  // 50.2 と 53.3 と 55.7 が、隣に並んだときに必ず違って見えることが目的
  const t = moodT(value);
  const sat = (0.32 + 0.86 * t).toFixed(3);   // 45→0.32 / 65→0.75 / 85→1.18
  const bri = (0.76 + 0.31 * t).toFixed(3);   // 45→0.76 / 65→0.92 / 85→1.07
  return { filter: `saturate(${sat}) brightness(${bri})` };
}

/** 馬アートの内側リムライト(ヒーロー表示用・控えめ)。 */
export function tvArtGlowStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined) return undefined;
  const t = tvTier(value);
  if (t.key === 'STEEL' || t.key === 'IRON') return undefined;
  return { boxShadow: `inset 0 0 30px ${t.glow.replace(/0\.\d+\)/, '0.14)')}` };
}
