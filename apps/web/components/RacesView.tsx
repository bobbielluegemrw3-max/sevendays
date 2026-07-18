import Link from 'next/link';
import { MyDerbyRecord } from '@/components/daily-derby/MyDerbyRecord';
import s from '../app/races.module.css';

/* ============================================================================
 * /races(レース一覧)。上段=あなたのレース記録(審判演出の記録版・日付遡り可、
 * オーナー指示 2026-07-10 — 旧「今夜」カード連発+カウントダウンは廃止)。
 * 下段=確定レースの全体アーカイブ(commit-reveal 検証ページへのリンク)。
 * 精算済みレースの status は FINALIZED(COMPLETED ではない)。
 * ========================================================================== */

export interface Race {
  id: string; status: string; participant_count: number | null;
  batch_date: string; slot?: string | null; race_engine_version: string;
}

function fmtDate(iso: string): { md: string; year: string } {
  const [y, m, d] = iso.split('-');
  return { md: `${Number(m)}月${Number(d)}日`, year: y ?? '' };
}

export function RacesView({ races }: { races: Race[] }) {
  const completed = races.filter((r) => r.status === 'FINALIZED' || r.status === 'COMPLETED');

  return (
    <div className={s.wrap}>
      <div className={s.h1}>レース</div>

      {/* あなたのレース記録(日付で遡れる審判アーカイブ) */}
      <MyDerbyRecord />

      {/* 透明性台帳への導線(全ユーザーの毎晩の全記録・CSV) */}
      <Link href="/ledger" className={s.raceRow}>
        <div className={s.raceDate}>
          <div className={s.raceMd}>台帳</div>
          <div className={s.raceYear}>LEDGER</div>
        </div>
        <div className={s.raceParts}>毎レースの全記録(生存・BURN・売買)を公開 · CSVダウンロード可</div>
        <span className={s.raceGo}>開く →</span>
      </Link>

      {/* 確定したレース(全体・検証ページへ) */}
      <div>
        <div className={s.secLabel}>確定したレース · FINALIZED</div>
        {completed.length > 0 ? (
          <div className={s.list}>
            {completed.map((r) => {
              const d = fmtDate(r.batch_date);
              return (
                <Link key={r.id} href={`/races/${r.id}`} className={s.raceRow}>
                  <div className={s.raceDate}>
                    <div className={s.raceMd}>{d.md}{r.slot === 'MORNING' ? ' 8:00' : r.slot === 'NIGHT' ? ' 20:00' : ''}</div>
                    <div className={s.raceYear}>{d.year}</div>
                  </div>
                  <span className={`${s.badge} ${s.stCompleted}`}>FINALIZED · 確定</span>
                  <div className={s.raceParts}>
                    出走 <b>{r.participant_count != null ? r.participant_count.toLocaleString('en-US') : '—'}</b> 頭
                  </div>
                  <span className={s.raceGo}>結果 →</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className={s.empty}>確定したレースはまだありません。</div>
        )}
      </div>
    </div>
  );
}
