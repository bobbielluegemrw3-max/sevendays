import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import { LocalPostTime, LocalRaceTime } from '@/components/LocalPostTime';
import { pickShowcase } from '@/lib/horse-visual';
import { pickNftShowcase } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import s from './landing.module.css';

/**
 * Public landing page. Showcase art = Manus full-colour masters (owner-approved
 * quality benchmark, 2026-07-06): the deterministic engine still derives each
 * card's name/type/rarity, but the artwork itself is the native-colour
 * originals until the Plan-E recolour pipeline (full-colour layers + designed
 * hue mapping) lands. See UI_REDESIGN_LOG.md.
 */

const TYPE_COLOR: Record<string, string> = {
  ENDURANCE: '#c6ff3a',
  POWER: '#ff8fe4',
  SPRINTER: '#00eaff',
  BALANCED: '#eae7ff',
  LUCK: '#c9a86a',
};

export function Landing() {
  // Pre-launch showcase: names/prices from the deterministic engine, artwork
  // from the approved NFT-look space (3 archetypes × body × mane, sheets A/B).
  const horses = pickShowcase(8, () => (Math.random() * 0xffffffff) >>> 0);
  const looks = pickNftShowcase(8, () => (Math.random() * 0xffffffff) >>> 0);
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
        <Link href="/login" className={s.navCta}>
          ログイン
        </Link>
      </div>

      {/* ===== HERO ===== */}
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
              <Link href="/login">
                <button className={s.btnPrimary}>馬を迎える ▶</button>
              </Link>
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

      {/* ===== COUNTDOWN + HOW IT WORKS ===== */}
      <div className={s.section} id="how">
        <div className={s.cdHow}>
          {/* countdown */}
          <div className={s.cdCard}>
            <div className={s.l}>// NEXT POST 20:00 MYT</div>
            <Countdown className={s.cd} />
            <div className={s.s}>
              <LocalPostTime />
            </div>
            <Link href="/login">
              <button style={{ width: '100%' }}>レースに参加する</button>
            </Link>
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

      {/* ===== COLLECTION ===== */}
      <div className={s.section} id="collection">
        <div className={s.eyebrow} style={{ color: '#c9a86a' }}>
          COLLECTION
        </div>
        <div className={s.colHead}>
          <div className={s.colId}>
            <span className={s.seal} />
            <div>
              <div className={s.nm}>
                Seven Days Derby<span className={s.chk}>✓</span>
              </div>
              <div className={s.by}>Memorial NFTs on Polygon</div>
            </div>
          </div>
          <div className={s.colStats}>
            <div className={s.st}>
              <div className={`${s.n} ${s.cy}`}>◈ 180</div>
              <div className={s.k}>FLOOR</div>
            </div>
            <div className={s.st}>
              <div className={`${s.n} ${s.go}`}>84.2K</div>
              <div className={s.k}>24H VOL</div>
            </div>
            <div className={s.st}>
              <div className={`${s.n} ${s.go}`}>50K</div>
              <div className={s.k}>ITEMS</div>
            </div>
            <div className={s.st}>
              <div className={`${s.n} ${s.go}`}>12.1K</div>
              <div className={s.k}>OWNERS</div>
            </div>
          </div>
        </div>

        {/* filter bar (faithful to handoff) */}
        <div className={s.filterBar}>
          <div className={s.filterL}>
            <span className={s.buynow}>Buy Now</span>
            <span className={s.all}>All</span>
            <span className={s.sep} />
            <span className={`${s.rc} ${s.leg}`}>LEGENDARY</span>
            <span className={`${s.rc} ${s.epi}`}>EPIC</span>
            <span className={`${s.rc} ${s.rar}`}>RARE</span>
          </div>
          <span className={s.sortBtn}>
            価格が安い順 <span className={s.caret}>▾</span>
          </span>
        </div>

        <div className={s.galGrid}>
          {horses.map((h, i) => {
            const f = looks[i]!;
            return (
            <div key={i} className={s.galWrap} style={{ ['--rar-glow']: f.frameGlow, ['--rar-line']: f.frameLine } as CSSProperties}>
              <div className={s.galCard} style={{ borderColor: f.frameLine }}>
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
                      <div className={s.pl}>PRICE</div>
                      <div className={s.pv}>
                        <span className={s.d}>◈</span> {h.price}
                      </div>
                    </div>
                    <span className={s.last}>last {h.last}</span>
                  </div>
                  <Link href="/login">
                    <button style={{ color: '#0a0813', background: f.frameGrad, border: 'none' }}>購入 · BUY</button>
                  </Link>
                </div>
              </div>
            </div>
            );
          })}
        </div>
        <div className={s.colMore}>
          <Link href="/login">
            <button>すべての出品を見る →</button>
          </Link>
        </div>
      </div>

      {/* ===== ECONOMY ===== */}
      <div className={s.section} id="economy">
        <div className={s.econ}>
          <div className={s.econL}>
            <div className={s.eyebrow} style={{ color: '#c9a86a' }}>
              PROVABLY FAIR ECONOMY
            </div>
            <h2 className={s.h2}>すべての記録が、台帳に残ります</h2>
            <p className={s.p}>
              レース結果は決定論的に計算され、シード公開後は同じ入力から再現できる設計です。勝者や順位をAIが決めることはありません。残高は複式簿記の台帳で管理され、負残高や不整合を構造的に許しません。
            </p>
          </div>
          <div className={s.econR}>
            <div className={s.cell}>
              <div className={`${s.n} ${s.go}`}>
                102<small> USDT</small>
              </div>
              <div className={s.k}>Day0 Mint</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.n} ${s.cy}`}>
                200<small> USDT</small>
              </div>
              <div className={s.k}>Champion Reward</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.n} ${s.gr}`}>7×</div>
              <div className={s.k}>分割払い</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.n} ${s.mg}`}>2%</div>
              <div className={s.k}>P2P Fee</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== FINAL CTA ===== */}
      <div className={s.finalWrap}>
        <div className={s.finalBox}>
          <div className={s.finalInner}>
            <h2>あなたの馬を、迎えよう。</h2>
            <p className={s.p}>ウォレット・Google・メールアドレスで、すぐに始められます。</p>
            <Link href="/login" className={s.finalCta}>
              はじめる ▶
            </Link>
            <div className={s.fine}>USDT · Polygon · deterministic</div>
          </div>
        </div>
      </div>

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
