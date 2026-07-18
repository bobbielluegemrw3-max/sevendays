'use client';

import { DAY0_MINT_FEE, ITEM_BY_KEY_V2 } from '@sevendays/domain';
import { deriveNftLook } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import type { DerbyNightResults } from '@/lib/daily-derby';
import { tvMedalStyle } from '@/lib/tv-tier';
import s from '../../app/races.module.css';

/* 表示は実際に動いたお金(2026-07-14 オーナー指摘):
   新規発行=価格100+ミント手数料2=102 / P2P購入=成立額そのまま /
   売却=成立額から手数料2%を引いた受取額。桁は2桁に整形(8桁生表示をやめる)。 */
const money = (v: string | number): string =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MINT_FEE = Number(DAY0_MINT_FEE);
const mintPaid = (price: string): string => money(Number(price) + MINT_FEE);
const soldNet = (price: string): string => money(Number(price) * 0.98);

/* V2: 総合値を行の主役に(ワクワクの源泉 — オーナー指示 2026-07-18)。 */
function TvBig({ tv }: { tv?: string | null | undefined }) {
  if (tv === null || tv === undefined) return null;
  const v = Number(tv);
  return (
    <span style={{ ...tvMedalStyle(v), fontSize: 26, fontWeight: 900, minWidth: 64, textAlign: 'right' }}>
      {v.toFixed(1)}
    </span>
  );
}

/**
 * ある夜の自分の全結果(BURN/生存/DAY7/P2P売買/新規発行)の行リスト。
 * ショー最後のサマリーと /races「あなたのレース記録」で共用 —
 * 「演出の最後に出たものが、そのまま記録に残り続ける」(オーナー指示 2026-07-11)。
 *
 * grouped(2026-07-10 記録の見やすさ改善): true のときだけカテゴリ見出し+件数で
 * まとめて表示する。既定(false)は従来どおりの一続きリスト —
 * ショー最後のサマリーはそのまま(挙動不変)。行の見た目は共通。
 */

function itemName(key: string | null): string | null {
  if (!key) return null;
  return ITEM_BY_KEY_V2.get(key)?.nameJa ?? key;
}

function HorseThumb({ dna, name }: { dna: string; name: string }) {
  return <NftHorseArt look={deriveNftLook(dna, name)} className={s.recArt} size={128} />;
}

export function nightResultsCount(r: DerbyNightResults): number {
  return r.burned.length + r.survived.length + r.sold.length + r.bought.length;
}

function GroupHead({ tone, label, count }: { tone: string | undefined; label: string; count: number }) {
  return (
    <div className={`${s.grpHead} ${tone}`}>
      <span className={s.grpBar} />
      <span className={s.grpName}>{label}</span>
      <span className={s.grpCount}>{count}</span>
    </div>
  );
}

