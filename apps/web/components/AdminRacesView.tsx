import { statusKind } from '@/components/admin-shared';
import s from '../app/admin.module.css';

/* /admin/races — Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * 開催回テーブル(日付・出走数・BURN数・状態)。純表示。 */

export interface AdminRaces {
  races: {
    id: string; batch_date: string; status: string; participant_count: number;
    weather: string | null; track_condition: string | null; surface: string | null;
    burns: number; item_usages: number;
    completed_at: string | null;
  }[];
  daily_derby_live: boolean;
}

const ST: Record<string, string> = { good: s.stGood!, warn: s.stWarn!, bad: s.stBad!, cyan: s.stNeutral!, muted: s.stNeutral! };

export function AdminRacesView({ data }: { data: AdminRaces }) {
  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>レース</h1>
        </div>
      </div>

      <div className={s.statRow}>
        <div className={s.stat}>
          <div className={s.statK}>Daily Derby 表示モード</div>
          <div className={s.statV} style={{ fontSize: 16 }}>{data.daily_derby_live ? 'LIVE(実データ)' : 'プロトタイプ'}</div>
          <div className={s.statSub}>本番モード固定(2026-07-12〜)・演出確認は「デモ上映」</div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>直近レース数(表示分)</div>
          <div className={s.statV}>{data.races.length}</div>
        </div>
      </div>

      <div className={s.sec}>直近レース(最大30件)</div>
      {data.races.length > 0 ? (
        <>
          <div className={`${s.tableWrap} ${s.desktopTable}`}>
            <table className={s.tbl}>
              <thead>
                <tr>
                  <th>batch date</th><th>状態</th><th className={s.tRight}>出走</th>
                  <th className={s.tRight}>BURN</th><th className={s.tRight}>アイテム使用</th>
                  <th>条件</th><th>race id</th>
                </tr>
              </thead>
              <tbody>
                {data.races.map((r) => (
                  <tr key={r.id}>
                    <td className={s.date}>{r.batch_date}</td>
                    <td><span className={`${s.st} ${ST[statusKind(r.status)]}`}>{r.status}</span></td>
                    <td className={s.num}>{r.participant_count.toLocaleString()}</td>
                    <td className={s.num}>{r.burns.toLocaleString()}</td>
                    <td className={s.num}>{r.item_usages.toLocaleString()}</td>
                    <td>{r.surface != null ? <span className={s.tag}>{r.weather}/{r.track_condition}/{r.surface}</span> : '—'}</td>
                    <td className={`${s.mono} ${s.ell}`}>{r.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {data.races.map((r) => (
              <div key={r.id} className={s.mc}>
                <div className={s.mcTop}>
                  <span className={s.mcName}>{r.batch_date}</span>
                  <span className={`${s.st} ${ST[statusKind(r.status)]}`}>{r.status}</span>
                </div>
                <div className={s.mcGrid}>
                  <div className={s.mcCell}><span className={s.k}>出走</span><span className={s.v}>{r.participant_count}</span></div>
                  <div className={s.mcCell}><span className={s.k}>BURN</span><span className={s.v}>{r.burns}</span></div>
                  <div className={s.mcCell}><span className={s.k}>アイテム使用</span><span className={s.v}>{r.item_usages}</span></div>
                  <div className={s.mcCell}><span className={s.k}>条件</span><span className={s.v}>{r.surface != null ? `${r.weather}/${r.track_condition}/${r.surface}` : '—'}</span></div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={s.empty}>レースはまだありません。最初の20:00バッチで生成されます。</div>
      )}
    </div>
  );
}
