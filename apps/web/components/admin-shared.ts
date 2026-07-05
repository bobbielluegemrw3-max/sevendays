/* admin-shared — 内部管理画面の共通ヘルパ(純粋・JSXなし)。 */

export type StatusKind = 'good' | 'warn' | 'bad' | 'cyan' | 'muted';

/** 状態文字列 → 意味色。未知は cyan(中立の情報色)。 */
export function statusKind(status: string): StatusKind {
  const u = (status || '').toUpperCase();
  if (['COMPLETED', 'SETTLED', 'OK', 'APPROVED', 'PAID', 'HEALTHY', 'SUCCESS'].includes(u)) return 'good';
  if (['PARTIAL_FAILED', 'PENDING', 'PENDING_APPROVAL', 'IN_PROGRESS', 'RUNNING', 'WARNING', 'REVIEW'].includes(u)) return 'warn';
  if (['FAILED', 'REJECTED', 'ERROR', 'HALTED', 'CRITICAL', 'CANCELLED'].includes(u)) return 'bad';
  return 'cyan';
}
