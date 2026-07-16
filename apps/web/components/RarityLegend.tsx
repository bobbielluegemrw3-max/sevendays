import { RARITY_MODIFIER_V1, RARITY_PROBABILITY_V1 } from '@sevendays/domain';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/rarity-legend.module.css';

/**
 * レアリティの軽い説明(オーナー要望 2026-07-11)。
 * 数値は domain の実定数(出現率・スコア加点)から生成 — 架空値なし。
 * チップは等幅グリッドで全幅に分配(左寄りの折返しで空白が残らないように)。
 */

const ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;

const pctText = (p: string): string => `${Math.round(Number(p) * 100)}%`;

/** 文言はサーバー親から t で注入する。t 未指定(未翻訳ページ)は内蔵の日本語に
 *  フォールバック — このコンポーネントはクライアント配下(MarketPlaceView)でも
 *  描画されるため、辞書(APP_COPY)をここで import してはならない(2026-07-16 に
 *  jaのstable辞書セクションがまるごとチャンクに漏れた実績あり)。 */
const FALLBACK_JA = {
  legend_title: 'レアリティ',
  legend_note: '加点は毎晩のレーススコアに常時反映(公開ルール)',
  legend_chip_tpl: '{pct} · スコア+{n}',
} as const;

export function RarityLegend({ t }: { t?: Pick<AppDict['stable'], 'legend_title' | 'legend_note' | 'legend_chip_tpl'> } = {}) {
  const tt = t ?? FALLBACK_JA;
  return (
    <div className={s.legend}>
      <div className={s.head}>
        <span className={s.title}>{tt.legend_title}</span>
        <span className={s.note}>{tt.legend_note}</span>
      </div>
      <div className={s.chips}>
        {ORDER.map((r) => (
          <span key={r} className={`${s.chip} ${s[`c${r}`]}`}>
            {r}
            <small>{fill(tt.legend_chip_tpl, { pct: pctText(RARITY_PROBABILITY_V1[r]), n: RARITY_MODIFIER_V1[r] })}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
