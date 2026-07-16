'use client';

import { useMemo, useState } from 'react';
import { AppSelect } from '@/components/AppSelect';
import { BuybacksView, type Buyback } from '@/components/BuybacksView';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import { ChampionHero } from '@/components/champion/ChampionHero';
import { SAMPLE_CHAMPIONS } from '@/lib/champion-fixtures';
import { APP_COPY, fill, type Lang } from '@/lib/i18n';
import s from '../../app/champion.module.css';

/**
 * /champion — チャンピオンの栄誉を1ページに集約(ADR-011 / Decision 080)。
 * ①ヒーロー(ループアニメ+LEAGUE COMING SOON) ②あなたのチャンピオン報酬
 * ③殿堂(Hall of Champions) ④リーグ予告。
 * R3: betting/odds/gambling系の語は使わない。
 *
 * リデザイン:
 *  - ②報酬を「YOUR CHAMPION REWARDS」枠で BuybacksView を包み、Day7報酬
 *    (200 USDT/7回)の意味を添える。
 *  - ③殿堂を「総戴冠数 + レアリティ絞り込み + 並び替え + 最新チャンピオンの
 *    スポットライト + 王冠つきカード(レアリティバッジ/タイプチップ)」に刷新。
 *  - ④リーグを「7クラス昇級ラダー + 情報カード」に整理。
 * データは buybacks + hall(HallChampion)のみ。'use client' 化しても
 * ChampionHero / BuybacksView / NftHorseArt / hall API は不変。
 */

export interface HallChampion {
  horse_id: string;
  name: string;
  dna_hash: string;
  horse_type: string;
  rarity: string;
  owner: string;
  cleared_at: string | null;
}

const SAMPLE_HALL: HallChampion[] = SAMPLE_CHAMPIONS.slice(0, 8).map((h, i) => ({
  horse_id: `sample-${i}`,
  name: h.name,
  dna_hash: h.dna_hash,
  horse_type: ['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK'][i % 5]!,
  rarity: ['LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'][i % 5]!,
  owner: ['yu***', 'mi***', '0x9fe3…12aa', 'ta***', 'ke***', 'sa***', '0x77cd…09be', 'no***'][i]!,
  cleared_at: `2026-07-${String(1 + i).padStart(2, '0')}`,
}));

