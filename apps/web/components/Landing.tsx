import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import { LocalPostTime, LocalRaceTime } from '@/components/LocalPostTime';
import { LandingReveal } from '@/components/LandingReveal';
import { GoogleLoginButton } from '@/components/GoogleLoginButton';
import { DAY0_MINT_TOTAL_CHARGE, PRICE_TABLE_V1 } from '@sevendays/domain';
import { pickShowcase } from '@/lib/horse-visual';
import { pickNftShowcase } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LANDING_COPY, type Lang } from '@/lib/landing-i18n';
import s from './landing.module.css';

/**
 * 公開ランディング(LPリデザイン 2026-07-11)。
 * 正典: LPリデザイン.zip / handoff-lp(①②は旧実装の忠実再現・③〜⑩が新設)。
 * 正典のプレースホルダ馬アートは NftHorseArt / manus 実アートに差し替え。
 * コピーは lp_redesign/LP_REDESIGN_BRIEF.md のレッドライン準拠
 * (率の宣言なし・架空統計なし・SHOWCASE明示・禁止語彙なし)。
 */

/** V2表示: ショーケース生成器のレアリティ段階を総合値の見せ値に変換(見た目のみ)。 */
const SHOWCASE_TOTAL: Record<string, number> = {
  LEGENDARY: 94, EPIC: 88, RARE: 81, UNCOMMON: 72, COMMON: 63,
};
const showcaseTotal = (h: { rarity: string; seed: number }) =>
  ((SHOWCASE_TOTAL[h.rarity] ?? 60) + (h.seed % 50) / 10).toFixed(1);

const TYPE_COLOR: Record<string, string> = {
  ENDURANCE: '#c6ff3a',
  POWER: '#ff8fe4',
  SPRINTER: '#00eaff',
  BALANCED: '#eae7ff',
  LUCK: '#c9a86a',
};

/** ④結果の濁流のダミー行(正典のNAMES)。1ブロックを2回描画してループを継ぎ目なしに。 */
const FLOOD_NAMES = [
  'Crimson King', 'Storm Flame', 'Silver Comet', 'Velvet Crown', 'Phantom Legend', 'Iron Legend',
  'Storm Pulse', 'Wild Rocket', 'Blazing Wolf', 'Silver Bolt', 'Azure Mirage', 'Iron Star',
  'Cosmic Dash', 'Frozen Star', 'Cosmic Pulse', 'Black Frost', 'Storm Wolf', 'Grand Tiger',
  'Rapid Arrow', 'Velvet Echo', 'Wild Dash', 'Neon Gale',
];

/** ⑨台帳カレンダーの雰囲気(記録なし日=素・記録あり=on・7日毎=gold)。 */
const CAL_OFF_DAYS = new Set([3, 9, 16, 24, 26]);

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export interface LandingTonightField {
  entrants: number;
  min: number;
  max: number;
}

