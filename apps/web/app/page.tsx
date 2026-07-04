import Link from 'next/link';
import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { Countdown } from '@/components/Countdown';
import { TRAINING_CUTOFF_LABEL } from '@/lib/race-time';

interface Me {
  id: string;
  email: string;
}
interface Wallet {
  available: string;
  locked: string;
}
interface Horse {
  id: string;
  name: string;
  status: string;
  current_day: number;
  horse_type: string;
  rarity: string;
  condition: string;
  fatigue: string;
}
interface Buff {
  buff_rarity: string;
  buff_bonus_score: string;
  status: string;
}
interface Session {
  id: string;
  status: string;
}
interface Buyback {
  id: string;
  status: string;
  payments_paid: number | string;
}

function fmt(n: string): string {
  // trim trailing zeros but keep at least 2 decimals
  const v = Number(n);
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function DashboardPage() {
  await serverApiOrLogin<Me>('/api/v1/me');
  const [wallet, horsesRes, buff, sessionsRes, buybacksRes] = await Promise.all([
    serverApi<Wallet>('/api/v1/wallet'),
    serverApi<{ horses: Horse[] }>('/api/v1/horses'),
    serverApi<Buff>('/api/v1/revenge-buffs/current'),
    serverApi<{ sessions: Session[] }>('/api/v1/purchase'),
    serverApi<{ buybacks: Buyback[] }>('/api/v1/buybacks'),
  ]);

  const horses = horsesRes.status === 200 ? horsesRes.body.horses : [];
  const activeHorses = horses.filter((h) => h.status === 'ACTIVE');
  const pendingSessions =
    sessionsRes.status === 200 ? sessionsRes.body.sessions.filter((s) => s.status === 'PENDING_ASSIGNMENT') : [];
  const buybacks = buybacksRes.status === 200 ? buybacksRes.body.buybacks : [];
  const activeBuybacks = buybacks.filter((b) => b.status !== 'COMPLETED');

  // State-dependent action prompt — "what should I do right now".
  let prompt: { text: string; cta?: { href: string; label: string } };
  if (activeHorses.length === 0 && pendingSessions.length === 0) {
    prompt = {
      text: 'まだ出走馬がいません。今すぐ馬を迎えて、今夜のレースに参加しましょう。',
      cta: { href: '/purchase', label: '馬を迎える' },
    };
  } else if (pendingSessions.length > 0) {
    prompt = {
      text: `購入セッションが ${pendingSessions.length} 件、今夜の割当を待っています。結果は今夜のレースで確定します。`,
      cta: { href: '/purchase', label: 'セッションを確認' },
    };
  } else {
    prompt = {
      text: `出走予定 ${activeHorses.length} 頭。締切(${TRAINING_CUTOFF_LABEL})までにトレーニングを選べます。`,
      cta: { href: '/horses', label: 'マイ厩舎へ' },
    };
  }

  return (
    <>
      {/* ---- hero: tonight's race ---- */}
      <section className="hero">
        <div className="eyebrow">Tonight&apos;s Derby</div>
        <div>
          <span className="subtle">本日のレース確定まで</span>
        </div>
        <Countdown />
        <div className="subtle">毎晩 20:00 MYT(日本時間 21:00)に全馬が一斉に走ります。</div>
        <div className="action">
          <div className="prompt">{prompt.text}</div>
          {prompt.cta ? (
            <Link href={prompt.cta.href}>
              <button>{prompt.cta.label} →</button>
            </Link>
          ) : null}
        </div>
      </section>

      {/* ---- assets ---- */}
      <div className="grid cols-3" style={{ marginTop: '0.85rem' }}>
        <Link href="/wallet" className="panel stat" style={{ display: 'block' }}>
          <div className="label">利用可能</div>
          <div className="value">
            {wallet.status === 200 ? fmt(wallet.body.available) : '—'}
            <span className="unit">USDT</span>
          </div>
        </Link>
        <Link href="/wallet" className="panel stat" style={{ display: 'block' }}>
          <div className="label">ロック中</div>
          <div className="value">
            {wallet.status === 200 ? fmt(wallet.body.locked) : '—'}
            <span className="unit">USDT</span>
          </div>
        </Link>
        <div className="panel stat">
          <div className="label">Revenge Buff</div>
          <div className="value">
            {buff.status === 200 ? (
              <>
                {buff.body.buff_rarity}
                <span className="unit">+{buff.body.buff_bonus_score}</span>
              </>
            ) : (
              <span className="unit" style={{ marginLeft: 0 }}>
                なし
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ---- my stable ---- */}
      <div className="section-head">
        <h2>マイ厩舎</h2>
        <Link href="/horses">すべて見る →</Link>
      </div>
      {activeHorses.length > 0 ? (
        <div className="grid cards">
          {activeHorses.slice(0, 6).map((h) => (
            <Link key={h.id} href={`/horses/${h.id}`} className="horse">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="name">{h.name}</span>
                <span className="badge tonight">今夜出走</span>
              </div>
              <div className="meta">
                <span className={`badge rarity-${h.rarity}`}>{h.rarity}</span>
                <span className="badge">{h.horse_type}</span>
                <span className="badge">Day {h.current_day} / 7</span>
              </div>
              <div className="rail" aria-label={`Day ${h.current_day} of 7`}>
                {Array.from({ length: 7 }, (_, i) => {
                  const day = i + 1;
                  const cls = day < h.current_day + 1 ? 'done' : day === h.current_day + 1 ? 'today' : '';
                  return <span key={day} className={`pip ${cls}`} />;
                })}
              </div>
              <div className="meta faint">
                コンディション {h.condition} ・ 疲労 {h.fatigue}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel empty">
          出走中の馬はいません。
          <div style={{ marginTop: '0.7rem' }}>
            <Link href="/purchase">
              <button>馬を迎える →</button>
            </Link>
          </div>
        </div>
      )}

      {/* ---- buyback progress (if any) ---- */}
      {activeBuybacks.length > 0 ? (
        <>
          <div className="section-head">
            <h2>Buyback 進行中</h2>
            <Link href="/buybacks">詳細 →</Link>
          </div>
          <div className="panel">
            {activeBuybacks.slice(0, 3).map((b) => {
              const paid = Number(b.payments_paid);
              return (
                <div key={b.id} style={{ margin: '0.5rem 0' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">200 USDT 買い戻し(7回払い)</span>
                    <span className="muted">{paid} / 7</span>
                  </div>
                  <div className="bar">
                    <span style={{ width: `${(paid / 7) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}
