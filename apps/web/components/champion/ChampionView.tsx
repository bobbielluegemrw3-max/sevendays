'use client';

import { useMemo, useState } from 'react';
import { AppSelect } from '@/components/AppSelect';
import { BuybacksView, type Buyback } from '@/components/BuybacksView';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import { ChampionHero } from '@/components/champion/ChampionHero';
import { tvChipStyle, tvNumStyle } from '@/lib/tv-tier';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../../app/champion.module.css';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

/**
 * /champion — 憧れリデザイン(仕様書.md / CHAMPION_PAGE_ASPIRATION_SPEC.md)。
 * ①HERO(憧れの宣言) ②THE PAYOFF(前面化・4枚) ③HALL(空＝最初の王/R1架空なし)
 * ②YOUR REWARDS(BuybacksView) ④LEAGUE(COMING SOON→待ち遠しさへ反転)。
 * R3: 賭博/オッズ語なし。R1: 架空チャンピオンを本物のように見せない(hall空は空の玉座)。
 * データは buybacks + hall(HallChampion)のみ。機構(buybacks/hall API・報酬ルール)不変。
 */

export interface HallChampion {
  horse_id: string;
  name: string;
  dna_hash: string;
  horse_type: string;
  /** V2: 走破時点の総合値(旧レアリティ表示は廃止 2026-07-19)。 */
  total_value?: number | null;
  owner: string;
  cleared_at: string | null;
}

type SortKey = 'recent' | 'oldest' | 'name';

