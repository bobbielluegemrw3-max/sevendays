import { statusKind } from '@/components/admin-shared';
import s from '../app/admin.module.css';

/* /admin/races — 直近レースの運行状況。純表示。 */

export interface AdminRaces {
  races: {
    id: string; batch_date: string; status: string; participant_count: number;
    weather: string | null; track_condition: string | null; surface: string | null;
    burns: number; item_usages: number;
    completed_at: string | null;
  }[];
  daily_derby_live: boolean;
}

function pillClass(status: string): string {
  const kind = statusKind(status);
  if (kind === 'good') return `${s.pill} ${s.pillGood}`;
  if (kind === 'warn') return `${s.pill} ${s.pillWarn}`;
  if (kind === 'bad') return `${s.pill} ${s.pillBad}`;
  return `${s.pill} ${s.pillCyan}`;
}

export function AdminRacesView({ data }: { data: AdminRaces }) {
  return (
    <div className={s.wrap}>
      <div className={s.h1}>レース</div>

      <div className={s.kpis}>
        <div className={s.metric}>
          <div className={s.metricK}>Daily Derby 表示モード</div>
          <div className={s.metricV}>{data.daily_derby_live ? 'LIVE(実データ)' : 'プロトタイプ'}</div>
          <div className={s.metricJson}>本番モード固定(2026-07-12〜)・演出確認は「デモ上映」</div>
        </div>
        <div className={s.metric}>
          <div className={s.metricK}>直近レース数(表示分)</div>
          <div className={s.metricV}>{data.races.length}</div>
        </div>
      </div>

      <div>
        <div className={s.secLabel}>RECENT RACES · 直近レース(最大30件)</div>
        {data.races.length > 0 ? (
          <div className={s.list}>
            {data.races.map((r) => (
              <div key={r.id} className={s.row}>
                <span className={s.cDate}>{r.batch_date}</span>
                <span className={pillClass(r.status)}>{r.status}</span>
                <span className={s.steps}>
                  出走 <b>{r.participant_count}</b> · BURN <b>{r.burns}</b> · アイテム使用 <b>{r.item_usages}</b>
                </span>
                {r.surface != null && (
                  <span className={`${s.pill} ${s.pillCyan}`}>{r.weather}/{r.track_condition}/{r.surface}</span>
                )}
                <span className={`${s.cMono} ${s.cSpace}`}>{r.id}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.empty}>レースはまだありません。最初の20:00バッチで生成されます。</div>
        )}
      </div>
    </div>
  );
}
