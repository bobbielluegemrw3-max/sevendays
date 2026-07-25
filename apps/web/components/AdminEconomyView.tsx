import { localDateTime, localDateTimeSec } from '@/lib/format-time';
import s from '../app/admin.module.css';

/* /admin/economy — Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * 勘定は残高を右揃えテーブルで縦比較。純表示。 */

export interface AdminEconomy {
  platform_accounts: { account_type: string; balance: string }[];
  user_totals: { account_type: string; holders: number; total: string }[];
  users: { total: number; active: number };
  horses: { total: number; active: number };
  recent_transactions: { transaction_type: string; count: number; last_at: string }[];
  /** H-2: ソルベンシー信号(実エンジン指標)。取得失敗/バッチ未実行では null/NORMAL。 */
  economy_status?: string;
  batch_date?: string | null;
  solvency?: {
    cashCoverageRatio: number;
    buybackCashCoverageRatio: number;
    buybackLiabilityRatio: number;
    forecastedCashCoverage: number;
  } | null;
}

/** H-2: 経済状態の色(C-1 の AdminDashboardView.ecoMeta と同じ4状態マップ)。 */
function statMeta(status: string): { bar: string; note: string } {
  const u = (status || '').toUpperCase();
  if (['NORMAL', 'HEALTHY', 'OK'].includes(u)) return { bar: s.ok ?? '', note: '経済指標は正常範囲' };
  if (['WATCH', 'WARNING', 'CAUTION'].includes(u)) return { bar: s.warn ?? '', note: '注意: 準備金カバレッジが低下' };
  if (['WINTER'].includes(u)) return { bar: s.bad ?? '', note: '警告: 冬モード(準備金保全)発動中' };
  if (['EMERGENCY', 'CRITICAL', 'HALTED'].includes(u)) return { bar: s.bad ?? '', note: '🔴 緊急: 準備金が危機水準' };
  return { bar: s.warn ?? '', note: `未知の経済状態: ${status}` };
}

/** カバレッジ比の表示(ゼロ除算は"十分"・大きい値は上限表記)。 */
function ratioFmt(r: number): string {
  if (!Number.isFinite(r)) return '十分';
  if (r >= 10) return '10×+';
  return `${r.toFixed(2)}×`;
}
/** カバレッジ比の色: 1.0以上=充足(緑)/0.8以上=注意/未満=不足(赤)。 */
function coverageTone(r: number): string {
  if (!Number.isFinite(r) || r >= 1.0) return s.gd ?? '';
  return '';
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

      {/* H-2: ソルベンシー信号 — 生残高だけでなく状態とカバレッジ比(閉じた経済の不変量)。 */}
      <div className={s.sec}>ソルベンシー信号{data.batch_date ? `(${data.batch_date} 時点)` : ''}</div>
      <div className={s.statRow}>
        <div className={`${s.stat} ${s.statBig} ${statMeta(data.economy_status ?? 'NORMAL').bar}`}>
          <div className={s.statK}>経済状態</div>
          <div className={s.statV} style={{ fontSize: 19 }}>{data.economy_status ?? 'NORMAL'}</div>
          <div className={s.statSub}>{statMeta(data.economy_status ?? 'NORMAL').note}</div>
        </div>
        {data.solvency ? (
          <>
            <div className={s.stat}>
              <div className={s.statK}>買戻し現金カバレッジ</div>
              <div className={`${s.statV} ${coverageTone(data.solvency.buybackCashCoverageRatio)}`}>{ratioFmt(data.solvency.buybackCashCoverageRatio)}</div>
              <div className={s.statSub}>チャンピオン報酬の現金手当</div>
            </div>
            <div className={s.stat}>
              <div className={s.statK}>現金カバレッジ</div>
              <div className={`${s.statV} ${coverageTone(data.solvency.cashCoverageRatio)}`}>{ratioFmt(data.solvency.cashCoverageRatio)}</div>
            </div>
            <div className={s.stat}>
              <div className={s.statK}>予測現金カバレッジ</div>
              <div className={`${s.statV} ${coverageTone(data.solvency.forecastedCashCoverage)}`}>{ratioFmt(data.solvency.forecastedCashCoverage)}</div>
              <div className={s.statSub}>30日先の見通し</div>
            </div>
            <div className={s.stat}>
              <div className={s.statK}>買戻し負債比</div>
              <div className={s.statV}>{ratioFmt(data.solvency.buybackLiabilityRatio)}</div>
            </div>
          </>
        ) : (
          <div className={s.stat}>
            <div className={s.statK}>カバレッジ比</div>
            <div className={s.statV}>—</div>
            <div className={s.statSub}>バッチ未実行(初回20:00後に算出)</div>
          </div>
        )}
      </div>
      <div className={s.note} style={{ marginTop: 6 }}>
        BURN率・チャンピオン到達率(公開データからの計算)は <a href="/ledger">公開台帳 /ledger</a> で検証できます。
      </div>

      <div className={s.sec}>ユーザー資産(サマリー)</div>
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

      <div className={s.sec}>プラットフォーム勘定</div>
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

      <div className={s.sec}>直近7日の取引種別</div>
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
                    <td className={s.date}>{localDateTimeSec(t.last_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {data.recent_transactions.map((t) => (
              <div key={t.transaction_type} className={s.mc}>
                <div className={s.mcTop}><span className={s.mcName} style={{ fontSize: 12.5 }}>{t.transaction_type}</span></div>
                <div className={s.mcCell}><span className={s.k}>{localDateTime(t.last_at)}</span><span className={s.v}>{t.count.toLocaleString()} 件</span></div>
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
