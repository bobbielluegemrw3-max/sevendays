import s from '../app/admin.module.css';

/* /admin/economy — Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * 勘定は残高を右揃えテーブルで縦比較。純表示。 */

export interface AdminEconomy {
  platform_accounts: { account_type: string; balance: string }[];
  user_totals: { account_type: string; holders: number; total: string }[];
  users: { total: number; active: number };
  horses: { total: number; active: number };
  recent_transactions: { transaction_type: string; count: number; last_at: string }[];
}

const ACCOUNT_JA: Record<string, string> = {
  PLATFORM_MINT_REVENUE: 'ミント売上',
  PLATFORM_BUYBACK_RESERVE: '買戻準備金(チャンピオン報酬)',
  PLATFORM_MLM_RESERVE: 'サポートボーナス準備金',
  PLATFORM_OPERATING_RESERVE: '運営準備金',
  PLATFORM_EMERGENCY_RESERVE: '緊急準備金',
  PLATFORM_SETTLEMENT_CLEARING: '精算クリアリング',
  PLATFORM_DEPOSIT_CLEARING: '入金クリアリング',
  PLATFORM_WITHDRAWAL_CLEARING: '出金クリアリング',
  PLATFORM_ITEM_CLEARING: 'アイテム精算クリアリング',
};

function money(v: string): string {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v;
}

export function AdminEconomyView({ data }: { data: AdminEconomy }) {
  const available = data.user_totals.find((t) => t.account_type === 'USER_AVAILABLE');
  const locked = data.user_totals.find((t) => t.account_type !== 'USER_AVAILABLE');
  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>経済・準備金</h1>
        </div>
      </div>

      <div className={s.sec}>USER FUNDS · ユーザー資産(サマリー)</div>
      <div className={s.statRow}>
        <div className={s.stat}>
          <div className={s.statK}>利用可能残高 合計</div>
          <div className={s.statV}>{money(available?.total ?? '0')}<span className={s.u}>USDT</span></div>
          <div className={s.statSub}>{(available?.holders ?? 0).toLocaleString()} アカウント</div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>ロック中残高 合計</div>
          <div className={s.statV}>{money(locked?.total ?? '0')}<span className={s.u}>USDT</span></div>
          <div className={s.statSub}>{(locked?.holders ?? 0).toLocaleString()} アカウント</div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>ユーザー(稼働/総数)</div>
          <div className={s.statV}>{data.users.active.toLocaleString()}<span className={s.u}>/ {data.users.total.toLocaleString()}</span></div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>馬(稼働/総数)</div>
          <div className={s.statV}>{data.horses.active.toLocaleString()}<span className={s.u}>/ {data.horses.total.toLocaleString()}</span></div>
        </div>
      </div>

      <div className={s.sec}>PLATFORM ACCOUNTS · プラットフォーム勘定</div>
      {data.platform_accounts.length > 0 ? (
        <>
          <div className={`${s.tableWrap} ${s.desktopTable}`}>
            <table className={s.tbl}>
              <thead>
                <tr><th>勘定</th><th className={s.tRight}>残高</th><th>account_type</th></tr>
              </thead>
              <tbody>
                {data.platform_accounts.map((a) => (
                  <tr key={a.account_type}>
                    <td className={s.strong}>{ACCOUNT_JA[a.account_type] ?? a.account_type}</td>
                    <td className={s.num}>{money(a.balance)}<span className={s.u}>USDT</span></td>
                    <td className={s.mono}>{a.account_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {data.platform_accounts.map((a) => (
              <div key={a.account_type} className={s.mc}>
                <div className={s.mcTop}><span className={s.mcName}>{ACCOUNT_JA[a.account_type] ?? a.account_type}</span></div>
                <div className={s.mcCell}><span className={s.k}>{a.account_type}</span><span className={s.v}>{money(a.balance)} USDT</span></div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={s.empty}>プラットフォーム勘定がまだありません。</div>
      )}

      <div className={s.sec}>LAST 7 DAYS · 直近7日の取引種別</div>
      {data.recent_transactions.length > 0 ? (
        <>
          <div className={`${s.tableWrap} ${s.desktopTable}`}>
            <table className={s.tbl}>
              <thead>
                <tr><th>取引種別</th><th className={s.tRight}>件数</th><th>最終時刻</th></tr>
              </thead>
              <tbody>
                {data.recent_transactions.map((t) => (
                  <tr key={t.transaction_type}>
                    <td className={s.mono} style={{ color: 'var(--c-ink)' }}>{t.transaction_type}</td>
                    <td className={s.num}>{t.count.toLocaleString()}<span className={s.u}>件</span></td>
                    <td className={s.date}>{t.last_at.slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {data.recent_transactions.map((t) => (
              <div key={t.transaction_type} className={s.mc}>
                <div className={s.mcTop}><span className={s.mcName} style={{ fontSize: 12.5 }}>{t.transaction_type}</span></div>
                <div className={s.mcCell}><span className={s.k}>{t.last_at.slice(0, 16).replace('T', ' ')}</span><span className={s.v}>{t.count.toLocaleString()} 件</span></div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={s.empty}>直近7日間に台帳取引はありません。</div>
      )}
    </div>
  );
}