const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const RARITY_FILTER = ['ALL', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'] as const;
const rarClass = (r: string): string => (RARITIES.includes(r) ? r : 'COMMON');

type SortKey = 'recent' | 'oldest' | 'name';

export function ChampionView({
  buybacks,
  hall,
  lang = 'ja',
}: {
  buybacks: Buyback[];
  hall: HallChampion[];
  lang?: Lang;
}) {
  const t = APP_COPY[lang].champion;
  // 昇級ラダー(勝数は言語別テンプレ、Maiden/G1等は競馬の固有表記で共通)
  const CLASS_LADDER = ['Maiden', fill(t.class_win_tpl, { n: 1 }), fill(t.class_win_tpl, { n: 2 }), fill(t.class_win_tpl, { n: 3 }), 'G3', 'G2', 'G1'];
  const isSample = hall.length === 0;
  const source = isSample ? SAMPLE_HALL : hall;

  const [rar, setRar] = useState<(typeof RARITY_FILTER)[number]>('ALL');
  const [sort, setSort] = useState<SortKey>('recent');

  // 最新チャンピオン(絞り込みに関係なく全体から)
  const spotlight = useMemo(
    () => [...source].sort((a, b) => (b.cleared_at ?? '').localeCompare(a.cleared_at ?? ''))[0],
    [source],
  );

  const shown = useMemo(() => {
    const filtered = rar === 'ALL' ? source : source.filter((c) => c.rarity === rar);
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'oldest') return (a.cleared_at ?? '').localeCompare(b.cleared_at ?? '');
      return (b.cleared_at ?? '').localeCompare(a.cleared_at ?? '');
    });
  }, [source, rar, sort]);

  return (
    <>
      {/* ① ヒーロー(ループ動画 2026-07-12: WebGL描画の録画置換) */}
      <ChampionHero lang={lang} />

      {/* 下段: 2カラム(左=報酬+殿堂 / 右=リーグ) */}
      <div className={s.lower}>
        <div className={s.lowerMain}>
          {/* ② あなたのチャンピオン報酬 */}
          <section className={`panel ${s.rewards}`}>
            <div className={s.secTitle}>
              YOUR CHAMPION REWARDS
              <span className={s.secSub}>{t.rewards_sub}</span>
            </div>
            <p className={s.rewardsNote}>
              {t.rewards_note_a}<b>200 USDT</b>{t.rewards_note_b}
            </p>
            <BuybacksView buybacks={buybacks} lang={lang} />
          </section>

          {/* ③ 殿堂 */}
          <section className="panel">
            <div className={s.secTitle}>
              HALL OF CHAMPIONS
              <span className={s.secSub}>{t.hall_sub}</span>
              <span className={s.hallCount}>{fill(t.hall_count_tpl, { n: source.length })}</span>
            </div>
            {isSample && (
              <div className={s.hallSample}>
                {t.hall_sample}
              </div>
            )}

            {/* 絞り込み + 並び替え */}
            <div className={s.hallControls}>
              <div className={s.rarTabs}>
                {RARITY_FILTER.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={rar === r ? s.rarTabOn : s.rarTab}
                    onClick={() => setRar(r)}
                  >
                    {r === 'ALL' ? t.filter_all : r}
                  </button>
                ))}
              </div>
              <AppSelect
                className={s.sortSelect}
                value={sort}
                onChange={(v) => setSort(v as SortKey)}
                ariaLabel={t.sort_aria}
                options={[
                  { value: 'recent', label: t.sort_recent },
                  { value: 'oldest', label: t.sort_oldest },
                  { value: 'name', label: t.sort_name },
                ]}
              />
            </div>

            {/* 最新チャンピオンのスポットライト */}
            {rar === 'ALL' && spotlight && (
              <div className={s.spotlightFrame}>
                <div className={s.spotlight}>
                  <span className={s.spotlightTag}>★ LATEST CHAMPION</span>
                  <div className={s.spotlightArt}>
                    <NftHorseArt look={deriveNftLook(spotlight.dna_hash, spotlight.name)} className={s.artCanvas} />
                  </div>
                  <div className={s.spotlightBody}>
                    <div className={s.spotlightName}>{spotlight.name}</div>
                    <div className={s.spotlightChips}>
                      <span className={s.typeChip}>{spotlight.horse_type}</span>
                      <span className={`${s.rar} ${s[`rar${rarClass(spotlight.rarity)}`]}`}>{spotlight.rarity}</span>
                    </div>
                    <div className={s.spotlightMeta}>
                      {spotlight.cleared_at && <span>{t.crowned} <b>{spotlight.cleared_at}</b></span>}
                      <span>{t.owner_label} {spotlight.owner}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={s.hallGrid}>
              {shown.map((c) => (
                <div key={c.horse_id} className={s.hallCard}>
                  <span className={s.crown} aria-hidden="true">👑</span>
                  <div className={s.hallArt}>
                    <NftHorseArt look={deriveNftLook(c.dna_hash, c.name)} className={s.artCanvas} />
                  </div>
                  <div className={s.hallName}>{c.name}</div>
                  <div className={s.hallMetaRow}>
                    <span className={`${s.rar} ${s[`rar${rarClass(c.rarity)}`]}`}>{c.rarity}</span>
                    <span className={s.typeChip}>{c.horse_type}</span>
                    <span className={s.hallOwner}>{c.owner}</span>
                  </div>
                  {c.cleared_at && <div className={s.hallDate}>{t.crowned} {c.cleared_at}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ④ リーグ予告 */}
        <section className={`panel ${s.leaguePanel}`}>
          <div className={s.secTitle}>
            CHAMPION LEAGUE
            <span className={s.comingTag}>COMING SOON</span>
          </div>
          <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
            {t.league_desc}
          </p>

          {/* 7クラス昇級ラダー */}
          <div className={s.ladder}>
            <div className={s.ladderTitle}>{t.ladder_title}</div>
            {CLASS_LADDER.map((c, i) => (
              <div key={c} className={s.ladderRow}>
                <span className={s.ladderN}>{i + 1}</span>
                <span className={`${s.ladderDot} ${i >= 4 ? s.ladderDotG : ''}`} />
                <span className={`${s.classChip} ${i >= 4 ? s.classChipG : ''}`}>{c}</span>
                <span className={s.ladderLine} />
              </div>
            ))}
          </div>

          {/* 情報カード */}
          <div className={s.leagueGrid}>
            <div className={s.leagueCard}>
              <div className={s.leagueK}>WEEKLY RACES</div>
              <div className={s.leagueV}>
                {t.weekly_races_v}
              </div>
            </div>
            <div className={s.leagueCard}>
              <div className={s.leagueK}>PRIZE POOL</div>
              <div className={s.leagueV}>
                {t.prize_pool_v}
              </div>
            </div>
            <div className={s.leagueCard}>
              <div className={s.leagueK}>RETIREMENT</div>
              <div className={s.leagueV}>
                {t.retirement_v}
              </div>
            </div>
            <div className={s.leagueCard}>
              <div className={s.leagueK}>FAN PASS — 3 USDT</div>
              <div className={s.leagueV}>
                {t.fanpass_v}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
