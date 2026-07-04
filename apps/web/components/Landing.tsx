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
        <div className={s.menu}>
          <Link href="#how">遊び方</Link>
          <Link href="#types">コレクション</Link>
          <Link href="#economy">エコノミー</Link>
        </div>
        <Link href="/login" className={s.enter}>
          はじめる
        </Link>
      </div>

      {/* HERO */}
      <div className={s.hero}>
        <div className={s.grid} />
        <div className={s.inner}>
          {/* left copy */}
          <div>
            <span className={s.badge2}>
              <span className={s.g} />
              WEB3 HORSE RACING · ON-CHAIN
            </span>
            <h1 className={s.hTitle}>
              <span className={s.l1}>SEVEN&nbsp;DAYS</span>
              <span className={s.l2}>DERBY</span>
            </h1>
            <p className={s.hLead}>
              毎晩20時、その日のすべての馬が1つのレースを走ります。下位はBurn、勝ち残った馬はDay7で200 USDTの買い戻しへ。結果はすべてオンチェーンに記録され、誰でも検証できます。
            </p>
            <div className={s.hSub}>Every horse is an on-chain NFT. Every race is verifiable.</div>
            <div className={s.hCta}>
              <Link href="/login" className="grow">
                <button style={{ width: '100%' }}>馬を迎える ▶</button>
              </Link>
              <Link href="#how">
                <button className="secondary">遊び方を見る</button>
              </Link>
            </div>
            <div className={s.heroStats}>
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

          {/* right: featured horse */}
          <div className={s.featCard}>
            <div className={s.goldline} />
            <div className={s.art}>
              <span className={s.idl}>#0001</span>
              <span className={s.idr}>♡ GENESIS</span>
              <span className={s.aura} />
              <img src="/horses/hero.png" alt="Seven Days Derby cyber horse" />
            </div>
            <div className={s.cap}>
              <div>
                <div className={s.gtag}>GENESIS&nbsp;#0001</div>
                <div className={s.nm}>ROYAL&nbsp;THUNDER</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
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

      {/* how it works */}
      <div className={s.block} id="how">
        <div className={s.howGrid}>
          <div>
            <div className={s.eyebrow}>HOW IT WORKS</div>
            <h2>
              7日間の<span className={s.cy}>サバイバルレース</span>
            </h2>
            <p className={s.p}>馬を迎えてから記念NFTになるまで。すべての結果はシードで確定し、あとから誰でも再現・検証できます。</p>
            <div className={s.pipRail}>
              <span className={s.d}>D1</span>
              <span className={s.fill} />
              <span className={`${s.d} ${s.g}`}>D7 ★</span>
            </div>
          </div>
          <div className={s.steps}>
          <div className={`${s.step} ${s.cyan}`}>
            <span className={`${s.no} ${s.c1}`}>01</span>
            <div>
              <div className={s.t}>馬を迎える(Day0 Mint)</div>
              <div className={s.d}>102 USDT(価格100+手数料2)で馬を1頭発行します。タイプ・レア度・能力はシードから自動で決まります。</div>
            </div>
          </div>
          <div className={s.step}>
            <span className={`${s.no} ${s.c2}`}>02</span>
            <div>
              <div className={s.t}>調教して出走</div>
              <div className={s.d}>レース前に1日1回だけ調教できます。毎晩20時、すべての馬が一斉に走ります。</div>
            </div>
          </div>
          <div className={s.step}>
            <span className={`${s.no} ${s.c3}`}>03</span>
            <div>
              <div className={s.t}>生存 or Burn</div>
              <div className={s.d}>成績下位の馬はBurnされます。Burnされても、次の馬に引き継がれるRevenge Buffを獲得します。</div>
            </div>
          </div>
          <div className={`${s.step} ${s.gold}`}>
            <span className={`${s.no} ${s.c4}`}>04</span>
            <div>
              <div className={s.t}>Day7到達 → 買い戻し → 記念NFT</div>
              <div className={s.d}>7日間を走り切ると200 USDTが7回に分けて支払われ、完了すると記念NFTになります。</div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* types + rarity */}
      <div className={s.block} id="types">
        <div className={s.eyebrow}>FIVE TYPES · FIVE RARITIES</div>
        <h2>1頭ずつ、能力もDNAも異なります</h2>
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

      {/* gallery — example horses (marketplace-style, honest) */}
      <div className={s.block} id="gallery">
        <div className={s.eyebrow}>COLLECTION</div>
        <h2>今夜、こうした馬が走ります</h2>
        <p className={s.p}>タイプ・レア度・能力はすべてシードから決まります。下は生成される馬の一例です。</p>
        <div className={s.galGrid}>
          {[
            { art: '/horses/gold.png', name: 'Royal Thunder', type: 'ENDURANCE', rarity: 'LEGENDARY', day: 5, top: 'linear-gradient(90deg,var(--gold),var(--gold-bright))' },
            { art: '/horses/chrome.png', name: 'Silver Arrow', type: 'SPRINTER', rarity: 'RARE', day: 3, top: 'linear-gradient(90deg,var(--cyan),#5ff5ff)' },
            { art: '/horses/gold.png', name: 'Golden Storm', type: 'POWER', rarity: 'EPIC', day: 2, top: 'linear-gradient(90deg,var(--magenta),var(--magenta-soft))' },
            { art: '/horses/onyx.png', name: 'Black Wind', type: 'BALANCED', rarity: 'COMMON', day: 6, top: 'rgba(255,255,255,.2)' },
          ].map((h) => (
            <div key={h.name} className={s.galCard}>
              <div className={s.gtop} style={{ background: h.top }} />
              <div className={s.gart}>
                <span className={s.rar}>
                  <span className={`badge rarity-${h.rarity}`}>{h.rarity}</span>
                </span>
                <img src={h.art} alt={h.name} />
              </div>
              <div className={s.gbody}>
                <div className={s.gname}>{h.name}</div>
                <div className={s.gmeta}>
                  <span className={s.gtype}>{h.type}</span>
                  <span className={s.gday}>DAY {h.day}/7</span>
                </div>
                <div className={s.grail}>
                  {Array.from({ length: 7 }, (_, i) => {
                    const day = i + 1;
                    const cls = day < h.day + 1 ? 'done' : day === h.day + 1 ? 'today' : '';
                    return <span key={day} className={cls} />;
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* transparency */}
      <div className={s.trans} id="economy">
        <div className={s.eyebrow}>TRANSPARENT ECONOMY</div>
        <h2>すべての記録が、台帳に残ります</h2>
        <p className={s.p}>
          レース結果・Burn・残高は複式簿記の台帳で管理され、それが唯一の記録です。勝者や順位をAIが決めることはありません。レースはシード公開後、誰でも同じ結果を再現・検証できます。
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
        <h2>今夜のレースは、20時に発走します。</h2>
        <p className="muted" style={{ marginBottom: '1.4rem', fontSize: '0.95rem' }}>
          MetaMask または Google で、いますぐ参加できます。
        </p>
        <Link href="/login">
          <button style={{ fontSize: 15, padding: '16px 44px' }}>はじめる ▶</button>
        </Link>
      </div>

      <div className={s.foot}>
        <div className={s.fb}>SEVEN&nbsp;DAYS&nbsp;DERBY</div>
        <div className={s.fn}>ON-CHAIN · POLYGON · DAY7 BUYBACK</div>
      </div>
    </div>
  );
}