export function NightResultsList({ results, grouped = false }: { results: DerbyNightResults; grouped?: boolean }) {
  const day7 = results.survived.filter((h) => h.day7);
  const survived = results.survived.filter((h) => !h.day7);

  const day7Rows = day7.map((h) => (
    <div key={`d7:${h.name}`} className={`${s.recRow} ${s.recDay7}`}>
      <HorseThumb dna={h.dna_hash} name={h.name} />
      <div className={s.recBody}>
        <div className={s.recName}>{h.name}</div>
        <div className={s.recSub}>LV.7 走破 — CHAMPION</div>
      </div>
      <TvBig tv={h.total_value} />
      <span className={`${s.recBadge} ${s.recBadgeGold}`}>LV.7</span>
    </div>
  ));

  const survivedRows = survived.map((h) => (
    <div key={`sv:${h.name}`} className={s.recRow}>
      <HorseThumb dna={h.dna_hash} name={h.name} />
      <div className={s.recBody}>
        <div className={s.recName}>{h.name}</div>
        <div className={s.recSub}>LV.{h.from_day} → <b className={s.recGood}>LV.{h.to_day}</b> 生存</div>
      </div>
      <TvBig tv={h.total_value} />
      <span className={`${s.recBadge} ${s.recBadgeGood}`}>生存</span>
    </div>
  ));

  const burnRows = results.burned.map((h) => (
    <div key={`bu:${h.name}`} className={`${s.recRow} ${s.recBurn}`}>
      <HorseThumb dna={h.dna_hash} name={h.name} />
      <div className={s.recBody}>
        <div className={s.recName}>{h.name}</div>
        <div className={s.recSub}>
          {h.day !== null ? `LV.${h.day} — BURN` : 'BURN'}
          {itemName(h.used_item_key) && ` · 使用アイテム(消費): ${itemName(h.used_item_key)}`}
          {itemName(h.drop_item_key) && (
            <> · <b className={s.recGold}>BURNドロップ獲得: {itemName(h.drop_item_key)}</b></>
          )}
        </div>
      </div>
      <TvBig tv={h.total_value} />
      <span className={`${s.recBadge} ${s.recBadgeBad}`}>BURN</span>
    </div>
  ));

  const soldRows = results.sold.map((h) => (
    <div key={`so:${h.name}`} className={s.recRow}>
      <HorseThumb dna={h.dna_hash} name={h.name} />
      <div className={s.recBody}>
        <div className={s.recName}>{h.name}</div>
        <div className={s.recSub}>{h.counterpart} と売却マッチング成立 {money(h.price)} — 受取 <b className={s.recGold}>{soldNet(h.price)} USDT</b>(手数料2%)</div>
      </div>
      <TvBig tv={h.total_value} />
      <span className={`${s.recBadge} ${s.recBadgeCyan}`}>売却</span>
    </div>
  ));

  const boughtRows = results.bought.map((h) => (
    <div key={`bo:${h.name}`} className={s.recRow}>
      <HorseThumb dna={h.dna_hash} name={h.name} />
      <div className={s.recBody}>
        <div className={s.recName}>{h.name}</div>
        <div className={s.recSub}>
          {h.is_mint
            ? <>新規発行(LV.0)で入手 — 支払 <b className={s.recGold}>{mintPaid(h.price)} USDT</b>({money(h.price)}+手数料{MINT_FEE})</>
            : <>{h.counterpart} と購入マッチング成立(LV.{h.day}) — 支払 <b className={s.recGold}>{money(h.price)} USDT</b></>}
        </div>
      </div>
      <TvBig tv={h.total_value} />
      <span className={`${s.recBadge} ${h.is_mint ? s.recBadgeMint : s.recBadgeCyan}`}>
        {h.is_mint ? '新規発行' : '購入'}
      </span>
    </div>
  ));

  // 従来どおり(ショー最後のサマリー): 一続きのリスト
  if (!grouped) {
    return (
      <div className={s.recList}>
        {day7Rows}{survivedRows}{burnRows}{soldRows}{boughtRows}
      </div>
    );
  }

  // 記録ページ: カテゴリ見出し+件数でグループ表示
  const tradeCount = results.sold.length + results.bought.length;
  return (
    <div>
      {day7.length > 0 && (
        <div className={s.grp}>
          <GroupHead tone={s.g7} label="LV.7 走破" count={day7.length} />
          <div className={s.recList}>{day7Rows}</div>
        </div>
      )}
      {survived.length > 0 && (
        <div className={s.grp}>
          <GroupHead tone={s.gs} label="生存" count={survived.length} />
          <div className={s.recList}>{survivedRows}</div>
        </div>
      )}
      {results.burned.length > 0 && (
        <div className={s.grp}>
          <GroupHead tone={s.gb} label="BURN 消滅" count={results.burned.length} />
          <div className={s.recList}>{burnRows}</div>
        </div>
      )}
      {tradeCount > 0 && (
        <div className={s.grp}>
          <GroupHead tone={s.gt} label="P2P 売買" count={tradeCount} />
          <div className={s.recList}>{soldRows}{boughtRows}</div>
        </div>
      )}
    </div>
  );
}
