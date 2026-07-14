import Link from 'next/link';
import { AdminDerbyCountdown } from '@/components/AdminDerbyCountdown';
import s from '../app/admin.module.css';

/* ============================================================================
 * /admin(管理ダッシュボード)— 運営コックピット(2026-07-14 オーナー要望)。
 * 「開いて3秒で、今日は安心か・何をすべきかが分かる」を最優先:
 *   ①今夜のダービー(カウントダウン+出走+BURN枠) ②要対応キュー(出金/CS/
 *   リカバリ/バッチ異常) ③直近レース結果 ④経済メトリクス。
 * 旧メニューグリッドは廃止(ナビと完全重複していた)。純表示コンポーネント。
 * ========================================================================== */

export interface AdminDashboard {
  latest_batch: { id: string; batch_date: string; status: string } | null;
  economy_status: string;
  metrics: Record<string, unknown> | null;
}

export interface CockpitDerby {
  next_derby_at: string;
  server_time: string;
  tonight_field: { entrants: number; burn_slots_min: number; burn_slots_max: number } | null;
}

export interface CockpitPending {
  /** null = 取得失敗(そのページで直接確認してもらう) */
  withdrawals: { count: number; total: number } | null;
  cs: number | null;
  recovery: number | null;
}

export interface CockpitLastRace {
  batch_date: string;
  status: string;
  participant_count: number;
  burns: number;
  item_usages: number;
  weather: string | null;
  track_condition: string | null;
  surface: string | null;
}

export interface AdminCockpitData {
  dashboard: AdminDashboard;
  derby: CockpitDerby | null;
  pending: CockpitPending;
  last_race: CockpitLastRace | null;
}

function ecoMeta(status: string): { bar: string; val: string; note: string } {
  const u = (status || '').toUpperCase();
  if (['HEALTHY', 'OK', 'NORMAL'].includes(u)) return { bar: s.ok!, val: s.gd!, note: '経済指標は正常範囲' };
  if (['WARNING', 'DEGRADED', 'CAUTION'].includes(u)) return { bar: s.warn!, val: '', note: '一部指標が閾値に接近' };
  if (['CRITICAL', 'HALTED', 'ERROR'].includes(u)) return { bar: s.bad!, val: '', note: '要対応: 経済指標が異常' };
  return { bar: '', val: '', note: '' };
}

function fmtVal(v: unknown): string {
  if (typeof v === 'number') return v.toLocaleString('en-US');
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return JSON.stringify(v);
}

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 要対応1行。count が null なら取得失敗の注意書きに変わる。 */
function QueueRow({
  tone,
  label,
  detail,
  href,
  cta,
}: {
  tone: 'warn' | 'bad';
  label: string;
  detail: string;
  href: string;
  cta: string;
}) {
  return (
    <Link href={href} className={`${s.qRow} ${tone === 'bad' ? s.qBad : s.qWarn}`}>
      <span className={s.qDot} />
      <span className={s.qLabel}>{label}</span>
      <span className={s.qDetail}>{detail}</span>
      <span className={s.qGo}>{cta} →</span>
    </Link>
  );
}

