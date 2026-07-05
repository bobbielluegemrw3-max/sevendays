import Link from 'next/link';
import { PRICE_TABLE_V1 } from '@sevendays/domain';
import { Countdown } from '@/components/Countdown';
import { HorseArt } from '@/components/HorseArt';
import { deriveHorseArt } from '@/lib/horse-visual';
import s from '../app/dashboard.module.css';

export interface DashHorse {
  id: string; name: string; status: string; current_day: number;
  horse_type: string; rarity: string; condition: string; fatigue: string;
  dna_hash: string; trained_for_next_race: boolean;
}
export interface DashWallet { available: string; locked: string }
export interface DashBuff { buff_rarity: string; buff_bonus_score: string; status: string }
export interface DashRace { id: string; status: string; participant_count: number | null; batch_date: string }
export interface DashResult { horse_id: string; final_score: string; final_rank: number; is_burned: boolean; horse: DashHorse }
export interface DashBuyback { id: string; status: string; payments_paid: number | string }
export interface DashNotification { id: string; notification_type: string; payload_json: { title?: string; body?: string } | null; read_at: string | null; created_at: string }

export interface DashboardData {
  wallet: DashWallet | null;
  horses: DashHorse[];
  buff: DashBuff | null;
  pendingCount: number;
  lastRace: DashRace | null;
  myResults: DashResult[];
  buybacks: DashBuyback[];
  notifications: DashNotification[];
}

