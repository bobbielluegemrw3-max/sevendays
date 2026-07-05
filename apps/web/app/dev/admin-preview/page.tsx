import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AdminDashboardView } from '@/components/AdminDashboardView';
import { AdminBatchesView } from '@/components/AdminBatchesView';
import { AdminWithdrawalsView } from '@/components/AdminWithdrawalsView';
import { AdminRecoveryView } from '@/components/AdminRecoveryView';
import { AdminAuditLog } from '@/components/AdminAuditLog';
import s from '../../admin.module.css';

/** Dev-only stacked preview of all admin views with fixtures (404 in production). */
const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

export default function AdminPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  const sect = (title: string) => (
    <h2 style={{ margin: '3rem 0 1rem', color: 'var(--magenta-soft)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
      ── {title} ──
    </h2>
  );
  return (
    <div>
      {/* admin nav (same markup as layout) */}
      <nav className={s.nav}>
        <span className={s.brand}><span className={s.brandDot} />ADMIN</span>
        <Link href="#" className={s.navLink}>ダッシュボード</Link>
        <Link href="#" className={s.navLink}>バッチ</Link>
        <Link href="#" className={s.navLink}>出金レビュー</Link>
        <Link href="#" className={s.navLink}>リカバリ</Link>
        <Link href="#" className={s.navLink}>監査ログ</Link>
      </nav>

      {sect('/admin 概要')}
      <AdminDashboardView
        data={{
          latest_batch: { id: 'b-1', batch_date: '2026-07-05', status: 'COMPLETED' },
          economy_status: 'NORMAL',
          metrics: { total_active_horses: 1874, day0_mints: 210, p2p_assignments: 342, burn_count: 201, buyback_started: 45, revenue_usdt: '812.44' },
        }}
      />

      {sect('/admin/batches バッチ')}
      <AdminBatchesView
        batches={[
          { id: 'b-1', batch_date: '2026-07-05', status: 'COMPLETED', completed_at: iso(900), failed_at: null, completed_steps: 37 },
          { id: 'b-2', batch_date: '2026-07-04', status: 'PARTIAL_FAILED', completed_at: null, failed_at: iso(2300), completed_steps: 21 },
          { id: 'b-3', batch_date: '2026-07-03', status: 'FAILED', completed_at: null, failed_at: iso(3800), completed_steps: 9 },
        ]}
      />

      {sect('/admin/withdrawals 出金レビュー')}
      <AdminWithdrawalsView
        withdrawals={[
          {
            id: 'w-1', user_id: 'u-aaaa', chain_id: 'polygon-pos',
            to_address: '0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432',
            requested_amount: '2500.00', status: 'ADMIN_REVIEW', requested_at: iso(120),
            approvals: [{ admin_user_id: 'adm-1', role: 'FINANCE_ADMIN' }],
          },
        ]}
      />

      {sect('/admin/recovery リカバリ')}
      <AdminRecoveryView
        recoveries={[
          {
            id: 'r-1', batch_date: '2026-07-04', batch_status: 'PARTIAL_FAILED',
            recovery_reason: 'Step 21 (BUYBACK_PAYMENTS) timeout — RPC unavailable',
            approval_status: 'PENDING_SECOND', approved_by_1: 'adm-1', approved_by_2: null,
            created_at: iso(300), completed_at: null,
          },
        ]}
      />

      {sect('/admin/audit 監査ログ')}
      <AdminAuditLog
        audit={Array.from({ length: 40 }, (_, i) => ({
          actor_type: i % 3 === 0 ? 'ADMIN' : 'SYSTEM',
          actor_id: i % 3 === 0 ? 'adm-1' : null,
          action: ['WITHDRAWAL_APPROVED', 'BATCH_RETRY', 'RECOVERY_APPROVED', 'POLICY_LOADED'][i % 4]!,
          reference_type: i % 2 === 0 ? 'withdrawal' : 'batch_run',
          reference_id: `ref-${i.toString().padStart(3, '0')}`,
          created_at: iso(i * 47),
        }))}
      />
    </div>
  );
}
