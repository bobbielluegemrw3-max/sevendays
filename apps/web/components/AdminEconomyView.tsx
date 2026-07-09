import s from '../app/admin.module.css';

/* /admin/economy — プラットフォーム勘定・ユーザー資産・直近取引。純表示。 */

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
  return (
    <div className={s.wrap}>
      <div className={s.h1}>経済・準備金</div>

      <div>
        <div className={s.secLabel}>PLATFORM ACCOUNTS · プラットフォーム勘定</div>
        <div className={s.kpis}>
          {data.platform_accounts.map((a) => (
            <div key={a.account_type} className={s.metric}>
              <div className={s.metricK}>{ACCOUNT_JA[a.account_type] ?? a.account_type}</div>
              <div className={s.metricV}>{money(a.balance)}<small> USDT</small></div>
              <div className={s.metricJson}>{a.account_type}</div>
            </div>
          ))}
          {data.platform_accounts.length === 0 && (
            <div className={s.empty}>プラットフォーム勘定がまだありません。</div>
          )}
        </div>
      </div>

      <div>
        <div className={s.secLabel}>USER FUNDS · ユーザー資産(総額)</div>
        <div className={s.kpis}>
          {data.user_totals.map((t) => (
            <div key={t.account_type} className={s.metric}>
              <div className={s.metricK}>{t.account_type === 'USER_AVAILABLE' ? '利用可能残高 合計' : 'ロック中残高 合計'}</div>
              <div className={s.metricV}>{money(t.total)}<small> USDT</small></div>
              <div className={s.metricJson}>{t.holders.toLocaleString()} アカウント</div>
            </div>
          ))}
          <div className={s.metric}>
            <div className={s.metricK}>ユーザー(稼働/総数)</div>
            <div className={s.metricV}>{data.users.active.toLocaleString()} / {data.users.total.toLocaleString()}</div>
          </div>
          <div className={s.metric}>
            <div className={s.metricK}>馬(稼働/総数)</div>
            <div className={s.metricV}>{data.horses.active.toLocaleString()} / {data.horses.total.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div>
        <div className={s.secLabel}>LAST 7 DAYS · 直近7日の取引種別</div>
        {data.recent_transactions.length > 0 ? (
          <div className={s.list}>
            {data.recent_transactions.map((t) => (
              <div key={t.transaction_type} className={s.row}>
                <span className={s.cMain}>{t.transaction_type}</span>
                <span className={s.cAmount}>{t.count.toLocaleString()}<small>件</small></span>
                <span className={`${s.cDate} ${s.cSpace}`}>最終: {t.last_at.slice(0, 19)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.empty}>直近7日間に台帳取引はありません。</div>
        )}
      </div>
    </div>
  );
}
