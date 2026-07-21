import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/breeders.module.css';

/* ============================================================================
 * /breeders — 名伯楽ランキング(施策D / FUN_V3)。
 * 総合値や資産とは別の「純粋な腕」の指標: 調教ロールの実力ぶん(delta_v2)の総和。
 * アイテム上乗せは含めない。売った後も功績は残る(所有権移転で消えない)。
 * 表示は実データのみ。名前は匿名ハンドル(stable_name 優先)。自分は「あなた」。
 * ========================================================================== */

export interface BreederRow {
  rank: number;
  name: string | null;
  is_you: boolean;
  skill: number;
  horses: number;
  champions: number;
}

export function BreedersView({ breeders, t }: { breeders: BreederRow[]; t: AppDict['breeders'] }) {
  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <span className={s.h1}>{t.title}</span>
        <span className={s.sub}>{t.sub}</span>
      </div>
      {breeders.length === 0 ? (
        <div className={s.empty}>{t.empty}</div>
      ) : (
        <div className={s.list}>
          <div className={`${s.row} ${s.headRow}`}>
            <span className={s.rank}>#</span>
            <span className={s.name}>{t.col_breeder}</span>
            <span className={s.skill}>{t.col_skill}</span>
            <span className={s.meta}>{t.col_horses}</span>
            <span className={s.meta}>{t.col_champs}</span>
          </div>
          {breeders.map((b) => (
            <div key={b.rank} className={`${s.row} ${b.is_you ? s.you : ''}`}>
              <span className={s.rank}>{b.rank}</span>
              <span className={s.name}>{b.is_you ? t.you : (b.name ?? '—')}</span>
              <span className={s.skill}>{b.skill.toFixed(1)}</span>
              <span className={s.meta}>{fill(t.horses_tpl, { n: b.horses })}</span>
              <span className={s.meta}>{b.champions > 0 ? fill(t.champs_tpl, { n: b.champions }) : '—'}</span>
            </div>
          ))}
        </div>
      )}
      <div className={s.note}>{t.note}</div>
    </div>
  );
}
