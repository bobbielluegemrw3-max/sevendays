import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import s from './landing.module.css';

/**
 * Public landing page — faithful conversion of the PC design handoff
 * (Seven Days Derby - LP (PC).dc.html), made responsive.
 *
 * Copy kept natural; numbers kept honest for a pre-launch platform:
 * - mint charge 102 (100 + 2 fee, Decision 069)
 * - the collection stats/cards use real facts and the real day price
 *   ladder — no fabricated floor / 24h volume / owner counts.
 */

const RARITY_STYLE: Record<
  string,
  { border: string; accent: string; ribbon: string; ink: string; panel: string; glow: string }
> = {
  LEGENDARY: {
    border: '#d8b25a',
    accent: 'linear-gradient(90deg,#c9a86a,#f7eccb,#c9a86a)',
    ribbon: 'linear-gradient(92deg,#c9a86a,#f7eccb)',
    ink: '#0a0813',
    panel: 'radial-gradient(90% 80% at 50% 42%,rgba(201,168,106,.2),transparent 70%)',
    glow: 'rgba(201,168,106,.5)',
  },
  EPIC: {
    border: '#ff2dc4',
    accent: 'linear-gradient(90deg,#ff2dc4,#ff8fe4)',
    ribbon: 'linear-gradient(92deg,#ff2dc4,#ff8fe4)',
    ink: '#150410',
    panel: 'radial-gradient(90% 80% at 50% 42%,rgba(255,45,196,.18),transparent 70%)',
    glow: 'rgba(255,45,196,.45)',
  },
  RARE: {
    border: '#00eaff',
    accent: 'linear-gradient(90deg,#00eaff,#a9f6ff)',
    ribbon: 'linear-gradient(92deg,#00eaff,#a9f6ff)',
    ink: '#04141a',
    panel: 'radial-gradient(90% 80% at 50% 42%,rgba(0,234,255,.16),transparent 70%)',
    glow: 'rgba(0,234,255,.45)',
  },
};
const TYPE_COLOR: Record<string, string> = {
  ENDURANCE: '#c6ff3a',
  POWER: '#ff8fe4',
  SPRINTER: '#00eaff',
  BALANCED: '#eae7ff',
  LUCK: '#c9a86a',
};

// Real day-based price ladder (PRICE_TABLE_V1). Honest showcase prices.
const DAY_PRICE = ['100', '110', '121', '133', '146', '161', '177'];

const GALLERY = [
  { id: '#0001', name: 'Royal Thunder', img: '/horses/hero.png', type: 'ENDURANCE', rarity: 'LEGENDARY', day: 5 },
  { id: '#0007', name: 'Solaris Flare', img: '/horses/chrome.png', type: 'POWER', rarity: 'EPIC', day: 3 },
  { id: '#0142', name: 'Glacier Rush', img: '/horses/gold.png', type: 'SPRINTER', rarity: 'RARE', day: 2 },
  { id: '#0311', name: 'Nocturne Ex', img: '/horses/onyx.png', type: 'BALANCED', rarity: 'RARE', day: 6 },
  { id: '#1024', name: 'Void Comet', img: '/horses/hero.png', type: 'ENDURANCE', rarity: 'LEGENDARY', day: 4 },
  { id: '#0781', name: 'Aureus Bolt', img: '/horses/chrome.png', type: 'POWER', rarity: 'EPIC', day: 1 },
  { id: '#0605', name: 'Plasma Dash', img: '/horses/onyx.png', type: 'LUCK', rarity: 'RARE', day: 3 },
  { id: '#1330', name: 'Cryo Surge', img: '/horses/gold.png', type: 'SPRINTER', rarity: 'RARE', day: 5 },
];

