import Link from 'next/link';
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
  if (['HEALTHY', 'OK', 'NORMAL'].includes(u)) return { card: s.ecoGood!, dot: s.ecoDotGood!, val: s.ecoValGood!, note: 'バーン率・チャンピオン報酬プールは正常範囲' };
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

const MENU = [
  { href: '/admin/economy', icon: '💰', title: '経済・準備金', desc: 'プラットフォーム勘定残高 / ユーザー資産総額 / 直近の取引種別' },
  { href: '/admin/users', icon: '👤', title: 'ユーザー', desc: 'メール検索 / 残高・馬・BURN・アイテム / 組織(直紹介)' },
  { href: '/admin/items', icon: '🎒', title: 'アイテム', desc: 'カタログ別の販売数・売上 / ドロップ・ギフト / アイテム設定の分布' },
  { href: '/admin/races', icon: '🏇', title: 'レース', desc: '直近レースの頭数・BURN数・アイテム設定 / Daily Derbyモード' },
  { href: '/admin/support', icon: '💬', title: 'サポート(AIメール)', desc: '受信メールのAI下書きを承認して送信 / 全件承認制' },
  { href: '/admin/batches', icon: '⚙️', title: 'バッチ運行', desc: '毎晩20:00 MYTの一斉精算 / ステップ状況 / 失敗リトライ' },
  { href: '/admin/withdrawals', icon: '🏧', title: '出金レビュー', desc: '大口出金(1,000 USDT以上)の2名承認' },
  { href: '/admin/recovery', icon: '🛟', title: 'リカバリ', desc: '障害時の復旧案件 / 承認 → 実行の2段階' },
  { href: '/admin/audit', icon: '📜', title: '監査ログ', desc: '管理操作・システム操作の全記録(直近200件)' },
] as const;

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

      {/* メニュー(ハブ型: 各運営ページへ) */}
      <div>
        <div className={s.secLabel}>MENU · 運営メニュー</div>
        <div className={s.menuGrid}>
          {MENU.map((m) => (
            <Link key={m.href} href={m.href} className={s.menuCard}>
              <span className={s.menuHead}>
                <span className={s.menuIcon} aria-hidden="true">{m.icon}</span>
                <span className={s.menuTitle}>{m.title}</span>
              </span>
              <span className={s.menuDesc}>{m.desc}</span>
              <span className={s.menuArrow}>OPEN →</span>
            </Link>
          ))}
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
