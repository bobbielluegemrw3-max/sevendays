import s from '../app/admin.module.css';

/* /admin/items — カタログ別の販売・ドロップ・使用状況。純表示。 */

export interface AdminItems {
  catalog: {
    key: string; name_ja: string; band: string; price: string; active: boolean;
    purchased: number; revenue: string; dropped: number; gifted: number; used: number;
  }[];
  setting_distribution: { item_setting: number; count: number }[];
}

const BAND_JA: Record<string, string> = {
  BASIC: 'ベーシック',
  STANDARD: 'スタンダード',
  PREMIUM: 'プレミアム',
  BURN_DROP: 'BURNドロップ限定',
};

function money(v: string): string {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v;
}

export function AdminItemsView({ data }: { data: AdminItems }) {
  const bands = [...new Set(data.catalog.map((c) => c.band))];
  const totalRevenue = data.catalog.reduce((a, c) => a + Number(c.revenue), 0);
  const totalPurchased = data.catalog.reduce((a, c) => a + c.purchased, 0);
  const totalSettings = data.setting_distribution.reduce((a, r) => a + r.count, 0);

  return (
    <div className={s.wrap}>
      <div className={s.h1}>アイテム</div>

      <div className={s.kpis}>
        <div className={s.metric}>
          <div className={s.metricK}>累計販売数</div>
          <div className={s.metricV}>{totalPurchased.toLocaleString()}<small> 個</small></div>
        </div>
        <div className={s.metric}>
          <div className={s.metricK}>累計売上</div>
          <div className={s.metricV}>{totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small> USDT</small></div>
        </div>
        <div className={s.metric}>
          <div className={s.metricK}>BURNドロップ配布</div>
          <div className={s.metricV}>{data.catalog.reduce((a, c) => a + c.dropped, 0).toLocaleString()}<small> 個</small></div>
        </div>
        <div className={s.metric}>
          <div className={s.metricK}>使用(適用)回数</div>
          <div className={s.metricV}>{data.catalog.reduce((a, c) => a + c.used, 0).toLocaleString()}<small> 回</small></div>
        </div>
      </div>

      <div>
        <div className={s.secLabel}>ITEM SETTING · アイテム設定の出現分布(設定1〜6)</div>
        {totalSettings > 0 ? (
          <div className={s.cBadges}>
            {data.setting_distribution.map((r) => (
              <span key={r.item_setting} className={`${s.pill} ${s.pillCyan}`}>
                設定{r.item_setting}: {r.count}レース({Math.round((r.count / totalSettings) * 100)}%)
              </span>
            ))}
          </div>
        ) : (
          <div className={s.empty}>アイテム設定が公開されたレースはまだありません。</div>
        )}
      </div>

      {bands.map((band) => (
        <div key={band}>
          <div className={s.secLabel}>{BAND_JA[band] ?? band}</div>
          <div className={s.list}>
            {data.catalog.filter((c) => c.band === band).map((c) => (
              <div key={c.key} className={s.row}>
                <span className={s.cMain}>{c.name_ja}</span>
                {!c.active && <span className={`${s.pill} ${s.pillBad}`}>停止中</span>}
                <span className={s.cAmount}>{money(c.price)}<small>USDT</small></span>
                <span className={s.steps}>
                  販売 <b>{c.purchased}</b> · 売上 <b>{money(c.revenue)}</b> · ドロップ <b>{c.dropped}</b> · ギフト <b>{c.gifted}</b> · 使用 <b>{c.used}</b>
                </span>
                <span className={`${s.cMono} ${s.cSpace}`}>{c.key}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
