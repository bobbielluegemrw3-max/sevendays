import Link from 'next/link';
import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { Countdown } from '@/components/Countdown';
import s from './dashboard.module.css';

interface Me { id: string }
interface Wallet { available: string; locked: string }
interface Horse {
  id: string; name: string; status: string; current_day: number;
  horse_type: string; rarity: string; condition: string; fatigue: string;
}
interface Buff { buff_rarity: string; buff_bonus_score: string; status: string }
interface Session { id: string; status: string }
interface Race { id: string; participant_count: number | null; batch_date: string }
interface Buyback { id: string; status: string; payments_paid: number | string }

const RARITY_ART: Record<string, string> = {
  LEGENDARY: '/horses/gold.png', EPIC: '/horses/gold.png',
  RARE: '/horses/chrome.png', UNCOMMON: '/horses/chrome.png', COMMON: '/horses/onyx.png',
};
const RARITY_ORDER = ['LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];

function money(v: string): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(condition: string): number {
  const n = Number(condition);
  return Number.isFinite(n) ? Math.max(6, Math.min(100, n)) : 60;
}

export default async function DashboardPage() {
  await serverApiOrLogin<Me>('/api/v1/me');
  const [walletR, horsesR, buffR, sessionsR, racesR, buybacksR] = await Promise.all([
    serverApi<Wallet>('/api/v1/wallet'),
    serverApi<{ horses: Horse[] }>('/api/v1/horses'),
    serverApi<Buff>('/api/v1/revenge-buffs/current'),
    serverApi<{ sessions: Session[] }>('/api/v1/purchase'),
    serverApi<{ races: Race[] }>('/api/v1/races'),
    serverApi<{ buybacks: Buyback[] }>('/api/v1/buybacks'),
  ]);

  const wallet = walletR.status === 200 ? walletR.body : null;
  const horses = horsesR.status === 200 ? horsesR.body.horses : [];
  const active = horses.filter((h) => h.status === 'ACTIVE');
  const pending = sessionsR.status === 200 ? sessionsR.body.sessions.filter((x) => x.status === 'PENDING_ASSIGNMENT') : [];
  const buff = buffR.status === 200 ? buffR.body : null;
  const latestRace = racesR.status === 200 ? racesR.body.races[0] : undefined;
  const activeBuybacks = buybacksR.status === 200 ? buybacksR.body.buybacks.filter((b) => b.status !== 'COMPLETED') : [];

  const featured = [...active].sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || b.current_day - a.current_day,
  )[0];
  const entries = latestRace?.participant_count ?? active.length;

  return (
    <div className={s.app}>
      {/* HERO */}
      <section className={s.hero}>
        <span className={s.topline} />
        <span className={s.tickTL} />
        <span className={s.tickTR} />
        <div className={s.hrow}>
          <span className={s.eyebrow}>// TONIGHT&apos;S DERBY</span>
          <span className={s.live}>● LIVE 20:00 MYT</span>
        </div>
        <div className={s.lead}>本日のレース確定まで</div>
        <Countdown className={s.countdown} />
        <div className={s.stats}>
          <span>ENTRIES <b>{entries.toLocaleString('en-US')}</b></span>
          <span>BURN <b className="hot">10.7%</b></span>
          <span>POST <b>20:00</b></span>
        </div>
        <div className={s.cta}>
          <Link href="/purchase" className={s.primary}>
            <button style={{ width: '100%' }}>{active.length > 0 ? '厩舎へ ▶' : '馬を迎える ▶'}</button>
          </Link>
          {active.length > 0 ? (
            <Link href="/horses"><button className="secondary">調教</button></Link>
          ) : null}
        </div>
      </section>

      {/* FEATURED */}
      <section>
        <div className={s.featHead}>
          <span className={s.lab}>FEATURED HORSE</span>
          {featured ? <span className={s.id}>#{featured.id.slice(0, 4)}</span> : null}
        </div>
        <div className={s.featFrame}>
          <div className={s.featInner}>
            {featured ? (
              <>
                <div className={s.featArt}>
                  <img className={s.img} src={RARITY_ART[featured.rarity] ?? '/horses/hero.png'} alt={featured.name} />
                  <div className={s.scrim} />
                  <div className={s.tags}>
                    <span className={`badge rarity-${featured.rarity}`}>{featured.rarity}</span>
                    <span className="badge">{featured.horse_type}</span>
                  </div>
                  <div className={s.caption}>
                    <div>
                      <div className={s.featName}>{featured.name}</div>
                      <div className={s.featSeed}>COND {featured.condition} · FATIGUE {featured.fatigue}</div>
                    </div>
                    <div className={s.featDay}>
                      <div className="l">DAY</div>
                      <div className={s.v}>{featured.current_day}<small>/7</small></div>
                    </div>
                  </div>
                </div>
                <div className={s.abilities}>
                  <div className={s.abGrid}>
                    <div className={s.ab}><span className="k">CONDITION</span><span className="track"><span className="cyan" style={{ width: `${pct(featured.condition)}%` }} /></span></div>
                    <div className={s.ab}><span className="k">TYPE</span><span className="track"><span className="gold" style={{ width: '100%' }} /></span></div>
                  </div>
                  <div className={s.dayRail}>
                    {Array.from({ length: 7 }, (_, i) => {
                      const day = i + 1;
                      const cls = day < featured.current_day + 1 ? 'done' : day === featured.current_day + 1 ? 'today' : '';
                      return <span key={day} className={cls} />;
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className={s.featArt}>
                <img className={s.img} src="/horses/hero.png" alt="Genesis horse" />
                <div className={s.scrim} />
                <div className={s.caption} style={{ justifyContent: 'flex-start' }}>
                  <div className={s.teaser}>
                    <div className="t">{pending.length > 0 ? `今夜、${pending.length}頭が発走します` : 'まだ出走馬がいません'}</div>
                    <div className="s">{pending.length > 0 ? '20:00 のレースであなたの馬が誕生します' : '馬を迎えて、今夜のダービーに参加しましょう'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ASSETS */}
      <section className={s.assets}>
        <Link href="/wallet" className={`${s.assetCard} ${s.bal}`}>
          <div className="k">BALANCE</div>
          <div className="v">{wallet ? money(wallet.available) : '—'}</div>
          <div className="s">USDT · available</div>
        </Link>
        <div className={`${s.assetCard} ${s.buff}`}>
          <div className="k">REVENGE BUFF</div>
          <div className="v">{buff ? `${buff.buff_rarity} +${buff.buff_bonus_score}` : 'なし'}</div>
          <div className="s">{buff ? '次回割当に自動適用' : 'Burnで獲得'}</div>
        </div>
      </section>

      {/* MY STABLE */}
      <section>
        <div className={s.secHead}>
          <span className="t">マイ厩舎<small>STABLE {active.length}</small></span>
          <Link href="/horses">すべて →</Link>
        </div>
        <div className={s.stableList} style={{ marginTop: 10 }}>
          {active.length > 0 ? (
            active.slice(0, 4).map((h) => (
              <Link key={h.id} href={`/horses/${h.id}`} className={s.stableRow}>
                <span className="chip">
                  <img src={RARITY_ART[h.rarity] ?? '/horses/onyx.png'} alt="" />
                </span>
                <div className="body">
                  <div className="top">
                    <span className="nm">{h.name}</span>
                    <span className={`badge rarity-${h.rarity}`}>{h.rarity}</span>
                  </div>
                  <div className="rail" style={{ marginTop: 8 }}>
                    {Array.from({ length: 7 }, (_, i) => {
                      const day = i + 1;
                      const cls = day < h.current_day + 1 ? 'done' : day === h.current_day + 1 ? 'today' : '';
                      return <span key={day} className={`pip ${cls}`} />;
                    })}
                  </div>
                </div>
                <span className="today">今夜</span>
              </Link>
            ))
          ) : (
            <div className="panel empty" style={{ margin: 0 }}>
              {pending.length > 0 ? `割当待ち ${pending.length} 件 — 今夜のレースで確定します。` : '出走中の馬はいません。'}
            </div>
          )}
        </div>
      </section>

      {/* BUYBACK */}
      {activeBuybacks.length > 0 ? (
        <section className={s.buyback}>
          <div className="top">
            <span className="t">Day7 買い戻し 進行中</span>
            <span className="c">{Number(activeBuybacks[0]!.payments_paid)} / 7 payments</span>
          </div>
          <div className="bar" style={{ marginTop: 11 }}>
            <span style={{ width: `${(Number(activeBuybacks[0]!.payments_paid) / 7) * 100}%` }} />
          </div>
          <div className="note">200 USDT を7回で受取 · 次回 明日 20:00</div>
        </section>
      ) : null}
    </div>
  );
}
