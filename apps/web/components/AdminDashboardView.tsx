import s from '../app/admin.module.css';

/* ============================================================================
 * /admin(管理ダッシュボード)再設計 — 1c 部品言語 + ADMINアクセント。内部向け。
 * 純粋な表示コンポーネント。表示は AdminDashboard の値のみ(架空値なし)。
 * データ取得層 page.tsx は依頼側で結線。
 * ========================================================================== */

export interface AdminDashboard {
  latest_batch: { id: string; batch_date: string; status: string } | null;
  economy_status: string;
  metrics: Record<string, unknown> | null;
}

function ecoMeta(status: string): { card: string; dot: string; val: string; note: string } {
  const u = (status || '').toUpperCase();
  if (['HEALTHY', 'OK', 'NORMAL'].includes(u)) return { card: s.ecoGood!, dot: s.ecoDotGood!, val: s.ecoValGood!, note: 'バーン率・買い戻しプールは正常範囲' };
  if (['WARNING', 'DEGRADED', 'CAUTION'].includes(u)) return { card: s.ecoWarn!, dot: s.ecoDotWarn!, val: s.ecoValWarn!, note: '一部指標が閾値に接近しています' };
  if (['CRITICAL', 'HALTED', 'ERROR'].includes(u)) return { card: s.ecoBad!, dot: s.ecoDotBad!, val: s.ecoValBad!, note: '要対応: 経済指標が異常です' };
  return { card: s.ecoDefault!, dot: s.ecoDotDefault!, val: s.ecoValDefault!, note: '' };
}

function fmtVal(v: unknown): { text: string; isJson: boolean } {
  if (typeof v === 'number') return { text: v.toLocaleString('en-US'), isJson: false };
  if (typeof v === 'string') return { text: v, isJson: false };
  if (typeof v === 'boolean') return { text: v ? 'true' : 'false', isJson: false };
  return { text: JSON.stringify(v), isJson: true };
}

export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  const { latest_batch, economy_status, metrics } = data;
  const eco = ecoMeta(economy_status);
  const entries = metrics ? Object.entries(metrics) : [];

  return (
    <div className={s.wrap}>
      <div className={s.h1}>管理ダッシュボード</div>

      {/* 経済ステータス + 最新バッチ */}
      <div className={s.top}>
        <div className={`${s.eco} ${eco.card}`}>
          <div className={s.ecoK}>ECONOMY STATUS</div>
          <div className={s.ecoRow}>
            <span className={`${s.ecoDot} ${eco.dot}`} />
            <span className={`${s.ecoVal} ${eco.val}`}>{economy_status}</span>
          </div>
          {eco.note ? <div className={s.ecoNote}>{eco.note}</div> : null}
        </div>
        <div className={s.batch}>
          <div className={s.batchK}>最新バッチ · LATEST BATCH</div>
          <div className={s.batchRow}>
            <span className={s.batchDate}>{latest_batch ? latest_batch.batch_date : 'なし'}</span>
            {latest_batch ? <span className={s.badge}>{latest_batch.status}</span> : null}
          </div>
          <div className={s.batchNote}>毎晩20:00 MYT の一斉精算</div>
        </div>
      </div>

      {/* 経済メトリクス */}
      <div>
        <div className={s.secLabel}>経済メトリクス · ECONOMY METRICS</div>
        {entries.length > 0 ? (
          <div className={s.metrics}>
            {entries.map(([key, value]) => {
              const f = fmtVal(value);
              return (
                <div key={key} className={s.metric}>
                  <div className={s.metricK}>{key}</div>
                  <div className={f.isJson ? s.metricJson : s.metricV}>{f.text}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={s.empty}>バッチ実行前のためメトリクスはありません。今夜20:00の精算後に集計されます。</div>
        )}
      </div>
    </div>
  );
}
