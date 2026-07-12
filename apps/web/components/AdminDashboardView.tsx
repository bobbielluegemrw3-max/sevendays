import Link from 'next/link';
import s from '../app/admin.module.css';

/* ============================================================================
 * /admin(管理ダッシュボード)— Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * 状態を最初の一目で(statBigの左3pxバー)。メニューは絵文字なしの整列グリッド。
 * 純粋な表示コンポーネント。表示は AdminDashboard の値のみ(架空値なし)。
 * ========================================================================== */

export interface AdminDashboard {
  latest_batch: { id: string; batch_date: string; status: string } | null;
  economy_status: string;
  metrics: Record<string, unknown> | null;
}

function ecoMeta(status: string): { bar: string; val: string; note: string } {
  const u = (status || '').toUpperCase();
  if (['HEALTHY', 'OK', 'NORMAL'].includes(u)) return { bar: s.ok!, val: s.gd!, note: 'バーン率・チャンピオン報酬プールは正常範囲' };
  if (['WARNING', 'DEGRADED', 'CAUTION'].includes(u)) return { bar: s.warn!, val: '', note: '一部指標が閾値に接近しています' };
  if (['CRITICAL', 'HALTED', 'ERROR'].includes(u)) return { bar: s.bad!, val: '', note: '要対応: 経済指標が異常です' };
  return { bar: '', val: '', note: '' };
}

function batchSt(status: string): string {
  const u = (status || '').toUpperCase();
  if (u === 'COMPLETED') return s.stGood!;
  if (u === 'FAILED') return s.stBad!;
  return s.stWarn!;
}

function fmtVal(v: unknown): string {
  if (typeof v === 'number') return v.toLocaleString('en-US');
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return JSON.stringify(v);
}

const MENU = [
  { href: '/admin/economy', glyph: '経', title: '経済・準備金', desc: 'プラットフォーム勘定残高 / ユーザー資産総額 / 直近の取引種別' },
  { href: '/admin/users', glyph: 'U', title: 'ユーザー', desc: 'メール検索 / 残高・馬・BURN・アイテム / 組織(直紹介)' },
  { href: '/admin/items', glyph: '物', title: 'アイテム', desc: 'カタログ別の販売数・売上 / ドロップ・ギフト / アイテム設定の分布' },
  { href: '/admin/races', glyph: '走', title: 'レース', desc: '直近レースの頭数・BURN数・アイテム設定 / Daily Derbyモード' },
  { href: '/admin/support', glyph: 'C', title: 'サポート(AIメール)', desc: '受信メールのAI下書きを承認して送信 / 全件承認制' },
  { href: '/admin/batches', glyph: '批', title: 'バッチ運行', desc: '毎晩20:00 MYTの一斉精算 / ステップ状況 / 失敗リトライ' },
  { href: '/admin/withdrawals', glyph: '出', title: '出金レビュー', desc: '大口出金(1,000 USDT以上)の2名承認' },
  { href: '/admin/recovery', glyph: '復', title: 'リカバリ', desc: '障害時の復旧案件 / 承認 → 実行の2段階' },
  { href: '/admin/audit', glyph: '監', title: '監査ログ', desc: '管理操作・システム操作の全記録(直近200件)' },
] as const;

export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  const { latest_batch, economy_status, metrics } = data;
  const eco = ecoMeta(economy_status);
  const entries = metrics ? Object.entries(metrics) : [];

  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>管理ダッシュボード</h1>
          <div className={s.phSub}>運営の入口。異常があればここで気づける状態を最優先。</div>
        </div>
      </div>

      {/* 状態ストリップ: 経済 + 最新バッチ + 先頭メトリクス2件 */}
      <div className={s.statRow}>
        <div className={`${s.stat} ${s.statBig} ${eco.bar}`}>
          <div className={s.statK}>ECONOMY STATUS · 経済状態</div>
          <div className={`${s.statV} ${eco.val}`}>{economy_status}</div>
          {eco.note ? <div className={s.statSub}>{eco.note}</div> : null}
        </div>
        <div className={`${s.stat} ${s.statBig}`}>
          <div className={s.statK}>LATEST BATCH · 最新バッチ</div>
          <div className={s.statV} style={{ fontSize: 19 }}>
            {latest_batch ? latest_batch.batch_date : 'なし'}{' '}
            {latest_batch ? (
              <span className={`${s.st} ${batchSt(latest_batch.status)}`} style={{ verticalAlign: 3 }}>
                {latest_batch.status}
              </span>
            ) : null}
          </div>
          <div className={s.statSub}>毎晩20:00 MYT の一斉精算</div>
        </div>
        {entries.slice(0, 2).map(([key, value]) => (
          <div key={key} className={s.stat}>
            <div className={s.statK}>{key}</div>
            <div className={s.statV}>{fmtVal(value)}</div>
          </div>
        ))}
      </div>

      <div className={s.sec}>MENU · 運営メニュー</div>
      <div className={s.menu}>
        {MENU.map((m) => (
          <Link key={m.href} href={m.href} className={s.mCard}>
            <span className={s.mTop}>
              <span className={s.mGlyph} aria-hidden="true">{m.glyph}</span>
              <span className={s.mTitle}>{m.title}</span>
            </span>
            <span className={s.mDesc}>{m.desc}</span>
          </Link>
        ))}
      </div>

      <div className={s.sec}>経済メトリクス · ECONOMY METRICS</div>
      {entries.length > 0 ? (
        <div className={s.statRow}>
          {entries.map(([key, value]) => (
            <div key={key} className={s.stat}>
              <div className={s.statK}>{key}</div>
              <div className={s.statV} style={{ fontSize: 16, overflowWrap: 'anywhere' }}>{fmtVal(value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.empty}>バッチ実行前のためメトリクスはありません。今夜20:00の精算後に集計されます。</div>
      )}
    </div>
  );
}
