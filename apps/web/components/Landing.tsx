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
import s from './landing.module.css';

/**
 * 公開ランディング(LPリデザイン 2026-07-11)。
 * 正典: LPリデザイン.zip / handoff-lp(①②は旧実装の忠実再現・③〜⑩が新設)。
 * 正典のプレースホルダ馬アートは NftHorseArt / manus 実アートに差し替え。
 * コピーは lp_redesign/LP_REDESIGN_BRIEF.md のレッドライン準拠
 * (率の宣言なし・架空統計なし・SHOWCASE明示・禁止語彙なし)。
 */

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

export function Landing() {
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
          <Link href="#how">遊び方</Link>
          <Link href="#collection">コレクション</Link>
          <Link href="#economy">エコノミー</Link>
        </div>
        <GoogleLoginButton size="sm" label="Google でログイン" />
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
            <p className={s.hlead}>
              7日間を、走り抜け。全馬が一斉に発走。下位はBurn、生き残った馬は毎日価値が高まる。P2Pで売買。
            </p>
            <div className={s.hsub}>Provably fair. Fully replayable. No AI winners.</div>
            <div className={s.hbtns}>
              {/* ヒーローのデザインは変更禁止 — 見た目そのまま、動作だけGoogle直起動 */}
              <GoogleLoginButton unstyled className={s.btnPrimary}>
                馬を迎える ▶
              </GoogleLoginButton>
              <Link href="#how">
                <button className={s.btnGhost}>遊び方を見る</button>
              </Link>
            </div>
            <div className={s.hstats}>
              <div>
                <div className={`${s.n} ${s.go}`}>200 USDT</div>
                <div className={s.k}>DAY7 CHAMPION</div>
              </div>
              <div>
                <div className={`${s.n} ${s.cy}`}>7 DAYS</div>
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
                  <span className={`${s.tag} ${s.gold}`}>LEGENDARY</span>
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
              <div className={s.l}>{'// NEXT POST 20:00 MYT'}</div>
              <Countdown className={s.cd} />
              <div className={s.s}>
                <LocalPostTime />
              </div>
              <GoogleLoginButton label="Google でレースに参加" />
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
                  <div className={s.td}>結果は事前にコミットされ、後から検証できる。</div>
                </div>
              </div>
              <div className={s.trustRow}>
                <div className={s.ck}>
                  <CheckIcon />
                </div>
                <div>
                  <div className={s.tt}>USDT ON POLYGON</div>
                  <div className={s.td}>賞金はオンチェーンで受け取る。</div>
                </div>
              </div>
              <div className={s.trustRow}>
                <div className={s.ck}>
                  <CheckIcon />
                </div>
                <div>
                  <div className={s.tt}>OPEN LEDGER</div>
                  <div className={s.td}>全レースの記録は台帳で公開、CSVで検証可能。</div>
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
                <div className={s.t}>馬を迎える</div>
                <div className={s.d}>購入を申し込むと自動でマッチング。出走中の馬(P2P)を優先、在庫が足りなければ新規Mint(102 USDT=価格100+手数料2)。価格は割当先次第。</div>
              </div>
              <div className={s.step}>
                <div className={s.no} style={{ color: '#ff2dc4' }}>
                  02
                </div>
                <div className={s.t}>調教して出走</div>
                <div className={s.d}>
                  レース前に1日1回だけ調教できます。毎晩 <LocalRaceTime />、すべての馬が一斉に走ります。
                </div>
              </div>
              <div className={s.step}>
                <div className={s.no} style={{ color: '#ff6fd0' }}>
                  03
                </div>
                <div className={s.t}>生存 or Burn</div>
                <div className={s.d}>1日1回レース開催。毎晩1回、存在する全ての馬が一斉にレース出走。成績下位の馬はBurnで消滅(全記録は台帳で公開)。生き残り馬は価値が高まり翌日のレースへ。</div>
              </div>
              <div className={s.step}>
                <div className={s.no} style={{ color: '#c6ff3a' }}>
                  04
                </div>
                <div className={s.t}>P2P売買</div>
                <div className={s.d}>生き残り馬は価値が高まったままP2P売買に自動利確。馬の所有者は即座にUSDTになります。</div>
              </div>
              <div className={`${s.step} ${s.gold}`}>
                <div className={s.no} style={{ color: '#c9a86a' }}>
                  05
                </div>
                <div className={s.t}>Day7 → チャンピオン</div>
                <div className={s.d}>7日走り切れば200 USDTを7回で受取。完済で記念NFTになります。</div>
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
            これは、厩舎のゲームだ。
          </h2>
          <p className={s.lead}>あなたは厩舎のオーナー。あなたが迎える馬が、あなたの7日間を決める。</p>
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
                    {h.rarity}
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
            <h3>集める</h3>
            <p>マイ厩舎に、有能な馬をどれだけ揃えられるか。</p>
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
            <h3>狙う</h3>
            <p>チャンピオンになる馬を、見抜けるか。</p>
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
            <h3>守る</h3>
            <p>BURNされない馬を、走らせ続けられるか。</p>
            <span className={s.ghost} style={{ color: '#c9a86a' }}>
              03
            </span>
          </div>
        </div>
        <p className={s.closing}>買う・鍛える・走らせる・手放す。すべての判断が、あなたの厩舎の物語になる。</p>
      </LandingReveal>

      {/* ===== ④ 毎晩20:00、全馬一斉の巨大レース ===== */}
      <LandingReveal className={`${s.section} ${s.reveal}`} inClassName={`${s.in}`}>
        <div className={s.secHead}>
          <span className={`${s.kick} ${s.cy}`}>
            <span className={s.kdot} style={{ background: '#00eaff' }} />
            THE DAILY DERBY — 20:00 MYT
          </span>
          <h2 className={s.h2} style={{ marginTop: 14 }}>
            毎晩20:00、全馬一斉の巨大レース。
          </h2>
          <p className={s.lead}>
            あなたの国では{' '}
            <b style={{ color: '#00eaff' }}>
              毎晩 <LocalRaceTime />
            </b>{' '}
            — マイ厩舎の馬は、毎晩デイリーダービーに出走する。勝ち残った馬は価値が上がり(100 → 110 → 121 → …)、敗れた馬はBURN — 消滅する。
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
                            DAY {line.day} → DAY {line.day + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className={s.myLane}>
                <div className={s.myLaneH}>MY LANE — あなたの馬</div>
                <div className={`${s.myEv} ${s.champ}`}>
                  <div className={s.mn}>Golden Wind</div>
                  <div className={s.ms}>DAY7 走破 — CHAMPION</div>
                </div>
                <div className={`${s.myEv} ${s.survive}`}>
                  <div className={s.mn}>Azure Comet</div>
                  <div className={s.ms}>DAY3 → DAY4 生存</div>
                </div>
                <div className={`${s.myEv} ${s.burn}`}>
                  <div className={s.mn}>Crimson Nova</div>
                  <div className={s.ms}>DAY2 — BURN</div>
                </div>
              </div>
            </div>
          </div>
          <div className={s.showSide}>
            <LandingReveal className={`${s.fcCard}`} inClassName={`${s.in}`} threshold={0.3}>
              <div className={s.fcTag}>— 明日の予報 —</div>
              <div className={s.fcTitle}>
                レースの最後には、
                <br />
                「明日の予報」が発表される。
              </div>
              <div className={s.fcRow}>
                <div className={s.fcChip}>
                  <div className={s.k}>天候</div>
                  <div className={`${s.v} ${s.cy}`}>雨</div>
                </div>
                <div className={s.fcChip}>
                  <div className={s.k}>馬場</div>
                  <div className={`${s.v} ${s.gd}`}>稍重</div>
                </div>
                <div className={s.fcChip}>
                  <div className={s.k}>コース</div>
                  <div className={`${s.v} ${s.gr}`}>芝</div>
                </div>
              </div>
              <div className={s.fcNote}>
                <b>予報が見られるのは、毎晩のレースの中だけ。</b>
                <br />
                だから、毎晩見る理由がある。予報は参考情報で、結果を保証するものではありません。
              </div>
            </LandingReveal>
            <div className={s.nextRaceCard}>
              <div className={s.l}>{'// NEXT POST 20:00 MYT'}</div>
              <Countdown className={s.nrCd} />
              <div className={s.nrNote}>この時間だけ、明日の予報が出る。</div>
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
            走った馬は、売れる。
          </h2>
        </div>
        <div className={s.featureRow}>
          <div className={s.panelCard}>
            <p className={s.p} style={{ margin: 0 }}>
              毎晩のレースが終わると、マーケットプレイスが開く。生き残ったあなたの馬は、価値が上がった状態で取引される。高く売って利確するか、明日も走らせて更に狙うか、新しい馬を迎えるか — それを決めるのが、厩舎のオーナーの仕事だ。
            </p>
          </div>
          <div className={s.panelCard}>
            <div className={s.eyebrow} style={{ color: '#8f8ac2', fontSize: 10 }}>
              VALUE PER SURVIVED NIGHT
            </div>
            <div className={s.priceLadder}>
              <div className={s.pStep}>
                <div className={s.pv}>100</div>
                <div className={s.pd}>DAY0</div>
              </div>
              <span className={s.pArrow}>▲</span>
              <div className={`${s.pStep} ${s.up}`}>
                <div className={s.pv}>110</div>
                <div className={s.pd}>DAY1</div>
              </div>
              <span className={s.pArrow}>▲</span>
              <div className={`${s.pStep} ${s.up}`}>
                <div className={s.pv}>121</div>
                <div className={s.pd}>DAY2</div>
              </div>
              <span className={s.pArrow}>▲</span>
              <div className={`${s.pStep} ${s.up}`}>
                <div className={s.pv}>…</div>
                <div className={s.pd}>DAY3+</div>
              </div>
            </div>
            <p className={s.p} style={{ margin: '16px 0 0', fontSize: 12.5, color: '#8f8ac2' }}>
              生き残るほど価値が積み上がる。手放す夜は、あなたが選ぶ。
            </p>
          </div>
        </div>
      </LandingReveal>

      {/* ===== ⑥ DAY7 チャンピオン ===== */}
      <LandingReveal className={`${s.section} ${s.reveal}`} inClassName={`${s.in}`}>
        <div className={s.secHead}>
          <span className={`${s.kick} ${s.gd}`}>
            <span className={s.kdot} style={{ background: '#c9a86a' }} />
            DAY7 — CHAMPION
          </span>
          <h2 className={s.h2} style={{ marginTop: 14 }}>
            7晩勝ち残った馬は、チャンピオンになる。
          </h2>
        </div>
        <div className={s.featureRow}>
          <div className={s.champCard}>
            <svg className={s.crown} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
              <path d="M6 36 4 14l10 8L24 8l10 14 10-8-2 22Z" />
              <path d="M6 40h36" strokeLinecap="round" />
            </svg>
            <div className={s.champBig}>
              200 USDT<small>7日間にわたって賞金を受け取り、合計200 USDT。</small>
            </div>
            <p className={s.p} style={{ marginTop: 16 }}>
              チャンピオン馬はもうレースを走らない。マーケットにも出ない。走り切った証は、記念NFTとして厩舎に残る。
            </p>
          </div>
          <div className={s.leagueCard}>
            <span className={s.comingBadge}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c9a86a', display: 'inline-block' }} />
              COMING SOON
            </span>
            <h3>CHAMPION LEAGUE</h3>
            <p className={s.p} style={{ margin: 0 }}>
              アクティブユーザー10,000人到達で開幕。チャンピオン馬を持つ厩舎だけが出られる週次リーグ戦。毎週、賞金がかかる。
            </p>
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
            負けた夜こそ、チームの出番だ。
          </h2>
        </div>
        <div className={s.featureRow}>
          <div className={s.panelCard}>
            <p className={s.p} style={{ margin: 0 }}>
              あなたの厩舎は、仲間を招いてチームを作れる。仲間の馬が夜のレースでBURNされたとき、チームには<b style={{ color: '#ff8fe4' }}>サポートボーナス</b>が配られる。誰かの敗北が、チーム全体の支えになる仕組みだ。仲間がBURNされても、そこで終わりじゃない — チームの中から、次のチャンピオンを送り出そう。
            </p>
          </div>
          <div className={s.teamDiag}>
            <div className={s.teamNodes}>
              <div className={s.tNode}>
                <div className={s.disc}>
                  <NftHorseArt look={stableLooks[0]!} />
                </div>
                <div className={s.lbl}>仲間</div>
              </div>
              <div className={`${s.tNode} ${s.burned}`}>
                <div className={s.disc}>
                  <NftHorseArt look={stableLooks[1]!} />
                </div>
                <div className={s.lbl}>BURN</div>
              </div>
              <div className={`${s.tNode} ${s.center}`}>
                <div className={s.disc}>
                  <NftHorseArt look={stableLooks[2]!} />
                </div>
                <div className={s.lbl}>あなたの厩舎</div>
              </div>
              <div className={s.tNode}>
                <div className={s.disc}>
                  <NftHorseArt look={stableLooks[3]!} />
                </div>
                <div className={s.lbl}>仲間</div>
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
            厩舎に迎えられる馬たち。
          </h2>
          <div className={s.showcaseNote}>
            <span className={s.dot} />
            SHOWCASE — 実際の出品と価格は、ログイン後のマーケットでご覧いただけます。
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
                    {h.rarity}
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
                      <div className={s.pl}>{day === 0 ? 'MINT · 手数料込' : 'P2P PRICE'}</div>
                      <div className={s.pv}>
                        {price} <span className={s.u}>USDT</span>
                      </div>
                    </div>
                    <span className={s.last}>DAY {day}</span>
                  </div>
                  <GoogleLoginButton label="Google で購入" className={`${s.galGoogle}`} />
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.colMore}>
          <GoogleLoginButton unstyled>すべての出品を見る →</GoogleLoginButton>
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
            すべての記録が、台帳に残る。
          </h2>
          <p className={s.lead}>
            ゲーム内には公開台帳がある。毎晩のレースで何頭が走り、何頭が生き残り、何頭がBURNされたか — 全記録がそのまま公開される。
            <b style={{ color: '#f2e4bf' }}>CSVでダウンロードして、勝率でもなんでも、自由に計算していい。</b>{' '}
            レース結果は事前コミットされたシードから決定論的に計算され、レース後にシードが公開される。誰でも再計算して検証できる。
          </p>
        </div>
        <div className={s.ledgerWrap}>
          <div className={s.ledgerCells}>
            <div className={s.cell}>
              <div className={`${s.n} ${s.cy}`}>台帳</div>
              <div className={s.k}>毎晩公開</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.n} ${s.go}`}>CSV</div>
              <div className={s.k}>ダウンロード可</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.n} ${s.gr}`}>コミット・リビール</div>
              <div className={s.k}>誰でも検証</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.n} ${s.mg}`}>複式簿記</div>
              <div className={s.k}>負残高を構造的に許さない</div>
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
              <span>誰でもダウンロードして再計算できます。</span>
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
              JOIN TONIGHT&apos;S RACE
            </div>
            <h2>
              今日から、あなたは
              <br />
              厩舎のオーナーだ。
            </h2>
            <div>
              <GoogleLoginButton size="lg" label="Google で厩舎を持つ" />
            </div>
            <p className={s.p} style={{ margin: '18px 0 0', maxWidth: 'none' }}>
              Googleアカウントで、すぐに始められます。
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
                  <div className={s.gpt}>YOUR STALL · DAY 0</div>
                  <div className={s.gpn}>まだ名前のない一頭</div>
                </div>
                <span className={s.gpTag}>◇ 枠 空き</span>
              </div>
              <div className={s.gateTimer}>
                <span className={s.gtl}>{'// GATE OPENS IN'}</span>
                <Countdown className={s.gtv} />
              </div>
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
          <span>Docs</span>
          <span>Discord</span>
          <span>X</span>
          <span>Contract</span>
        </div>
        <div className={s.cpy}>© 2026 Seven Days Derby · Deterministic · Auditable</div>
      </div>
    </div>
  );
}
