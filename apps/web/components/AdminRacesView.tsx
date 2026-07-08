import { statusKind } from '@/components/admin-shared';
import s from '../app/admin.module.css';

/* /admin/races — 直近レースの運行状況。純表示。 */

export interface AdminRaces {
  races: {
    id: string; batch_date: string; status: string; participant_count: number;
    item_setting: number | null; burns: number; item_usages: number;
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
          <div className={s.metricJson}>環境変数 DAILY_DERBY_LIVE で切替(Render)</div>
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
                {r.item_setting != null && (
                  <span className={`${s.pill} ${s.pillCyan}`}>設定{r.item_setting}</span>
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
