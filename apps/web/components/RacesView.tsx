import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import s from '../app/races.module.css';

/* ============================================================================
 * /races(レース一覧)再設計 — ダッシュボード Option 1c と同じ部品言語。
 * 純粋な表示コンポーネント。props は { races: Race[] } のみ。データ取得層 page.tsx
 * は依頼側で結線。表示する数値は Race の値のみ(架空の統計は入れない)。
 * ========================================================================== */

export interface Race {
  id: string; status: string; participant_count: number | null;
  batch_date: string; race_engine_version: string;
}

function fmtDate(iso: string): { md: string; year: string } {
  const [y, m, d] = iso.split('-');
  return { md: `${Number(m)}月${Number(d)}日`, year: y ?? '' };
}
function statusBadge(status: string): { cls: string; label: string } {
  if (status === 'COMPLETED') return { cls: s.stCompleted!, label: 'COMPLETED · 確定' };
  if (status === 'OPEN' || status === 'PENDING' || status === 'SCHEDULED') return { cls: s.stOpen!, label: '今夜 · TONIGHT' };
  return { cls: s.stOther!, label: status };
}

export function RacesView({ races }: { races: Race[] }) {
  const upcoming = races.filter((r) => r.status !== 'COMPLETED');
  const completed = races.filter((r) => r.status === 'COMPLETED');

  return (
    <div className={s.wrap}>
      <div className={s.h1}>レース</div>

      {/* 今夜/予定のレース */}
      {upcoming.map((r) => {
        const d = fmtDate(r.batch_date);
        return (
          <section key={r.id} className={s.tonight}>
            <div className={s.tonightTop}>
              <span className={s.tonightLabel}>今夜のレース · TONIGHT</span>
              <span className={s.tonightLive}><span className={s.dot}>●</span> 20:00 MYT 発走</span>
            </div>
            <div className={s.tonightBody}>
              <div>
                <Countdown className={s.timer} />
                <div className={s.tonightSub}>確定まで · {d.md} のレース</div>
              </div>
              <div className={s.tonightNote}>
                <div>下位 <b>10.7%</b> が Burn</div>
                <div>生存で価値上昇 · Day7でチャンピオン報酬</div>
              </div>
            </div>
          </section>
        );
      })}

      {/* 完了したレース */}
      <div>
        <div className={s.secLabel}>完了したレース · COMPLETED</div>
        {completed.length > 0 ? (
          <div className={s.list}>
            {completed.map((r) => {
              const d = fmtDate(r.batch_date);
              const b = statusBadge(r.status);
              return (
                <Link key={r.id} href={`/races/${r.id}`} className={s.raceRow}>
                  <div className={s.raceDate}>
                    <div className={s.raceMd}>{d.md}</div>
                    <div className={s.raceYear}>{d.year}</div>
                  </div>
                  <span className={`${s.badge} ${b.cls}`}>{b.label}</span>
                  <div className={s.raceParts}>
                    出走 <b>{r.participant_count != null ? r.participant_count.toLocaleString('en-US') : '—'}</b> 頭
                  </div>
                  <span className={s.raceGo}>結果 →</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className={s.empty}>完了したレースはまだありません。</div>
        )}
      </div>
    </div>
  );
}