export function ChampionView({
  buybacks,
  hall,
  t,
}: {
  buybacks: Buyback[];
  hall: HallChampion[];
  t: AppDict['champion'];
}) {
  const lang = useLang();
  // 昇級ラダー(勝数は言語別テンプレ、Maiden/G1等は競馬の固有表記で共通)
  const CLASS_LADDER = ['Maiden', fill(t.class_win_tpl, { n: 1 }), fill(t.class_win_tpl, { n: 2 }), fill(t.class_win_tpl, { n: 3 }), 'G3', 'G2', 'G1'];
  // ② THE PAYOFF — 4枚(FOREVER は永久系=記念NFT/殿堂のみ)。英語ブランド語はJSX直書き。
  const PAYOFFS = [
    { k: t.po1_k, title: '200 USDT', desc: t.po1_d, foot: t.po1_f, forever: false },
    { k: t.po2_k, title: t.po2_t, desc: t.po2_d, foot: t.po2_f, forever: true },
    { k: t.po3_k, title: 'HALL OF CHAMPIONS', desc: t.po3_d, foot: t.po3_f, forever: true },
    { k: t.po4_k, title: t.po4_t, desc: t.po4_d, foot: t.po4_f, forever: false },
  ];
  const LEAGUE_CARDS = [
    { k: 'WEEKLY RACES', v: t.weekly_races_v },
    { k: 'PRIZE POOL', v: t.prize_pool_v },
    { k: 'RETIREMENT', v: t.retirement_v },
    { k: 'FAN PASS — 3 USDT', v: t.fanpass_v },
  ];
  // R1: 架空チャンピオンは出さない。hall が空なら「空の玉座」を表示。
  const hallEmpty = hall.length === 0;
  const THRONES: Array<[string, string]> = [
    ['I', t.throne_seat1], ['II', '—'], ['III', '—'], ['IV', '—'], ['V', '—'],
  ];

  const [sort, setSort] = useState<SortKey>('recent');

  // 最新チャンピオン(絞り込みに関係なく全体から)
  const spotlight = useMemo(
    () => [...hall].sort((a, b) => (b.cleared_at ?? '').localeCompare(a.cleared_at ?? ''))[0],
    [hall],
  );

  const shown = useMemo(() => {
    return [...hall].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'oldest') return (a.cleared_at ?? '').localeCompare(b.cleared_at ?? '');
      return (b.cleared_at ?? '').localeCompare(a.cleared_at ?? '');
    });
  }, [hall, sort]);

  return (
    <>
      {/* ① ヒーロー(ループ動画 + 憧れの宣言) */}
      <ChampionHero t={t} />

      {/* ② THE PAYOFF — チャンピオンになると手に入るもの(前面化) */}
      <section className={`panel ${s.payoff}`} style={{ marginTop: '1rem' }}>
        <div className={s.payoffHead}>
          <span className={s.payoffBar} />
          <div style={{ flex: '1 1 auto' }}>
            <div className={s.payoffKicker}>THE PAYOFF</div>
            <h2 className={s.payoffTitle}>{t.payoff_title}</h2>
          </div>
          <span className={s.payoffLead}>{t.payoff_lead}</span>
        </div>
        <div className={s.payoffGrid}>
          {PAYOFFS.map((p) => (
            <div key={p.title} className={s.payoffCard}>
              <div className={s.payoffCardHead}>
                <span className={s.payoffCK}>{p.k}</span>
                {p.forever && <span className={s.foreverBadge}>FOREVER</span>}
              </div>
              <div className={s.payoffCTitle}>{p.title}</div>
              <div className={s.payoffDesc}>{p.desc}</div>
              <div className={s.payoffFoot}>{p.foot}</div>
            </div>
          ))}
        </div>
        <p className={s.payoffNote}>{t.payoff_note}</p>
      </section>

      {/* 下段: 2カラム(左=殿堂+報酬 / 右=リーグ) */}
      <div className={s.lower}>
        <div className={s.lowerMain}>
          {/* ③ 殿堂 */}
          <section className="panel">
            <div className={s.secTitle}>
              HALL OF CHAMPIONS
              <span className={s.secSub}>{t.hall_sub}</span>
              <span className={s.hallCount}>{fill(t.hall_count_tpl, { n: hall.length })}</span>
            </div>

            {hallEmpty ? (
              /* R1: 架空チャンピオンなし。空の玉座で「最初の王になれ」。 */
              <div className={s.throne}>
                <div className={s.throneKicker}>THE THRONE IS EMPTY</div>
                <div className={s.throneTitle}>{t.throne_title}</div>
                <p className={s.throneDesc}>{t.throne_desc}</p>
                <div className={s.throneSeats}>
                  {THRONES.map(([label, text], i) => (
                    <div key={label} className={`${s.seat} ${i === 0 ? s.seatFirst : ''}`}>
                      <span className={`${s.seatLabel} ${i === 0 ? s.seatLabelFirst : ''}`}>{label}</span>
                      <span className={`${s.seatText} ${i === 0 ? s.seatTextFirst : ''}`}>{text}</span>
                    </div>
                  ))}
                </div>
                <div className={s.throneFoot}>{t.throne_foot}</div>
              </div>
            ) : (
              <>
                {/* 並び替え(V2: レアリティ絞り込みは廃止 — 強さは総合値ひとつ) */}
                <div className={s.hallControls}>
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

                {/* 最新チャンピオンのスポットライト(本物のみ) */}
                {spotlight && (
                  <div className={s.spotlightFrame}>
                    <div className={s.spotlight}>
                      <span className={s.spotlightTag}>★ LATEST CHAMPION</span>
                      <div className={s.spotlightArt}>
                        <NftHorseArt look={deriveNftLook(spotlight.dna_hash, spotlight.name)} className={s.artCanvas} />
                      </div>
                      <div className={s.spotlightBody}>
                        <div className={s.spotlightName}>{horseDisplayName(spotlight.name, lang)}</div>
                        <div className={s.spotlightChips}>
                          <span className={s.typeChip}>{spotlight.horse_type}</span>
                          {spotlight.total_value != null && (
                            <span className={s.rar} style={tvChipStyle(spotlight.total_value)}>
                              <b style={tvNumStyle(spotlight.total_value)}>{spotlight.total_value.toFixed(1)}</b>
                            </span>
                          )}
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
                      <div className={s.hallName}>{horseDisplayName(c.name, lang)}</div>
                      <div className={s.hallMetaRow}>
                        {c.total_value != null && (
                          <span className={s.rar} style={tvChipStyle(c.total_value)}>
                            <b style={tvNumStyle(c.total_value)}>{c.total_value.toFixed(1)}</b>
                          </span>
                        )}
                        <span className={s.typeChip}>{c.horse_type}</span>
                        <span className={s.hallOwner}>{c.owner}</span>
                      </div>
                      {c.cleared_at && <div className={s.hallDate}>{t.crowned} {c.cleared_at}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ② あなたのチャンピオン報酬 */}
          <section className={`panel ${s.rewards}`}>
            <div className={s.secTitle}>
              YOUR CHAMPION REWARDS
              <span className={s.secSub}>{t.rewards_sub}</span>
            </div>
            <p className={s.rewardsNote}>
              {t.rewards_note_a}<b>200 USDT</b>{t.rewards_note_b}
            </p>
            {buybacks.length === 0 ? (
              <div className={s.rewardsEmpty}>{t.rewards_empty}</div>
            ) : (
              <BuybacksView buybacks={buybacks} t={t} />
            )}
          </section>
        </div>

        {/* ④ CHAMPION LEAGUE — 待ち遠しさへ反転 */}
        <section className={`panel ${s.leaguePanel}`}>
          <div className={s.secTitle}>
            CHAMPION LEAGUE
            <span className={s.leagueStage}>{t.league_stage}</span>
          </div>

          <div className={s.leagueOnly}>
            <div className={s.leagueOnlyT}>
              {t.league_only_a}<span className={s.leagueOnlyGold}>{t.league_only_b}</span>
            </div>
            <p className={s.leagueOnlyNote}>{t.league_only_note}</p>
            <div className={s.leaguePulseRow}>
              <span className={s.leaguePulse} />
              <span className={s.leaguePulseT}>{t.league_pulse}</span>
            </div>
          </div>

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
            {LEAGUE_CARDS.map((c) => (
              <div key={c.k} className={s.leagueCard}>
                <div className={s.leagueK}>{c.k}</div>
                <div className={s.leagueV}>{c.v}</div>
              </div>
            ))}
          </div>
          <div className={s.leagueFoot}>{t.league_foot}</div>
        </section>
      </div>
    </>
  );
}
