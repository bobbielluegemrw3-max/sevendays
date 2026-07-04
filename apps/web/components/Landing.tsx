import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import s from './landing.module.css';

/**
 * Public landing page (Design Composer → React). Copy rewritten to match
 * the actual game: mint charge 102 (100 price + 2 fee, Decision 069),
 * 200 USDT Day7 buyback, deterministic commit-reveal on-chain, no AI in
 * results. No fabricated growth/marketplace numbers.
 */
export function Landing() {
  return (
    <div className={s.page}>
      <span className={s.topbar} />

      {/* NAV */}
      <div className={s.nav}>
        <div className={s.brand}>
          <span className={s.bar} />
          <span className={s.nm}>SEVEN&nbsp;DERBY</span>
        </div>
        <Link href="/login" className={s.enter}>
          はじめる
        </Link>
      </div>

      {/* HERO */}
      <div className={s.hero}>
        <div className={s.grid} />
        <div className={s.inner}>
          <span className={s.badge2}>
            <span className={s.g} />
            WEB3 HORSE RACING · ON-CHAIN
          </span>
          <h1 className={s.hTitle}>
            <span className={s.l1}>SEVEN&nbsp;DAYS</span>
            <span className={s.l2}>DERBY</span>
          </h1>
          <p className={s.hLead}>
            7日間を走り抜け。毎晩20時、全馬が一斉に発走し、下位はBurn。生き残った馬だけがDay7の栄光と買い戻しに辿り着く。すべてはオンチェーンで、改ざん不能。
          </p>
          <div className={s.hSub}>Survive the week. Every horse is a deterministic, replayable NFT.</div>
          <div className={s.hCta}>
            <Link href="/login" className="grow">
              <button>馬を迎える ▶</button>
            </Link>
            <Link href="#how">
              <button className="secondary">遊び方</button>
            </Link>
          </div>

          {/* featured horse */}
          <div className={s.featCard}>
            <div className={s.goldline} />
            <div className={s.art}>
              <span className={s.idl}>#0001</span>
              <span className={s.idr}>GENESIS</span>
              <span className={s.aura} />
              <img src="/horses/hero.png" alt="Seven Days Derby cyber horse" />
            </div>
            <div className={s.cap}>
              <div>
                <div className={s.gtag}>GENESIS&nbsp;#0001</div>
                <div className={s.nm}>ROYAL&nbsp;THUNDER</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="badge">ENDURANCE</span>
                <span className="badge rarity-LEGENDARY">LEGENDARY</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* trust marquee */}
      <div className={s.marquee}>
        <div className={s.track}>
          <span>
            <span>◇ DETERMINISTIC</span>
            <span>◇ COMMIT-REVEAL SEED</span>
            <span>◇ ON-CHAIN LEDGER</span>
            <span>◇ REPLAYABLE RACES</span>
            <span>◇ NO AI WINNERS</span>
          </span>
          <span>
            <span>◇ DETERMINISTIC</span>
            <span>◇ COMMIT-REVEAL SEED</span>
            <span>◇ ON-CHAIN LEDGER</span>
            <span>◇ REPLAYABLE RACES</span>
            <span>◇ NO AI WINNERS</span>
          </span>
        </div>
      </div>

      {/* countdown band */}
      <div className={s.cdBand}>
        <div className={s.l}>// NEXT POST 20:00 MYT</div>
        <Countdown className={s.cd} />
        <div className={s.s}>毎晩 20:00(日本時間 21:00)· 全馬一斉発走</div>
      </div>

      {/* value stats (true) */}
      <div className={s.vstats}>
        <div className={s.vstat}>
          <div className={`${s.n} ${s.go}`}>200</div>
          <div className={s.k}>USDT · DAY7 BUYBACK</div>
        </div>
        <div className={s.vstat}>
          <div className={`${s.n} ${s.cy}`}>7</div>
          <div className={s.k}>DAYS TO GLORY</div>
        </div>
        <div className={s.vstat}>
          <div className={`${s.n} ${s.gr}`}>0</div>
          <div className={s.k}>AI IN RESULTS</div>
        </div>
      </div>

      {/* how it works */}
      <div className={s.block} id="how">
        <div className={s.eyebrow}>HOW IT WORKS</div>
        <h2>
          7日間の<span className={s.cy}>生存レース</span>
        </h2>
        <p className={s.p}>Mint から Memorial まで。すべての工程はシード確定・リプレイ可能。</p>
        <div className={s.steps}>
          <div className={`${s.step} ${s.cyan}`}>
            <span className={`${s.no} ${s.c1}`}>01</span>
            <div>
              <div className={s.t}>馬を迎える(Day0 Mint)</div>
              <div className={s.d}>102 USDT(価格100 + 手数料2)で新しい馬を発行。タイプ・レア度・DNAはシードから決定論的に生成。</div>
            </div>
          </div>
          <div className={s.step}>
            <span className={`${s.no} ${s.c2}`}>02</span>
            <div>
              <div className={s.t}>調教して出走</div>
              <div className={s.d}>発走前に1回だけ調教で味付け。20:00に全馬が一斉に走る。</div>
            </div>
          </div>
          <div className={s.step}>
            <span className={`${s.no} ${s.c3}`}>03</span>
            <div>
              <div className={s.t}>生存 or Burn</div>
              <div className={s.d}>下位一定数はBurn。負けても Revenge Buff が次の馬に自動で宿る。</div>
            </div>
          </div>
          <div className={`${s.step} ${s.gold}`}>
            <span className={`${s.no} ${s.c4}`}>04</span>
            <div>
              <div className={s.t}>Day7 到達 → 買い戻し → Memorial</div>
              <div className={s.d}>7日走り切れば 200 USDT を7回で受取。完済で Memorial NFT に昇華。</div>
            </div>
          </div>
        </div>
        <div className={s.pipRail}>
          <span className={s.d}>D1</span>
          <span className={s.fill} />
          <span className={`${s.d} ${s.g}`}>D7 ★</span>
        </div>
      </div>

      {/* types + rarity */}
      <div className={s.block}>
        <div className={s.eyebrow}>FIVE TYPES · FIVE RARITIES</div>
        <h2>同じ馬は二頭と存在しない</h2>
        <div className={s.typeGrid}>
          <div className={`${s.c} ${s.on}`}>
            <div className={s.tn} style={{ color: 'var(--cyan)' }}>
              SPRINTER
            </div>
            <div className={s.td}>先行力</div>
          </div>
          <div className={s.c}>
            <div className={s.tn} style={{ color: 'var(--magenta-soft)' }}>
              POWER
            </div>
            <div className={s.td}>馬力</div>
          </div>
          <div className={s.c}>
            <div className={s.tn} style={{ color: 'var(--text)' }}>
              BALANCED
            </div>
            <div className={s.td}>万能</div>
          </div>
          <div className={s.c}>
            <div className={s.tn} style={{ color: '#c6ff3a' }}>
              ENDURANCE
            </div>
            <div className={s.td}>持久力</div>
          </div>
          <div className={s.c}>
            <div className={s.tn} style={{ color: 'var(--gold)' }}>
              LUCK
            </div>
            <div className={s.td}>幸運</div>
          </div>
          <div className={`${s.c} ${s.gold}`}>
            <div className={s.tn} style={{ color: 'var(--gold-bright)' }}>
              + RARITY
            </div>
            <div className={s.td}>N→LEGEND</div>
          </div>
        </div>
        <div className={s.rarityLadder}>
          <span style={{ background: 'rgba(255,255,255,.06)', color: 'var(--muted)' }}>COMMON</span>
          <span style={{ background: 'rgba(90,122,154,.2)', color: '#a9c4d6' }}>UNCMN</span>
          <span style={{ background: 'rgba(0,234,255,.14)', color: 'var(--cyan)' }}>RARE</span>
          <span style={{ background: 'rgba(255,45,196,.16)', color: 'var(--magenta-soft)' }}>EPIC</span>
          <span style={{ background: 'linear-gradient(92deg,var(--gold),var(--gold-bright))', color: '#0a0813', fontWeight: 700 }}>
            LEGEND
          </span>
        </div>
      </div>

      {/* transparency */}
      <div className={s.trans}>
        <div className={s.eyebrow}>TRANSPARENT ECONOMY</div>
        <h2>数字は、すべて台帳に。</h2>
        <p className={s.p}>
          レース結果・Burn・残高は複式簿記の台帳が唯一の真実。AIが勝者や順位を決めることは一切なく、レースはシード公開後に誰でも再検証できる。
        </p>
        <div className={s.facts}>
          <div className={s.fact}>
            <div className={s.n}>102 USDT</div>
            <div className={s.k}>Day0 Mint</div>
          </div>
          <div className={s.fact}>
            <div className={s.n}>200 USDT</div>
            <div className={s.k}>Day7 Buyback</div>
          </div>
          <div className={s.fact}>
            <div className={s.n}>7×</div>
            <div className={s.k}>分割払い</div>
          </div>
        </div>
      </div>

      {/* final */}
      <div className={s.final}>
        <h2>
          レースは、終わらない。
          <br />
          今夜、あなたも走る。
        </h2>
        <Link href="/login">
          <button style={{ fontSize: 14, padding: '16px 40px' }}>いま はじめる ▶</button>
        </Link>
      </div>

      <div className={s.foot}>
        <div className={s.fb}>SEVEN&nbsp;DAYS&nbsp;DERBY</div>
        <div className={s.fn}>ON-CHAIN · POLYGON · DAY7 BUYBACK</div>
      </div>
    </div>
  );
}