const RARITY_ORDER = ['LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];

function money(v: string): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(6, Math.min(100, n)) : 60;
}
/** P2P value of a horse today, straight from the immutable price table. */
function horseValue(currentDay: number): string {
  return PRICE_TABLE_V1[Math.max(0, Math.min(6, currentDay))] ?? PRICE_TABLE_V1[0]!;
}
function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}分前`;
  if (mins < 1440) return `${Math.floor(mins / 60)}時間前`;
  return `${Math.floor(mins / 1440)}日前`;
}

function StableArt({ horse, className }: { horse: DashHorse; className?: string | undefined }) {
  const v = deriveHorseArt(horse.dna_hash, horse.name, horse.rarity);
  return <HorseArt baseId={v.baseId} coat={v.coat} coatB={v.coatB} pattern={v.pattern} mane={v.mane} flip={false} className={className} />;
}

export function DashboardView({ data }: { data: DashboardData }) {
  const { wallet, horses, buff, pendingCount, lastRace, myResults, buybacks, notifications } = data;
  const active = horses.filter((h) => h.status === 'ACTIVE');
  const untrained = active.filter((h) => !h.trained_for_next_race);
  const activeBuybacks = buybacks.filter((b) => b.status !== 'COMPLETED');
  const featured = [...active].sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || b.current_day - a.current_day,
  )[0];
  const stableValue = active.reduce((sum, h) => sum + Number(horseValue(h.current_day)), 0);
  const latestNotifs = notifications.slice(0, 4);

  return (
    <div className={s.app}>
      {/* ===== main column ===== */}
      <div className={s.main}>
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
            <span>MY RUNNERS <b>{active.length}</b></span>
            <span>BURN <b className="hot">10.7%</b></span>
            <span>POST <b>20:00 MYT</b></span>
          </div>
          <div className={s.cta}>
            <Link href="/purchase" className={s.primary}>
              <button style={{ width: '100%' }}>馬を迎える ▶</button>
            </Link>
            {untrained.length > 0 ? (
              <Link href="/horses"><button className="secondary">調教する ({untrained.length})</button></Link>
            ) : active.length > 0 ? (
              <Link href="/horses"><button className="secondary">厩舎へ</button></Link>
            ) : null}
          </div>
        </section>

        {/* TODAY'S TASKS */}
        {(untrained.length > 0 || pendingCount > 0) && (
          <section className={s.tasks}>
            <span className={s.tasksLab}>TODAY</span>
            {untrained.length > 0 ? (
              <Link href="/horses" className={s.task}>
                <b>{untrained.length}頭</b> が未調教(1日1回・スナップショット確定まで)
              </Link>
            ) : null}
            {pendingCount > 0 ? (
              <Link href="/purchase" className={s.task}>
                <b>{pendingCount}件</b> の購入が割当待ち(今夜のレースで確定)
              </Link>
            ) : null}
          </section>
        )}

        {/* LAST NIGHT'S RESULTS */}
        {myResults.length > 0 && lastRace ? (
          <section>
            <div className={s.secHead}>
              <span className="t">昨夜の結果<small>{lastRace.batch_date} · 全{(lastRace.participant_count ?? 0).toLocaleString('en-US')}頭</small></span>
              <Link href={`/races/${lastRace.id}`}>レース詳細 →</Link>
            </div>
            <div className={s.resList}>
              {myResults.map((r) => (
                <Link key={r.horse_id} href={`/horses/${r.horse_id}`} className={`${s.resRow} ${r.is_burned ? s.resBurned : ''}`}>
                  <span className={s.resRank}>
                    <span className="l">RANK</span>
                    <b>#{r.final_rank.toLocaleString('en-US')}</b>
                  </span>
                  <span className={s.resName}>{r.horse.name}</span>
                  <span className={s.resScore}>SCORE {Number(r.final_score).toFixed(2)}</span>
                  {r.is_burned ? (
                    <span className={`${s.resBadge} ${s.resBadgeBurn}`}>BURNED</span>
                  ) : (
                    <span className={s.resBadge}>SURVIVED · Day {Math.min(7, r.horse.current_day)}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* MY STABLE */}
        <section>
          <div className={s.secHead}>
            <span className="t">マイ厩舎<small>STABLE {active.length} · 評価額 {stableValue.toFixed(2)} USDT</small></span>
            <Link href="/horses">すべて →</Link>
          </div>
          <div className={s.stableList} style={{ marginTop: 10 }}>
            {active.length > 0 ? (
              active.slice(0, 6).map((h) => (
                <Link key={h.id} href={`/horses/${h.id}`} className={s.stableRow}>
                  <span className="chip"><StableArt horse={h} className={s.chipArt} /></span>
                  <div className="body">
                    <div className="top">
                      <span className="nm">{h.name}</span>
                      <span className={`badge rarity-${h.rarity}`}>{h.rarity}</span>
                    </div>
                    <div className={s.meters}>
                      <span className={s.meter}><span className="k">COND</span><span className="track"><span className="cyan" style={{ width: `${pct(h.condition)}%` }} /></span></span>
                      <span className={s.meter}><span className="k">FTG</span><span className="track"><span className="mag" style={{ width: `${pct(h.fatigue)}%` }} /></span></span>
                    </div>
                    <div className="rail" style={{ marginTop: 7 }}>
                      {Array.from({ length: 7 }, (_, i) => {
                        const day = i + 1;
                        const cls = day < h.current_day + 1 ? 'done' : day === h.current_day + 1 ? 'today' : '';
                        return <span key={day} className={`pip ${cls}`} />;
                      })}
                    </div>
                  </div>
                  <span className={s.rowSide}>
                    <span className={s.rowValue}><small>現在価値</small>{horseValue(h.current_day)}<small>USDT</small></span>
                    {h.trained_for_next_race ? (
                      <span className={`${s.train} ${s.trainDone}`}>調教済</span>
                    ) : (
                      <span className={s.train}>未調教</span>
                    )}
                  </span>
                </Link>
              ))
            ) : (
              <div className="panel empty" style={{ margin: 0 }}>
                {pendingCount > 0 ? `割当待ち ${pendingCount} 件 — 今夜のレースで確定します。` : '出走中の馬はいません。「馬を迎える」から今夜のダービーに参加しましょう。'}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ===== right rail ===== */}
      <aside className={s.rail}>
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
                    <StableArt horse={featured} className={s.featCanvas} />
                    <div className={s.scrim} />
                    <div className={s.tags}>
                      <span className={`badge rarity-${featured.rarity}`}>{featured.rarity}</span>
                      <span className="badge">{featured.horse_type}</span>
                    </div>
                    <div className={s.caption}>
                      <div>
                        <div className={s.featName}>{featured.name}</div>
                        <div className={s.featSeed}>現在価値 {horseValue(featured.current_day)} USDT</div>
                      </div>
                      <div className={s.featDay}>
                        <div className="l">DAY</div>
                        <div className={s.v}>{featured.current_day}<small>/7</small></div>
                      </div>
                    </div>
                  </div>
                  <div className={s.abilities}>
                    <div className={s.abGrid}>
                      <div className={s.ab}><span className="k">COND</span><span className="track"><span className="cyan" style={{ width: `${pct(featured.condition)}%` }} /></span></div>
                      <div className={s.ab}><span className="k">FATIGUE</span><span className="track"><span className="gold" style={{ width: `${pct(featured.fatigue)}%` }} /></span></div>
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
                      <div className="t">{pendingCount > 0 ? `今夜、${pendingCount}頭が発走します` : 'まだ出走馬がいません'}</div>
                      <div className="s">{pendingCount > 0 ? '20:00 のレースであなたの馬が誕生します' : '馬を迎えて、今夜のダービーに参加しましょう'}</div>
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
            <div className="s">USDT · available{wallet && Number(wallet.locked) > 0 ? ` · ロック中 ${money(wallet.locked)}` : ''}</div>
          </Link>
          <div className={`${s.assetCard} ${s.buff}`}>
            <div className="k">REVENGE BUFF</div>
            <div className="v">{buff ? `${buff.buff_rarity} +${buff.buff_bonus_score}` : 'なし'}</div>
            <div className="s">{buff ? '次回割当に自動適用' : 'Burnで獲得'}</div>
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
            <div className="note">200 USDT を7回に分けて受取 · 毎晩20:00の精算で1回ずつ支払い</div>
          </section>
        ) : null}

        {/* NOTIFICATIONS */}
        <section>
          <div className={s.secHead}>
            <span className="t">通知</span>
            <Link href="/notifications">すべて →</Link>
          </div>
          <div className={s.notifList}>
            {latestNotifs.length > 0 ? (
              latestNotifs.map((n) => (
                <div key={n.id} className={s.notifRow}>
                  <span className={s.notifTitle}>{n.payload_json?.title ?? n.notification_type}</span>
                  <span className={s.notifTime}>{timeAgo(n.created_at)}</span>
                </div>
              ))
            ) : (
              <div className="panel empty" style={{ margin: 0 }}>通知はまだありません。</div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
