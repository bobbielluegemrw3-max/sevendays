'use client';

import { BAND_LABEL, BAND_ORDER, effectShortJa, type CatalogItem } from '@/lib/items';
import s from '../app/items.module.css';

/* ============================================================================
 * ItemCardPicker — 馬詳細ページのアイテム選択(カード式・2026-07-19 オーナー決定)。
 * プルダウンでは「どれが調教/レース/形見か」が初心者に伝わらないため、
 * サムネイル+分類チップ+効果+価格のミニカードを横スクロールで並べる。
 *  - 分類チップ: 調教=シアン / レース=マゼンタ / 形見(BURNドロップ)=金
 *  - 並びは価格帯順(ベーシック→スタンダード→プレミアム→形見)
 *  - タップで選択、もう一度タップで解除。`allowNone` で先頭に「なし」カード
 * ※items系はi18n宿題に合流(日本語直書き — ItemPrepPanelV3と同方針)
 * ========================================================================== */

export function ItemCardPicker({
  items,
  ownedByKey,
  selected,
  onSelect,
  allowNone = false,
  noneLabel = 'なし',
  ariaLabel,
}: {
  items: CatalogItem[];
  ownedByKey: Map<string, number>;
  selected: string;
  onSelect: (key: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
  ariaLabel: string;
}) {
  const sorted = BAND_ORDER.flatMap((band) => items.filter((c) => c.band === band));
  return (
    <div className={s.pickRow} role="listbox" aria-label={ariaLabel}>
      {allowNone ? (
        <button
          type="button"
          role="option"
          aria-selected={selected === ''}
          className={`${s.pickCard} ${s.pickNone} ${selected === '' ? s.pickCardOn : ''}`}
          onClick={() => onSelect('')}
        >
          <span className={s.pickNoneMark}>—</span>
          <span className={s.pickName}>{noneLabel}</span>
        </button>
      ) : null}
      {sorted.map((c) => {
        const owned = ownedByKey.get(c.key) ?? 0;
        const isDrop = c.band === 'BURN_DROP';
        const on = selected === c.key;
        const cls = isDrop
          ? { label: '形見', chip: s.pickClsDrop }
          : c.item_class === 'TRAINING'
            ? { label: '調教', chip: s.pickClsTrain }
            : { label: 'レース', chip: s.pickClsRace };
        return (
          <button
            key={c.key}
            type="button"
            role="option"
            aria-selected={on}
            className={`${s.pickCard} ${isDrop ? s.pickCardDrop : ''} ${on ? s.pickCardOn : ''}`}
            onClick={() => onSelect(on ? '' : c.key)}
          >
            <span className={`${s.pickCls} ${cls.chip}`}>{cls.label}</span>
            <img className={s.pickThumb} src={`/items/${c.key}.webp`} alt="" width={46} height={46} loading="lazy" />
            <span className={s.pickName}>{c.name_ja}</span>
            <span className={s.pickFx}>{c.effect ? effectShortJa(c.effect) : c.description_ja}</span>
            <span className={s.pickPrice}>{owned > 0 ? `所持 ${owned}` : `${c.price} USDT`}</span>
            <span className={s.pickBand}>{BAND_LABEL[c.band]}</span>
          </button>
        );
      })}
    </div>
  );
}
