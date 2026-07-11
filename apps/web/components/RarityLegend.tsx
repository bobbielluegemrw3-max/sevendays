import { RARITY_MODIFIER_V1, RARITY_PROBABILITY_V1 } from '@sevendays/domain';
import s from '../app/rarity-legend.module.css';

/**
 * レアリティの軽い説明(オーナー要望 2026-07-11)。
 * 数値は domain の実定数(出現率・スコア加点)から生成 — 架空値なし。
 * 厩舎・馬詳細・マーケットに1行で置ける控えめな凡例。
 */

const ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;

const pctText = (p: string): string => `${Math.round(Number(p) * 100)}%`;

export function RarityLegend() {
  return (
    <div className={s.legend}>
      <span className={s.head}>レアリティ</span>
      {ORDER.map((r) => (
        <span key={r} className={`${s.chip} ${s[`c${r}`]}`}>
          {r}
          <small>
            {pctText(RARITY_PROBABILITY_V1[r])} · スコア+{RARITY_MODIFIER_V1[r]}
          </small>
        </span>
      ))}
      <span className={s.note}>加点は毎晩のレーススコアに常時反映(公開ルール)</span>
    </div>
  );
}