export function AdminDashboardView({ data }: { data: AdminCockpitData }) {
  const { dashboard, derby, pending, last_race } = data;
  const { latest_batch, economy_status, metrics } = dashboard;
  const eco = ecoMeta(economy_status);
  const entries = metrics ? Object.entries(metrics) : [];

  const batchBad =
    latest_batch && ['FAILED', 'PARTIAL_FAILED'].includes(latest_batch.status.toUpperCase())
      ? latest_batch
      : null;
  const fetchFailed = pending.withdrawals === null || pending.cs === null || pending.recovery === null;
  const queueCount =
    (pending.withdrawals?.count ?? 0) + (pending.cs ?? 0) + (pending.recovery ?? 0) + (batchBad ? 1 : 0);

  const slots = derby?.tonight_field
    ? derby.tonight_field.burn_slots_min === derby.tonight_field.burn_slots_max
      ? String(derby.tonight_field.burn_slots_min)
      : `${derby.tonight_field.burn_slots_min}〜${derby.tonight_field.burn_slots_max}`
    : null;

  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>管理ダッシュボード</h1>
          <div className={s.phSub}>開いて3秒で「今日は安心か・何をすべきか」が分かる入口。</div>
        </div>
      </div>

      {/* ===== ①今夜のダービー ===== */}
      <div className={s.statRow}>
        <div className={`${s.stat} ${s.statBig} ${s.cdCard}`}>
          <div className={s.statK}>今夜のダービーまで</div>
          <div className={`${s.statV} ${s.cd}`}>
            {derby ? (
              <AdminDerbyCountdown targetIso={derby.next_derby_at} serverNowIso={derby.server_time} />
            ) : (
              '—'
            )}
          </div>
          <div className={s.statSub}>毎晩 20:00 MYT・37ステップ一斉精算</div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>今夜の出走</div>
          <div className={s.statV}>
            {derby?.tonight_field ? derby.tonight_field.entrants.toLocaleString() : '—'}
            <span className={s.u}>頭</span>
          </div>
          <div className={s.statSub}>ACTIVE−手動出品(直前購入は明晩デビュー)</div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>今夜のBURN枠</div>
          <div className={s.statV}>
            {slots ?? '—'}
            <span className={s.u}>頭</span>
          </div>
          <div className={s.statSub}>{derby?.tonight_field?.entrants === 0 ? '出走なし' : 'floor(頭数×率)'}</div>
        </div>
        <div className={`${s.stat} ${s.statBig} ${eco.bar}`}>
          <div className={s.statK}>経済状態</div>
          <div className={`${s.statV} ${eco.val}`} style={{ fontSize: 19 }}>
            {economy_status}
          </div>
          {eco.note ? <div className={s.statSub}>{eco.note}</div> : null}
        </div>
      </div>

      {/* ===== ②要対応キュー ===== */}
      <div className={s.sec}>要対応</div>
      {queueCount === 0 && !fetchFailed ? (
        <div className={s.allClear}>
          <span className={s.allClearMark}>✓</span> 対応事項はありません — 出金レビュー・CSメール・リカバリ・バッチすべて正常です。
        </div>
      ) : (
        <div className={s.qList}>
          {batchBad ? (
            <QueueRow
              tone="bad"
              label={`バッチ ${batchBad.status}`}
              detail={`${batchBad.batch_date} — ${batchBad.status === 'PARTIAL_FAILED' ? 'リトライ可能' : 'リカバリ手続きが必要'}`}
              href="/admin/batches"
              cta="バッチ運行"
            />
          ) : null}
          {pending.withdrawals && pending.withdrawals.count > 0 ? (
            <QueueRow
              tone="warn"
              label={`出金レビュー待ち ${pending.withdrawals.count}件`}
              detail={`合計 ${money(pending.withdrawals.total)} USDT — 別人2名の承認が必要`}
              href="/admin/withdrawals"
              cta="レビュー"
            />
          ) : null}
          {pending.cs ? (
            <QueueRow
              tone="warn"
              label={`CS未対応メール ${pending.cs}件`}
              detail="AI下書きを確認して承認送信(全件承認制)"
              href="/admin/support"
              cta="サポート"
            />
          ) : null}
          {pending.recovery ? (
            <QueueRow
              tone="warn"
              label={`リカバリ進行中 ${pending.recovery}件`}
              detail="承認 → 実行の2段階(別人2名)"
              href="/admin/recovery"
              cta="リカバリ"
            />
          ) : null}
          {fetchFailed ? (
            <div className={s.qFetchNote}>一部の件数を取得できませんでした — 各ページで直接確認してください。</div>
          ) : null}
        </div>
      )}

      {/* ===== ③直近レース結果 ===== */}
      <div className={s.sec}>直近レース</div>
      {last_race ? (
        <div className={s.statRow}>
          <div className={s.stat}>
            <div className={s.statK}>開催日</div>
            <div className={s.statV} style={{ fontSize: 17 }}>
              {last_race.batch_date}
            </div>
            <div className={s.statSub}>{last_race.status}</div>
          </div>
          <div className={s.stat}>
            <div className={s.statK}>出走 / BURN</div>
            <div className={s.statV}>
              {last_race.participant_count.toLocaleString()}
              <span className={s.u}>頭</span>
              <span className={s.cdSep}>/</span>
              {last_race.burns.toLocaleString()}
              <span className={s.u}>頭</span>
            </div>
          </div>
          <div className={s.stat}>
            <div className={s.statK}>アイテム使用</div>
            <div className={s.statV}>
              {last_race.item_usages.toLocaleString()}
              <span className={s.u}>回</span>
            </div>
          </div>
          <div className={s.stat}>
            <div className={s.statK}>レース条件</div>
            <div className={s.statV} style={{ fontSize: 15 }}>
              {last_race.surface != null
                ? `${last_race.weather} / ${last_race.track_condition} / ${last_race.surface}`
                : '—'}
            </div>
            <div className={s.statSub}>
              <Link href="/admin/races" className={s.plainLink}>
                レース一覧 →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className={s.empty}>レースはまだありません。最初の20:00バッチで生成されます。</div>
      )}

      {/* ===== ④経済メトリクス ===== */}
      {entries.length > 0 ? (
        <>
          <div className={s.sec}>経済メトリクス{latest_batch ? `(${latest_batch.batch_date} 時点)` : ''}</div>
          <div className={s.statRow}>
            {entries.slice(0, 8).map(([k, v]) => (
              <div key={k} className={s.stat}>
                <div className={s.statK}>{k}</div>
                <div className={s.statV} style={{ fontSize: 17 }}>
                  {fmtVal(v)}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
