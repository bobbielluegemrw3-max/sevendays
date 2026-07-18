import type { CSSProperties } from 'react';

/**
 * 総合値ティアカラー(オーナー承認 2026-07-18)。
 * レアリティ廃止後の「馬の強さがひと目で分かる」5帯。色はサイト既存パレット由来:
 * 金=チャンピオン金・シアン=ブランド色。赤はBURN専用のため価値表示には使わない。
 * 帯: 90+ GOLD / 80+ SILVER / 70+ BRONZE / 55+ STEEL / それ未満 IRON。
 * クライアント/サーバー両用の純関数のみ(hooksなし)。
 */

export type TvTierKey = 'GOLD' | 'SILVER' | 'BRONZE' | 'STEEL' | 'IRON';

export interface TvTierDef {
  key: TvTierKey;
  label: string;
  /** 本体色(数字・チップ枠)。 */
  color: string;
  /** グロー(text-shadow / box-shadow 用の透過色)。 */
  glow: string;
  /** カード枠線の透過色。 */
  border: string;
  /** カードの発光(GOLD/SILVERのみ強め・下位は控えめ)。 */
  frameShadow: string;
}

const TIERS: readonly (TvTierDef & { min: number })[] = [
  {
    min: 90, key: 'GOLD', label: 'GOLD',
    color: '#ffd97a', glow: 'rgba(255,217,122,0.6)', border: 'rgba(255,217,122,0.55)',
    frameShadow: '0 0 20px rgba(255,217,122,0.18), inset 0 0 26px rgba(255,217,122,0.06)',
  },
  {
    min: 80, key: 'SILVER', label: 'SILVER',
    color: '#d4e0f4', glow: 'rgba(212,224,244,0.5)', border: 'rgba(212,224,244,0.45)',
    frameShadow: '0 0 14px rgba(212,224,244,0.12)',
  },
  {
    min: 70, key: 'BRONZE', label: 'BRONZE',
    color: '#d8a05a', glow: 'rgba(216,160,90,0.45)', border: 'rgba(216,160,90,0.4)',
    frameShadow: '0 0 10px rgba(216,160,90,0.10)',
  },
  {
    min: 55, key: 'STEEL', label: 'STEEL',
    color: '#00eaff', glow: 'rgba(0,234,255,0.4)', border: 'rgba(0,234,255,0.3)',
    frameShadow: 'none',
  },
  {
    min: -Infinity, key: 'IRON', label: 'IRON',
    color: '#97a0b8', glow: 'rgba(151,160,184,0.35)', border: 'rgba(151,160,184,0.28)',
    frameShadow: 'none',
  },
];

export function tvTier(value: number): TvTierDef {
  return TIERS.find((t) => value >= t.min)!;
}

/** 数字そのものに(色+グロー)。 */
export function tvNumStyle(value: number): CSSProperties {
  const t = tvTier(value);
  return { color: t.color, textShadow: `0 0 12px ${t.glow}` };
}

/** チップ(枠つきピル)に。 */
export function tvChipStyle(value: number): CSSProperties {
  const t = tvTier(value);
  return { color: t.color, borderColor: t.border };
}

/** カード枠に(枠線+発光。STEEL/IRONは枠色のみで発光なし=グリッドが眩しくならない)。 */
export function tvFrameStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined) return undefined;
  const t = tvTier(value);
  const style: CSSProperties = { borderColor: t.border };
  if (t.frameShadow !== 'none') style.boxShadow = t.frameShadow;
  return style;
}

/**
 * カードのグロー(box-shadowのみ)。枠線色は触らない — 厩舎カードの枠線は
 * 「未調教=マゼンタ」等の機能色を担っているため、ティアは発光でだけ語る。
 */
export function tvCardGlowStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined) return undefined;
  const t = tvTier(value);
  if (t.frameShadow === 'none') return undefined;
  return { boxShadow: t.frameShadow };
}

/** 馬アートの内側リムライト(ヒーロー表示用・控えめ)。 */
export function tvArtGlowStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined) return undefined;
  const t = tvTier(value);
  if (t.key === 'STEEL' || t.key === 'IRON') return undefined;
  return { boxShadow: `inset 0 0 30px ${t.glow.replace(/0\.\d+\)/, '0.14)')}` };
}
