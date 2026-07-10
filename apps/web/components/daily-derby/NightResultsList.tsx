'use client';

import { ITEM_BY_KEY_V2 } from '@sevendays/domain';
import { deriveNftLook } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import type { DerbyNightResults } from '@/lib/daily-derby';
import s from '../../app/races.module.css';

/**
 * ある夜の自分の全結果(BURN/生存/DAY7/P2P売買/新規発行)の行リスト。
 * ショー最後のサマリーと /races「あなたのレース記録」で共用 —
 * 「演出の最後に出たものが、そのまま記録に残り続ける」(オーナー指示 2026-07-11)。
 */

function itemName(key: string | null): string | null {
  if (!key) return null;
  return ITEM_BY_KEY_V2.get(key)?.nameJa ?? key;
}

function HorseThumb({ dna, name }: { dna: string; name: string }) {
  return <NftHorseArt look={deriveNftLook(dna, name)} className={s.recArt} />;
}

export function nightResultsCount(r: DerbyNightResults): number {
  return r.burned.length + r.survived.length + r.sold.length + r.bought.length;
}

function Group({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className={s.recGroup}>
      <div className={s.recGroupK}>
        {label} <span className={s.recGroupN}>· {count}</span>
      </div>
      {children}
    </div>
  );
}

export function NightResultsList({ results }: { results: DerbyNightResults }) {
  const day7 = results.survived.filter((h) => h.day7);
  const survived = results.survived.filter((h) => !h.day7);
  return (
    <div className={s.recList}>
      <Group label="DAY7 走破" count={day7.length}>
      {day7.map((h) => (
        <div key={`d7:${h.name}`} className={`${s.recRow} ${s.recDay7}`}>
          <HorseThumb dna={h.dna_hash} name={h.name} />
          <div className={s.recBody}>
            <div className={s.recName}>{h.name}</div>
            <div className={s.recSub}>DAY7 走破 — CHAMPION</div>
          </div>
          <span className={`${s.recBadge} ${s.recBadgeGold}`}>DAY7</span>
        </div>
      ))}
      </Group>
      <Group label="生存" count={survived.length}>
      {survived.map((h) => (
        <div key={`sv:${h.name}`} className={s.recRow}>
          <HorseThumb dna={h.dna_hash} name={h.name} />
          <div className={s.recBody}>
            <div className={s.recName}>{h.name}</div>
            <div className={s.recSub}>
              DAY{h.from_day} → <b className={s.recGood}>DAY{h.to_day}</b> 生存
            </div>
          </div>
          <span className={`${s.recBadge} ${s.recBadgeGood}`}>生存</span>
        </div>
      ))}
      </Group>
      <Group label="BURN(消滅)" count={results.burned.length}>
      {results.burned.map((h) => (
        <div key={`bu:${h.name}`} className={`${s.recRow} ${s.recBurn}`}>
          <HorseThumb dna={h.dna_hash} name={h.name} />
          <div className={s.recBody}>
            <div className={s.recName}>{h.name}</div>
            <div className={s.recSub}>
              {h.day !== null ? `DAY${h.day} — BURN` : 'BURN'}
              {itemName(h.used_item_key) && ` · 使用アイテム(消費): ${itemName(h.used_item_key)}`}
              {itemName(h.drop_item_key) && (
                <> · <b className={s.recGold}>BURNドロップ獲得: {itemName(h.drop_item_key)}</b></>
              )}
            </div>
          </div>
          <span className={`${s.recBadge} ${s.recBadgeBad}`}>BURN</span>
        </div>
      ))}
      </Group>
      <Group label="P2P売買" count={results.sold.length + results.bought.filter((h) => !h.is_mint).length}>
      {results.sold.map((h) => (
        <div key={`so:${h.name}`} className={s.recRow}>
          <HorseThumb dna={h.dna_hash} name={h.name} />
          <div className={s.recBody}>
            <div className={s.recName}>{h.name}</div>
            <div className={s.recSub}>
              {h.counterpart} と売却マッチング成立 — <b className={s.recGold}>{h.price} USDT</b>
            </div>
          </div>
          <span className={`${s.recBadge} ${s.recBadgeCyan}`}>売却</span>
        </div>
      ))}
      {results.bought.filter((h) => !h.is_mint).map((h) => (
        <div key={`bo:${h.name}`} className={s.recRow}>
          <HorseThumb dna={h.dna_hash} name={h.name} />
          <div className={s.recBody}>
            <div className={s.recName}>{h.name}</div>
            <div className={s.recSub}>
              {h.counterpart} と購入マッチング成立(DAY{h.day}) — <b className={s.recGold}>{h.price} USDT</b>
            </div>
          </div>
          <span className={`${s.recBadge} ${s.recBadgeCyan}`}>購入</span>
        </div>
      ))}
      </Group>
      <Group label="新規発行" count={results.bought.filter((h) => h.is_mint).length}>
      {results.bought.filter((h) => h.is_mint).map((h) => (
        <div key={`mi:${h.name}`} className={s.recRow}>
          <HorseThumb dna={h.dna_hash} name={h.name} />
          <div className={s.recBody}>
            <div className={s.recName}>{h.name}</div>
            <div className={s.recSub}>
              新規発行(DAY0)で入手 — <b className={s.recGold}>{h.price} USDT</b>
            </div>
          </div>
          <span className={`${s.recBadge} ${s.recBadgeMint}`}>新規発行</span>
        </div>
      ))}
      </Group>
    </div>
  );
}
