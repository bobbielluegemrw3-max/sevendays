'use client';

import { useCallback, useEffect, useState } from 'react';
import { ITEM_BY_KEY_V2 } from '@sevendays/domain';
import { apiFetch } from '@/lib/client-api';
import { deriveNftLook } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import s from '../../app/races.module.css';

/**
 * あなたのレース記録(オーナー指示 2026-07-10)。
 * 審判演出の記録版 — 日付を遡って、その夜の自分の
 * BURN(使用アイテム+ドロップ)/生存(DAY進行)/P2P売却・購入/新規発行を見る。
 * データは /api/v1/daily-derby/my-results/:date(実データ)。
 */

interface MyResults {
  date: string | null;
  dates: string[];
  burned: { name: string; dna_hash: string; day: number | null; used_item_key: string | null; drop_item_key: string | null }[];
  survived: { name: string; dna_hash: string; from_day: number; to_day: number; day7: boolean }[];
  sold: { name: string; dna_hash: string; price: string; day: number | null; counterpart: string }[];
  bought: { name: string; dna_hash: string; price: string; day: number | null; is_mint: boolean; counterpart: string | null }[];
}

function fmtJa(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function itemName(key: string | null): string | null {
  if (!key) return null;
  return ITEM_BY_KEY_V2.get(key)?.nameJa ?? key;
}

function HorseThumb({ dna, name }: { dna: string; name: string }) {
  return <NftHorseArt look={deriveNftLook(dna, name)} className={s.recArt} />;
}

export function MyDerbyRecord() {
  const [data, setData] = useState<MyResults | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    const r = await apiFetch<MyResults>(`/api/v1/daily-derby/my-results/${date}`);
    if (r.status === 200) setData(r.body as MyResults);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load('latest');
  }, [load]);

  if (!data) {
    return (
      <section>
        <div className={s.secLabel}>あなたのレース記録 · MY RECORD</div>
        <div className={s.empty}>{loading ? '読み込み中…' : 'レース記録を取得できませんでした。'}</div>
      </section>
    );
  }

  const idx = data.date ? data.dates.indexOf(data.date) : -1;
  const newer = idx > 0 ? data.dates[idx - 1] : null;
  const older = idx >= 0 && idx < data.dates.length - 1 ? data.dates[idx + 1] : null;
  const hasAny =
    data.burned.length + data.survived.length + data.sold.length + data.bought.length > 0;

  return (
    <section>
      <div className={s.secLabel}>あなたのレース記録 · MY RECORD</div>
      <div className={s.recNav}>
        <button type="button" className={s.recNavBtn} disabled={!older || loading} onClick={() => older && void load(older)}>
          ← 前日
        </button>
        <select
          className={s.recSelect}
          value={data.date ?? ''}
          disabled={loading || data.dates.length === 0}
          onChange={(e) => void load(e.target.value)}
        >
          {data.dates.map((d) => (
            <option key={d} value={d}>{fmtJa(d)}</option>
          ))}
        </select>
        <button type="button" className={s.recNavBtn} disabled={!newer || loading} onClick={() => newer && void load(newer)}>
          翌日 →
        </button>
      </div>

      {data.date === null ? (
        <div className={s.empty}>確定したレースはまだありません。</div>
      ) : !hasAny ? (
        <div className={s.empty}>{fmtJa(data.date)} — この日のあなたの出走・売買はありませんでした。</div>
      ) : (
        <div className={s.recList}>
          {data.survived.filter((h) => h.day7).map((h) => (
            <div key={`d7:${h.name}`} className={`${s.recRow} ${s.recDay7}`}>
              <HorseThumb dna={h.dna_hash} name={h.name} />
              <div className={s.recBody}>
                <div className={s.recName}>{h.name}</div>
                <div className={s.recSub}>DAY7 走破 — CHAMPION</div>
              </div>
              <span className={`${s.recBadge} ${s.recBadgeGold}`}>DAY7</span>
            </div>
          ))}
          {data.survived.filter((h) => !h.day7).map((h) => (
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
          {data.burned.map((h) => (
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
          {data.sold.map((h) => (
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
          {data.bought.map((h) => (
            <div key={`bo:${h.name}`} className={s.recRow}>
              <HorseThumb dna={h.dna_hash} name={h.name} />
              <div className={s.recBody}>
                <div className={s.recName}>{h.name}</div>
                <div className={s.recSub}>
                  {h.is_mint
                    ? <>新規発行(DAY0)で入手 — <b className={s.recGold}>{h.price} USDT</b></>
                    : <>{h.counterpart} と購入マッチング成立(DAY{h.day}) — <b className={s.recGold}>{h.price} USDT</b></>}
                </div>
              </div>
              <span className={`${s.recBadge} ${h.is_mint ? s.recBadgeMint : s.recBadgeCyan}`}>
                {h.is_mint ? '新規発行' : '購入'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