export function Landing() {
  return (
    <div className={s.page}>
      <span className={s.hairline} />

      {/* ===== NAV ===== */}
      <div className={s.nav}>
        <div className={s.brand}>
          <span className={s.bar} />
          <span className={s.nm}>SEVEN&nbsp;DERBY</span>
        </div>
        <div className={s.navMenu}>
          <Link href="#how">遊び方</Link>
          <Link href="#collection">コレクション</Link>
          <Link href="#economy">エコノミー</Link>
        </div>
        <Link href="/login" className={s.navCta}>
          はじめる
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
              WEB3 HORSE RACING · ON-CHAIN
            </span>
            <h1 className={s.htitle}>
              <span className={s.l1}>SEVEN&nbsp;DAYS</span>
              <span className={s.l2}>DERBY</span>
            </h1>
            <p className={s.hlead}>
              毎晩20時、その日のすべての馬が1つのレースを走ります。下位はBurn、勝ち残った馬はDay7で200
              USDTの買い戻しへ。結果はすべてオンチェーンに記録され、誰でも検証できます。
            </p>
            <div className={s.hsub}>Every horse is an on-chain NFT. Every race is verifiable.</div>
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
                <div className={s.k}>DAY7 BUYBACK</div>
              </div>
              <div>
                <div className={`${s.n} ${s.cy}`}>7 DAYS</div>
                <div className={s.k}>TO GLORY</div>
              </div>
              <div>
                <div className={`${s.n} ${s.gr}`}>0 AI</div>
                <div className={s.k}>IN RESULTS</div>
              </div>
            </div>
          </div>

          {/* right featured NFT card */}
          <div className={s.featCard}>
            <div className={s.gold} />
            <div className={s.art}>
              <span className={s.idl}>#0001</span>
              <span className={s.idr}>GENESIS</span>
              <span className={s.aura} />
              <img src="/horses/hero.png" alt="Royal Thunder — genesis cyber horse" />
            </div>
            <div className={s.cap}>
              <div>
                <div className={s.gtag}>GENESIS&nbsp;#0001</div>
                <div className={s.nm}>ROYAL&nbsp;THUNDER</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className={`${s.tag} ${s.cy}`}>ENDURANCE</span>
                <span className={`${s.tag} ${s.gold}`}>LEGENDARY</span>
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
              <span>◇ ON-CHAIN LEDGER</span>
              <span>◇ REPLAYABLE RACES</span>
              <span>◇ NO AI WINNERS</span>
              <span>◇ 200 USDT BUYBACK</span>
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
            <div className={s.s}>毎晩 20:00(日本時間 21:00)· 全馬一斉発走</div>
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
              7日間の<span className={s.cy}>サバイバルレース</span>
            </h2>
            <div className={s.stepGrid}>
              <div className={`${s.step} ${s.cyan}`}>
                <div className={s.no} style={{ color: '#00eaff' }}>
                  01
                </div>
                <div className={s.t}>馬を迎える</div>
                <div className={s.d}>102 USDT(価格100+手数料2)でMint。DNA・タイプ・レア度はシードから自動で決まります。</div>
              </div>
              <div className={s.step}>
                <div className={s.no} style={{ color: '#ff2dc4' }}>
                  02
                </div>
                <div className={s.t}>調教して出走</div>
                <div className={s.d}>レース前に1日1回だけ調教できます。毎晩20時、すべての馬が一斉に走ります。</div>
              </div>
              <div className={s.step}>
                <div className={s.no} style={{ color: '#ff6fd0' }}>
                  03
                </div>
                <div className={s.t}>生存 or Burn</div>
                <div className={s.d}>成績下位の馬はBurn。Burnされても、次の馬に引き継がれるRevenge Buffを獲得します。</div>
              </div>
              <div className={`${s.step} ${s.gold}`}>
                <div className={s.no} style={{ color: '#c9a86a' }}>
                  04
                </div>
                <div className={s.t}>Day7 → 買い戻し</div>
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
              <div className={s.by}>on Polygon · ERC-721</div>
            </div>
          </div>
          <div className={s.colStats}>
            <div className={s.st}>
              <div className={`${s.n} ${s.cy}`}>5</div>
              <div className={s.k}>TYPES</div>
            </div>
            <div className={s.st}>
              <div className={`${s.n} ${s.go}`}>5</div>
              <div className={s.k}>RARITIES</div>
            </div>
            <div className={s.st}>
              <div className={`${s.n} ${s.go}`}>200</div>
              <div className={s.k}>BUYBACK</div>
            </div>
            <div className={s.st}>
              <div className={`${s.n} ${s.cy}`}>0</div>
              <div className={s.k}>AI</div>
            </div>
          </div>
        </div>

        <div className={s.galGrid}>
          {GALLERY.map((h) => {
            const st = RARITY_STYLE[h.rarity]!;
            return (
              <div key={h.id} className={s.galCard} style={{ borderColor: st.border, boxShadow: `0 0 20px -8px ${st.glow}` }}>
                <div className={s.acc} style={{ background: st.accent }} />
                <div className={s.art} style={{ background: st.panel }}>
                  <span className={s.id} style={{ color: st.border }}>
                    {h.id}
                  </span>
                  <span className={s.rib} style={{ background: st.ribbon, color: st.ink }}>
                    {h.rarity}
                  </span>
                  <img src={h.img} alt={h.name} />
                </div>
                <div className={s.body}>
                  <div className={s.gnm}>
                    {h.name}
                    <span style={{ color: '#00eaff', fontSize: 11 }}>✓</span>
                  </div>
                  <div className={s.meta}>
                    <span className={s.type} style={{ color: TYPE_COLOR[h.type], borderColor: TYPE_COLOR[h.type] }}>
                      {h.type}
                    </span>
                    <span className={s.day}>DAY {h.day}/7</span>
                  </div>
                  <div className={s.priceRow}>
                    <div>
                      <div className={s.pl}>PRICE</div>
                      <div className={s.pv}>
                        <span className={s.d}>◈</span> {DAY_PRICE[h.day - 1]}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6a6690' }}>P2P</div>
                  </div>
                  <Link href="/login">
                    <button>迎える · MINT</button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.colMore}>
          <Link href="/login">
            <button>厩舎に入る →</button>
          </Link>
        </div>
      </div>

      {/* ===== ECONOMY ===== */}
      <div className={s.section} id="economy">
        <div className={s.econ}>
          <div className={s.econL}>
            <div className={s.eyebrow} style={{ color: '#c9a86a' }}>
              TRANSPARENT ECONOMY
            </div>
            <h2 className={s.h2}>すべての記録が、台帳に残ります</h2>
            <p className={s.p}>
              レース結果・Burn・残高は複式簿記の台帳で管理され、それが唯一の記録です。勝者や順位をAIが決めることはありません。レースはシード公開後、誰でも同じ結果を再現・検証できます。
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
              <div className={s.k}>Day7 Buyback</div>
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
            <h2>今夜のレースは、20時に発走します。</h2>
            <p className={s.p}>MetaMask または Google でログインして、最初の馬を迎えよう。</p>
            <Link href="/login">
              <button>はじめる ▶</button>
            </Link>
            <div className={s.fine}>USDT · non-custodial · Polygon</div>
          </div>
        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <div className={s.foot}>
        <div className={s.fb}>
          <span className={s.bar} />
          SEVEN&nbsp;DERBY
        </div>
        <div className={s.links}>
          <Link href="#how">遊び方</Link>
          <Link href="#collection">コレクション</Link>
          <Link href="#economy">エコノミー</Link>
        </div>
        <div className={s.cpy}>© 2026 Seven Days Derby · Deterministic · Auditable</div>
      </div>
    </div>
  );
}
