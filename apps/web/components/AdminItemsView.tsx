import s from '../app/admin.module.css';

/* /admin/items — Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * カタログ別の販売・ドロップ・使用状況をバンド別テーブルで。純表示。 */

export interface AdminItems {
  catalog: {
    key: string; name_ja: string; band: string; price: string; active: boolean;
    purchased: number; revenue: string; dropped: number; gifted: number; used: number;
  }[];
  condition_distribution: { weather: string; track: string; surface: string; count: number }[];
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
  const totalConditions = data.condition_distribution.reduce((a, r) => a + r.count, 0);

  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>アイテム</h1>
        </div>
      </div>

      <div className={s.statRow}>
        <div className={s.stat}>
          <div className={s.statK}>累計販売数</div>
          <div className={s.statV}>{totalPurchased.toLocaleString()}<span className={s.u}>個</span></div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>累計売上</div>
          <div className={s.statV}>{totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className={s.u}>USDT</span></div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>BURNドロップ配布</div>
          <div className={s.statV}>{data.catalog.reduce((a, c) => a + c.dropped, 0).toLocaleString()}<span className={s.u}>個</span></div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>使用(適用)回数</div>
          <div className={s.statV}>{data.catalog.reduce((a, c) => a + c.used, 0).toLocaleString()}<span className={s.u}>回</span></div>
        </div>
      </div>

      <div className={s.sec}>RACE CONDITIONS · 公開されたレース条件の分布</div>
      {totalConditions > 0 ? (
        <div className={s.badges}>
          {data.condition_distribution.map((r) => (
            <span key={`${r.weather}:${r.track}:${r.surface}`} className={s.tag}>
              {r.weather}/{r.track}/{r.surface}: {r.count}レース({Math.round((r.count / totalConditions) * 100)}%)
            </span>
          ))}
        </div>
      ) : (
        <div className={s.empty}>条件が公開されたレースはまだありません。</div>
      )}

      {bands.map((band) => {
        const items = data.catalog.filter((c) => c.band === band);
        return (
          <div key={band}>
            <div className={s.sec}>{BAND_JA[band] ?? band}</div>
            <div className={`${s.tableWrap} ${s.desktopTable}`}>
              <table className={s.tbl}>
                <thead>
                  <tr>
                    <th>アイテム</th><th>状態</th><th className={s.tRight}>価格</th>
                    <th className={s.tRight}>販売</th><th className={s.tRight}>売上</th>
                    <th className={s.tRight}>ドロップ</th><th className={s.tRight}>ギフト</th>
                    <th className={s.tRight}>使用</th><th>key</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.key}>
                      <td className={s.strong}>{c.name_ja}</td>
                      <td>{c.active ? <span className={`${s.st} ${s.stGood}`}>販売中</span> : <span className={`${s.st} ${s.stBad}`}>停止中</span>}</td>
                      <td className={s.num}>{money(c.price)}<span className={s.u}>USDT</span></td>
                      <td className={s.num}>{c.purchased.toLocaleString()}</td>
                      <td className={s.num}>{money(c.revenue)}</td>
                      <td className={s.num}>{c.dropped.toLocaleString()}</td>
                      <td className={s.num}>{c.gifted.toLocaleString()}</td>
                      <td className={s.num}>{c.used.toLocaleString()}</td>
                      <td className={s.mono}>{c.key}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={s.mcard}>
              {items.map((c) => (
                <div key={c.key} className={s.mc}>
                  <div className={s.mcTop}>
                    <span className={s.mcName}>{c.name_ja}</span>
                    {c.active ? <span className={`${s.st} ${s.stGood}`}>販売中</span> : <span className={`${s.st} ${s.stBad}`}>停止中</span>}
                  </div>
                  <div className={s.mcGrid}>
                    <div className={s.mcCell}><span className={s.k}>価格</span><span className={s.v}>{money(c.price)}</span></div>
                    <div className={s.mcCell}><span className={s.k}>販売</span><span className={s.v}>{c.purchased}</span></div>
                    <div className={s.mcCell}><span className={s.k}>売上</span><span className={s.v}>{money(c.revenue)}</span></div>
                    <div className={s.mcCell}><span className={s.k}>ドロップ</span><span className={s.v}>{c.dropped}</span></div>
                    <div className={s.mcCell}><span className={s.k}>ギフト</span><span className={s.v}>{c.gifted}</span></div>
                    <div className={s.mcCell}><span className={s.k}>使用</span><span className={s.v}>{c.used}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