export function Landing({
  tonightField = null,
  lang = 'ja',
}: {
  tonightField?: LandingTonightField | null;
  lang?: Lang;
}) {
  const t = LANDING_COPY[lang];
  // ショーケース: 名前/価格/レアリティは決定論エンジン、アートは承認済みNFTルック空間。
  const horses = pickShowcase(8, () => (Math.random() * 0xffffffff) >>> 0);
  const looks = pickNftShowcase(8, () => (Math.random() * 0xffffffff) >>> 0);
  const stableHorses = pickShowcase(6, () => (Math.random() * 0xffffffff) >>> 0);
  const stableLooks = pickNftShowcase(6, () => (Math.random() * 0xffffffff) >>> 0);
  const floodLines = FLOOD_NAMES.map((name) => ({
    name,
    id: String(Math.floor(10000 + Math.random() * 89999)),
    day: Math.floor(Math.random() * 6),
  }));
  return (
    <div className={`landing-bleed ${s.page}`}>
      <span className={s.hairline} />

      {/* ===== NAV ===== */}
      <div className={s.nav}>
        <div className={s.brand}>
          <span className={s.bar} />
          <span className={s.lock}>
            <span className={s.l1}>SEVEN&nbsp;DAYS</span>
            <span className={s.l2}>DERBY</span>
          </span>
        </div>
        <div className={s.navMenu}>
          <Link href="#how">{t.nav_how}</Link>
          <Link href="#collection">{t.nav_collection}</Link>
          <Link href="#economy">{t.nav_economy}</Link>
        </div>
        <div className={s.navRight}>
          <LanguageSwitcher current={lang} />
          <GoogleLoginButton size="sm" label={t.login} />
        </div>
      </div>

      {/* ===== ① HERO ===== */}
      <div className={s.hero}>
        <div className={s.gridbg} />
        <div className={s.heroInner}>
          {/* left copy */}
          <div>
            <span className={s.hbadge}>
              <span className={s.g} />
              WEB3 HORSE RACING · USDT ON POLYGON
            </span>
            <h1 className={s.htitle}>
              <span className={s.l1}>SEVEN&nbsp;DAYS</span>
              <span className={s.l2}>DERBY</span>
            </h1>
            <p className={s.hlead}>{t.hero_lead}</p>
            <div className={s.hsub}>Provably fair. Fully replayable. No AI winners.</div>
            <div className={s.hbtns}>
              {/* ヒーローのデザインは変更禁止 — 見た目そのまま、動作だけGoogle直起動 */}
              <GoogleLoginButton unstyled className={s.btnPrimary}>
                {t.hero_cta_adopt}
              </GoogleLoginButton>
              <Link href="#how">
                <button className={s.btnGhost}>{t.hero_cta_how}</button>
              </Link>
            </div>
            <div className={s.hstats}>
              <div>
                <div className={`${s.n} ${s.go}`}>200 USDT</div>
                <div className={s.k}>LV.7 CHAMPION</div>
              </div>
              <div>
                <div className={`${s.n} ${s.cy}`}>7 RACES</div>
                <div className={s.k}>TO GLORY</div>
              </div>
              <div>
                <div className={`${s.n} ${s.gr}`}>100%</div>
                <div className={s.k}>DETERMINISTIC</div>
              </div>
            </div>
          </div>

          {/* right featured NFT card */}
          <div className={s.featWrap}>
            <span className={s.featGlow} />
            <div className={s.featCard}>
              <div className={s.goldbar} />
              <div className={s.art}>
                <span className={s.idl}>#0001</span>
                <span className={s.idr}>♡ 2.1k</span>
                <span className={s.aura} />
                <img src="/horses/manus/v2.png" alt="Genesis #0001" />
              </div>
              <div className={s.cap}>
                <div>
                  <div className={s.gtag}>GENESIS&nbsp;#0001</div>
                  <div className={s.nm}>AURELIAN&nbsp;MIST</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className={`${s.tag} ${s.cy}`}>ENDURANCE</span>
                  <span className={`${s.tag} ${s.gold}`}>TOTAL 96.4</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== TRUST MARQUEE ===== */}
      <div className={s.marquee}>
        <div className={s.marq}>
          {[0, 1].map((k) => (
            <span key={k}>
              <span>◇ DETERMINISTIC</span>
              <span>◇ COMMIT-REVEAL SEED</span>
              <span>◇ AUDITABLE LEDGER</span>
              <span>◇ REPLAYABLE RACES</span>
              <span>◇ NO AI WINNERS</span>
              <span>◇ 200 USDT CHAMPION REWARD</span>
            </span>
          ))}
        </div>
      </div>

      {/* ===== ② COUNTDOWN + HOW IT WORKS ===== */}
      <div className={s.section} id="how">
        <div className={s.cdHow}>
          <div className={s.cdSide}>
            {/* countdown */}
            <div className={s.cdCard}>
              <div className={s.l}>{'// NEXT POST 8:00 & 20:00 MYT'}</div>
              <Countdown className={s.cd} />
              <div className={s.s}>
                <LocalPostTime lang={lang} />
              </div>
              <GoogleLoginButton label={t.login_join_race} />
            </div>
            {/* provably fair trust card */}
            <div className={s.trustCard}>
              <div className={s.l}>{'// PROVABLY FAIR'}</div>
              <div className={s.trustRow}>
                <div className={s.ck}>
                  <CheckIcon />
                </div>
                <div>
                  <div className={s.tt}>COMMIT &amp; REVEAL</div>
                  <div className={s.td}>{t.trust_commit}</div>
                </div>
              </div>
              <div className={s.trustRow}>
                <div className={s.ck}>
                  <CheckIcon />
                </div>
                <div>
                  <div className={s.tt}>USDT ON POLYGON</div>
                  <div className={s.td}>{t.trust_usdt}</div>
                </div>
              </div>
              <div className={s.trustRow}>
                <div className={s.ck}>
                  <CheckIcon />
                </div>
                <div>
                  <div className={s.tt}>OPEN LEDGER</div>
                  <div className={s.td}>{t.trust_ledger}</div>
                </div>
              </div>
            </div>
          </div>
          {/* how it works */}
          <div>
            <div className={s.eyebrow} style={{ color: '#8f8ac2' }}>
              HOW IT WORKS
            </div>
            <h2 className={s.h2}>
              Play Game <span className={s.cy}>Flow</span>
            </h2>
            <div className={s.stepGrid}>
              <div className={`${s.step} ${s.cyan}`}>
                <div className={s.no} style={{ color: '#00eaff' }}>
                  01
                </div>
                <div className={s.t}>{t.step01_t}</div>
                <div className={s.d}>{t.step01_d}</div>
              </div>
              <div className={s.step}>
                <div className={s.no} style={{ color: '#ff2dc4' }}>
                  02
                </div>
                <div className={s.t}>{t.step02_t}</div>
                <div className={s.d}>
                  {t.step02_da}<LocalRaceTime lang={lang} />{t.step02_db}
                </div>
              </div>
              <div className={s.step}>
                <div className={s.no} style={{ color: '#ff6fd0' }}>
                  03
                </div>
                <div className={s.t}>{t.step03_t}</div>
                <div className={s.d}>{t.step03_d}</div>
              </div>
              <div className={s.step}>
                <div className={s.no} style={{ color: '#c6ff3a' }}>
                  04
                </div>
                <div className={s.t}>{t.step04_t}</div>
                <div className={s.d}>{t.step04_d}</div>
              </div>
              <div className={`${s.step} ${s.gold}`}>
                <div className={s.no} style={{ color: '#c9a86a' }}>
                  05
                </div>
                <div className={s.t}>{t.step05_t}</div>
                <div className={s.d}>{t.step05_d}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== ③ これは厩舎のゲームである ===== */}
      <LandingReveal className={`${s.section} ${s.reveal}`} inClassName={`${s.in}`}>
        <div className={s.secHead}>
          <span className={`${s.kick} ${s.gd}`}>
            <span className={s.kdot} style={{ background: '#c9a86a' }} />
            YOU ARE THE STABLE OWNER
          </span>
          <h2 className={s.h2} style={{ marginTop: 14 }}>
            {t.s3_h2}
          </h2>
          <p className={s.lead}>{t.s3_lead}</p>
        </div>
        <div className={s.stableRail}>
          {stableHorses.map((h, i) => {
            const f = stableLooks[i]!;
            return (
              <div key={i} className={s.stableTile}>
                <div className={s.art}>
                  <NftHorseArt look={f} />
                </div>
                <div className={s.plate}>
                  <span className={s.nm}>{h.name}</span>
                  <span className={s.rr} style={{ color: f.frameLine, border: `1px solid ${f.frameGlow}` }}>
                    {showcaseTotal(h)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.qCards}>
          <div className={s.qCard}>
            <div className={s.rule} style={{ background: 'linear-gradient(90deg,#00eaff,transparent)' }} />
            <div className={s.ico} style={{ color: '#00eaff', borderColor: 'rgba(0,234,255,.4)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 3 8l9 5 9-5-9-5Z" />
                <path d="M3 13l9 5 9-5" />
              </svg>
            </div>
            <h3>{t.q1_h}</h3>
            <p>{t.q1_p}</p>
            <span className={s.ghost} style={{ color: '#00eaff' }}>
              01
            </span>
          </div>
          <div className={s.qCard}>
            <div className={s.rule} style={{ background: 'linear-gradient(90deg,#ff2dc4,transparent)' }} />
            <div className={s.ico} style={{ color: '#ff8fe4', borderColor: 'rgba(255,45,196,.4)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3.4" />
                <path d="M12 1v3M12 20v3M1 12h3M20 12h3" strokeLinecap="round" />
              </svg>
            </div>
            <h3>{t.q2_h}</h3>
            <p>{t.q2_p}</p>
            <span className={s.ghost} style={{ color: '#ff2dc4' }}>
              02
            </span>
          </div>
          <div className={s.qCard}>
            <div className={s.rule} style={{ background: 'linear-gradient(90deg,#c9a86a,transparent)' }} />
            <div className={s.ico} style={{ color: '#f2e4bf', borderColor: 'rgba(201,168,106,.4)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
                <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" />
              </svg>
            </div>
            <h3>{t.q3_h}</h3>
            <p>{t.q3_p}</p>
            <span className={s.ghost} style={{ color: '#c9a86a' }}>
              03
            </span>
          </div>
        </div>
        <p className={s.closing}>{t.s3_closing}</p>
      </LandingReveal>

      {/* ===== ④ 毎晩20:00、全馬一斉の巨大レース ===== */}
      <LandingReveal className={`${s.section} ${s.reveal}`} inClassName={`${s.in}`}>
        <div className={s.secHead}>
          <span className={`${s.kick} ${s.cy}`}>
            <span className={s.kdot} style={{ background: '#00eaff' }} />
            THE DAILY DERBY — 8:00 & 20:00 MYT
          </span>
          <h2 className={s.h2} style={{ marginTop: 14 }}>
            {t.s4_h2}
          </h2>
          <p className={s.lead}>
            {t.s4_lead_a}
            <b style={{ color: '#00eaff' }}>
              <LocalRaceTime lang={lang} />
            </b>
            {t.s4_lead_b}
          </p>
        </div>
        <div className={s.showWrap}>
          <div className={s.showPanel}>
            <div className={s.showTop}>
              <div className={s.showTitle}>
                <span className={s.liveDot} />
                THE DAILY DERBY <span className={s.cyd}>· RACE TURN</span>
              </div>
              <div className={s.showCount}>
                <div>
                  <div className={`${s.cN} ${s.bad}`}>1,403</div>
                  <div className={s.cK}>BURNED</div>
                </div>
                <div>
                  <div className={`${s.cN} ${s.good}`}>19,646</div>
                  <div className={s.cK}>SURVIVED</div>
                </div>
              </div>
            </div>
            <div className={s.floodGrid}>
              <div className={s.floodCol}>
                <div className={s.floodTrack}>
                  {[0, 1].map((rep) => (
                    <div key={rep} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {floodLines.map((line, i) => (
                        <div key={i} className={s.logLine}>
                          <span className={s.st}>SRVD</span>
                          <span className={s.idn}>#{line.id}</span>
                          <span className={s.nmn}>{line.name}</span>
                          <span className={s.dy}>
                            LV.{line.day} → LV.{line.day + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className={s.myLane}>
                <div className={s.myLaneH}>MY LANE — {t.mylane_yours}</div>
                <div className={`${s.myEv} ${s.champ}`}>
                  <div className={s.mn}>Golden Wind</div>
                  <div className={s.ms}>{t.ev_champ}</div>
                </div>
                <div className={`${s.myEv} ${s.survive}`}>
                  <div className={s.mn}>Azure Comet</div>
                  <div className={s.ms}>{t.ev_survive}</div>
                </div>
                <div className={`${s.myEv} ${s.burn}`}>
                  <div className={s.mn}>Crimson Nova</div>
                  <div className={s.ms}>{t.ev_burn}</div>
                </div>
              </div>
            </div>
          </div>
          <div className={s.showSide}>
            <LandingReveal className={`${s.fcCard}`} inClassName={`${s.in}`} threshold={0.3}>
              <div className={s.fcTag}>{t.fc_tag}</div>
              <div className={s.fcTitle}>{t.fc_title}</div>
              <div className={s.fcRow}>
                <div className={s.fcChip}>
                  <div className={s.k}>{t.fc_weather_k}</div>
                  <div className={`${s.v} ${s.cy}`}>{t.fc_weather_v}</div>
                </div>
                <div className={s.fcChip}>
                  <div className={s.k}>{t.fc_track_k}</div>
                  <div className={`${s.v} ${s.gd}`}>{t.fc_track_v}</div>
                </div>
                <div className={s.fcChip}>
                  <div className={s.k}>{t.fc_course_k}</div>
                  <div className={`${s.v} ${s.gr}`}>{t.fc_course_v}</div>
                </div>
              </div>
              <div className={s.fcNote}>
                <b>{t.fc_note_b}</b>
                <br />
                {t.fc_note_rest}
              </div>
            </LandingReveal>
            <div className={s.nextRaceCard}>
              <div className={s.l}>{'// NEXT POST 8:00 & 20:00 MYT'}</div>
              <Countdown className={s.nrCd} />
              <div className={s.nrNote}>{t.next_race_note}</div>
            </div>
          </div>
        </div>
      </LandingReveal>

      {/* ===== ⑤ レースの後は、取引の時間 ===== */}
      <LandingReveal className={`${s.section} ${s.reveal}`} inClassName={`${s.in}`}>
        <div className={s.secHead}>
          <span className={`${s.kick} ${s.mg}`}>
            <span className={s.kdot} style={{ background: '#ff2dc4' }} />
            AFTER THE RACE — TRADE TIME
          </span>
          <h2 className={s.h2} style={{ marginTop: 14 }}>
            {t.s5_h2}
          </h2>
        </div>
        <div className={s.featureRow}>
          <div className={s.panelCard}>
            <p className={s.p} style={{ margin: 0 }}>{t.s5_p}</p>
          </div>
          <div className={s.panelCard}>
            <div className={s.eyebrow} style={{ color: '#8f8ac2', fontSize: 10 }}>
              VALUE PER SURVIVED NIGHT
            </div>
            <div className={s.priceLadder}>
              <div className={s.pStep}>
                <div className={s.pv}>100</div>
                <div className={s.pd}>LV.0</div>
              </div>
              <span className={s.pArrow}>▲</span>
              <div className={`${s.pStep} ${s.up}`}>
                <div className={s.pv}>110</div>
                <div className={s.pd}>LV.1</div>
              </div>
              <span className={s.pArrow}>▲</span>
              <div className={`${s.pStep} ${s.up}`}>
                <div className={s.pv}>121</div>
                <div className={s.pd}>LV.2</div>
              </div>
              <span className={s.pArrow}>▲</span>
              <div className={`${s.pStep} ${s.up}`}>
                <div className={s.pv}>…</div>
                <div className={s.pd}>LV.3+</div>
              </div>
            </div>
            <p className={s.p} style={{ margin: '16px 0 0', fontSize: 12.5, color: '#8f8ac2' }}>
              {t.s5_p2}
            </p>
          </div>
        </div>
      </LandingReveal>

      {/* ===== ⑥ DAY7 チャンピオン ===== */}
      <LandingReveal className={`${s.section} ${s.reveal}`} inClassName={`${s.in}`}>
        <div className={s.secHead}>
          <span className={`${s.kick} ${s.gd}`}>
            <span className={s.kdot} style={{ background: '#c9a86a' }} />
            LV.7 — CHAMPION
          </span>
          <h2 className={s.h2} style={{ marginTop: 14 }}>
            {t.s6_h2}
          </h2>
        </div>
        <div className={s.featureRow}>
          <div className={s.champCard}>
            <svg className={s.crown} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
              <path d="M6 36 4 14l10 8L24 8l10 14 10-8-2 22Z" />
              <path d="M6 40h36" strokeLinecap="round" />
            </svg>
            <div className={s.champBig}>
              200 USDT<small>{t.champ_small}</small>
            </div>
            <p className={s.p} style={{ marginTop: 16 }}>{t.s6_p}</p>
          </div>
          <div className={s.leagueCard}>
            <span className={s.comingBadge}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c9a86a', display: 'inline-block' }} />
              COMING SOON
            </span>
            <h3>CHAMPION LEAGUE</h3>
            <p className={s.p} style={{ margin: 0 }}>{t.league_p}</p>
          </div>
        </div>
      </LandingReveal>

      {/* ===== ⑦ 仲間の厩舎を、支えよう ===== */}
      <LandingReveal className={`${s.section} ${s.reveal}`} inClassName={`${s.in}`}>
        <div className={s.secHead}>
          <span className={`${s.kick} ${s.mg}`}>
            <span className={s.kdot} style={{ background: '#ff2dc4' }} />
            TEAM — SUPPORT BONUS
          </span>
          <h2 className={s.h2} style={{ marginTop: 14 }}>
            {t.s7_h2}
          </h2>
        </div>
        <div className={s.featureRow}>
          <div className={s.panelCard}>
            <p className={s.p} style={{ margin: 0 }}>
              {t.s7_pa}<b style={{ color: '#ff8fe4' }}>{t.s7_support}</b>{t.s7_pb}
            </p>
          </div>
          <div className={s.teamDiag}>
            <div className={s.teamNodes}>
              <div className={s.tNode}>
                <div className={s.disc}>
                  <NftHorseArt look={stableLooks[0]!} />
                </div>
                <div className={s.lbl}>{t.team_mate}</div>
              </div>
              <div className={`${s.tNode} ${s.champ}`}>
                <div className={s.disc}>
                  <NftHorseArt look={stableLooks[1]!} />
                </div>
                <div className={s.lbl}>CHAMPION</div>
              </div>
              <div className={`${s.tNode} ${s.center}`}>
                <div className={s.disc}>
                  <NftHorseArt look={stableLooks[2]!} />
                </div>
                <div className={s.lbl}>{t.team_center}</div>
              </div>
              <div className={s.tNode}>
                <div className={s.disc}>
                  <NftHorseArt look={stableLooks[3]!} />
                </div>
                <div className={s.lbl}>{t.team_mate}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span className={s.supportBadge}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21C5 16 3 12 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 12 19 16 12 21Z" />
                </svg>
                SUPPORT BONUS → TEAM
              </span>
            </div>
          </div>
        </div>
      </LandingReveal>

      {/* ===== ⑧ マーケットプレイス・ショーケース ===== */}
      <LandingReveal className={`${s.section} ${s.reveal}`} inClassName={`${s.in}`} id="collection">
        <div className={s.secHead}>
          <span className={`${s.kick} ${s.cy}`}>
            <span className={s.kdot} style={{ background: '#00eaff' }} />
            MARKETPLACE — SHOWCASE
          </span>
          <h2 className={s.h2} style={{ marginTop: 14 }}>
            {t.s8_h2}
          </h2>
          <div className={s.showcaseNote}>
            <span className={s.dot} />
            SHOWCASE — {t.showcase_note_rest}
          </div>
        </div>
        <div className={s.galGrid}>
          {horses.map((h, i) => {
            const f = looks[i]!;
            // 実在の購入価格のみ表示: 新規Mint=102(価格100+手数料2)、P2PはDAY毎の
            // ラダー価格そのまま(2%手数料は売り手側控除 = Decision 069)。
            const day = i === 0 ? 0 : ((i - 1) % 6) + 1;
            const price = day === 0 ? DAY0_MINT_TOTAL_CHARGE : PRICE_TABLE_V1[day] ?? '100.00';
            return (
              <div
                key={i}
                className={s.galCard}
                style={{ ['--rar-glow']: f.frameGlow, ['--rar-line']: f.frameLine, borderColor: f.frameGlow } as CSSProperties}
              >
                <div className={s.art} style={{ background: `radial-gradient(90% 80% at 50% 42%, ${f.framePanel}, transparent 70%)` }}>
                  <span className={s.id} style={{ color: f.frameLine }}>
                    {h.id}
                  </span>
                  <span className={s.lk}>♡ {h.likes}</span>
                  <span className={s.rib} style={{ background: h.rarityRibbon, color: h.rarityInk }}>
                    TOTAL {showcaseTotal(h)}
                  </span>
                  <NftHorseArt look={f} />
                </div>
                <div className={s.body}>
                  <div className={s.gnm}>
                    <span className={s.gnmT}>{h.name}</span>
                    <span style={{ color: '#00eaff', fontSize: 11 }}>✓</span>
                  </div>
                  <div className={s.meta}>
                    <span className={s.type} style={{ color: TYPE_COLOR[h.type], borderColor: TYPE_COLOR[h.type] }}>
                      {h.type}
                    </span>
                    <span className={s.rank}>RANK {h.rank}</span>
                  </div>
                  <div className={s.priceRow}>
                    <div>
                      <div className={s.pl}>{day === 0 ? t.mint_label : 'P2P PRICE'}</div>
                      <div className={s.pv}>
                        {price} <span className={s.u}>USDT</span>
                      </div>
                    </div>
                    <span className={s.last}>LV.{day}</span>
                  </div>
                  <GoogleLoginButton label={t.login_buy} className={`${s.galGoogle}`} />
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.colMore}>
          <GoogleLoginButton unstyled>{t.see_all}</GoogleLoginButton>
        </div>
      </LandingReveal>

      {/* ===== ⑨ 台帳 ===== */}
      <LandingReveal className={`${s.section} ${s.reveal}`} inClassName={`${s.in}`} id="economy">
        <div className={s.secHead}>
          <span className={`${s.kick} ${s.gd}`}>
            <span className={s.kdot} style={{ background: '#c9a86a' }} />
            PUBLIC LEDGER — PROVABLY FAIR
          </span>
          <h2 className={s.h2} style={{ marginTop: 14 }}>
            {t.s9_h2}
          </h2>
          <p className={s.lead}>
            {t.s9_lead_a}
            <b style={{ color: '#f2e4bf' }}>{t.s9_lead_b}</b>{' '}
            {t.s9_lead_c}
          </p>
        </div>
        <div className={s.ledgerWrap}>
          <div className={s.ledgerCells}>
            <div className={s.cell}>
              <div className={`${s.n} ${s.cy}`}>{t.ledger_a_n}</div>
              <div className={s.k}>{t.ledger_a_k}</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.n} ${s.go}`}>CSV</div>
              <div className={s.k}>{t.ledger_b_k}</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.n} ${s.gr}`}>{t.ledger_c_n}</div>
              <div className={s.k}>{t.ledger_c_k}</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.n} ${s.mg}`}>{t.ledger_d_n}</div>
              <div className={s.k}>{t.ledger_d_k}</div>
            </div>
          </div>
          <div className={s.ledgerViz}>
            <div className={s.lvH}>
              <span>DAILY LEDGER</span>
              <span>DAY 01 — 28</span>
            </div>
            <div className={s.calGrid}>
              {Array.from({ length: 28 }, (_, idx) => {
                const day = idx + 1;
                const cls =
                  day % 7 === 0 ? `${s.calCell} ${s.gold}` : CAL_OFF_DAYS.has(day) ? s.calCell : `${s.calCell} ${s.on}`;
                return (
                  <div key={day} className={cls}>
                    {day}
                  </div>
                );
              })}
            </div>
            <div className={s.csvRow}>
              <span className={s.fbtn}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12M7 11l5 4 5-4M5 21h14" />
                </svg>
                results.csv
              </span>
              <span>{t.csv_note}</span>
            </div>
          </div>
        </div>
      </LandingReveal>

      {/* ===== ⑩ FINAL CTA ===== */}
      <LandingReveal className={`${s.finalWrap} ${s.reveal}`} inClassName={`${s.in}`}>
        <div className={s.beams} />
        <div className={s.trackLines} />
        <div className={s.finalGhost}>SEVEN DAYS</div>
        <div className={s.finalInner}>
          <div className={s.finalLeft}>
            <div className={s.finalKick}>
              <span className={s.dot} />
              JOIN THE NEXT RACE
            </div>
            <h2>
              {t.s10_h2a}
              <br />
              {t.s10_h2b}
            </h2>
            <div>
              <GoogleLoginButton size="lg" label={t.login_own} />
            </div>
            <p className={s.p} style={{ margin: '18px 0 0', maxWidth: 'none' }}>
              {t.s10_p}
            </p>
            <div className={s.fine}>USDT · POLYGON · PROVABLY FAIR</div>
          </div>

          <div className={s.gateWrap}>
            <span className={s.gateGlow} />
            <div className={s.gateCard}>
              <div className={s.goldbar} />
              <div className={s.gateArt}>
                <span className={s.gnum}>GATE 08</span>
                <span className={s.gopen}>READY</span>
                <span className={s.aura} />
                {/* まだ迎えていない一頭 = 実アートのシルエット(案1・2026-07-11オーナー選定) */}
                <div className={s.gateHorse}>
                  <NftHorseArt look={stableLooks[4]!} />
                  <span className={s.phLabel}>YOUR NFT — MINTED AT SIGN-UP</span>
                </div>
                <div className={s.gateBars}>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className={s.gatePlate}>
                <div>
                  <div className={s.gpt}>YOUR STALL · LV.0</div>
                  <div className={s.gpn}>{t.gate_name}</div>
                </div>
                <span className={s.gpTag}>{t.gate_slot}</span>
              </div>
              <div className={s.gateTimer}>
                <span className={s.gtl}>{'// GATE OPENS IN'}</span>
                <Countdown className={s.gtv} />
              </div>
              {/* 今夜の出走枠(実データ・Decision 093)。少頭数の夜ほどBURN枠が
                  小さいことが一目で分かる — floor則の帰結なので誇張なし。 */}
              {tonightField && (
                <div className={s.gateField}>
                  <span>
                    {t.field_entrants_a}<b>{tonightField.entrants}</b>{t.field_entrants_u}
                  </span>
                  <span className={s.gfBurn}>
                    {t.field_burn_a}<b>{tonightField.min === tonightField.max ? tonightField.max : `${tonightField.min}〜${tonightField.max}`}</b>{t.field_burn_u}
                  </span>
                  <span className={s.gfLive}>
                    <span className={s.gfDot} />
                    LIVE DATA
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </LandingReveal>

      {/* ===== FOOTER ===== */}
      <div className={s.foot}>
        <div className={s.fb}>
          <span className={s.bar} />
          <span className={s.lock}>
            <span className={s.l1}>SEVEN&nbsp;DAYS</span>
            <span className={s.l2}>DERBY</span>
          </span>
        </div>
        <div className={s.links}>
          <span>Whitepaper</span>
          <Link href="/docs">Docs</Link>
          <span>Discord</span>
          <span>X</span>
          <span>Contract</span>
        </div>
        <div className={s.cpy}>© 2026 Seven Days Derby · Deterministic · Auditable</div>
      </div>
    </div>
  );
}
