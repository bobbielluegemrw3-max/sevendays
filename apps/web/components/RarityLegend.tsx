import { RARITY_MODIFIER_V1, RARITY_PROBABILITY_V1 } from '@sevendays/domain';
import s from '../app/rarity-legend.module.css';

/**
 * レアリティの軽い説明(オーナー要望 2026-07-11)。
 * 数値は domain の実定数(出現率・スコア加点)から生成 — 架空値なし。
 * チップは等幅グリッドで全幅に分配(左寄りの折返しで空白が残らないように)。
 */

const ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;

const pctText = (p: string): string => `${Math.round(Number(p) * 100)}%`;

export function RarityLegend() {
  return (
    <div className={s.legend}>
      <div className={s.head}>
        <span className={s.title}>レアリティ</span>
        <span className={s.note}>加点は毎晩のレーススコアに常時反映(公開ルール)</span>
      </div>
      <div className={s.chips}>
        {ORDER.map((r) => (
          <span key={r} className={`${s.chip} ${s[`c${r}`]}`}>
            {r}
            <small>
              {pctText(RARITY_PROBABILITY_V1[r])} · スコア+{RARITY_MODIFIER_V1[r]}
            </small>
          </span>
        ))}
      </div>
    </div>
  );
}
