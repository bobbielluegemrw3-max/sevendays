import { localDateTime } from '@/lib/format-time';
import { MarketingTransferControls, MarketingApproveButton } from '@/components/MarketingTransferControls';
import s from '../app/admin.module.css';

/* /admin/marketing — 運営広告費口座(FUN改修 B層・FUN_V2_PLAN §4)。
 * 「吐き出し」の器: レースの数学は曲げず、賞金イベントの原資をここから足す。
 * 帳簿上の移動のみ(現物USDTウォレットは1つ)。ユーザーには残高・予算を見せない。
 * 承認は fund-grant と同じ閾値思想(≤1,000=1名即時 / 超=二重承認・申請者≠承認者)。 */

export interface MarketingTransfer {
  id: string;
  direction: 'FUND' | 'RETURN';
  amount: string;
  reason: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  requested_by_email: string;
  requested_by: string;
}

export interface AdminMarketing {
  operating_reserve: string;
  marketing_budget: string;
  single_approval_limit: number;
  transfers: MarketingTransfer[];
}

function money(v: string): string {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v;
}

export function AdminMarketingView({ data }: { data: AdminMarketing }) {
  const pending = data.transfers.filter((t) => t.status === 'PENDING');
  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>運営広告費</h1>
        </div>
      </div>

      <div className={s.sec}>口座残高(帳簿上の仕切り — 現物ウォレットは1つ)</div>
      <div className={s.statRow}>
        <div className={s.stat}>
          <div className={s.statK}>広告費口座</div>
          <div className={s.statV}>{money(data.marketing_budget)}<span className={s.u}>USDT</span></div>
          <div className={s.statSub}>ジャックポット・イベント賞金の原資(ユーザー非公開)</div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>運営準備金(移動元)</div>
          <div className={s.statV}>{money(data.operating_reserve)}<span className={s.u}>USDT</span></div>
          <div className={s.statSub}>FUND=準備金→広告費 / RETURN=広告費→準備金</div>
        </div>
      </div>

      <div className={s.sec}>資金の移動</div>
      <MarketingTransferControls singleApprovalLimit={data.single_approval_limit} />

      <div className={s.sec}>移動履歴{pending.length > 0 ? `(承認待ち ${pending.length}件)` : ''}</div>
      {data.transfers.length === 0 ? (
        <p className="empty">まだ移動はありません。</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.tbl}>
            <thead>
              <tr>
                <th>日時</th><th>方向</th><th className={s.tRight}>金額</th>
                <th>理由</th><th>申請者</th><th>状態</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.transfers.map((t) => (
                <tr key={t.id}>
                  <td>{localDateTime(t.created_at)}</td>
                  <td>{t.direction === 'FUND' ? '準備金→広告費' : '広告費→準備金'}</td>
                  <td className={s.num}>{money(t.amount)}</td>
                  <td>{t.reason}</td>
                  <td>{t.requested_by_email}</td>
                  <td>{t.status === 'PENDING' ? '承認待ち(二重承認)' : t.status === 'APPROVED' ? '承認済み' : t.status}</td>
                  <td>{t.status === 'PENDING' ? <MarketingApproveButton transferId={t.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={s.note}>
        イベントからの払い出し(ジャックポット等)は弁護士確認のOK後に実装解禁(FUN_V2_PLAN §4)。
        この口座から出金・オンチェーン移動の経路はありません。
      </p>
    </div>
  );
}
