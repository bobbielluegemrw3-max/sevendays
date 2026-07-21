/**
 * 公開表示用の匿名ハンドル(ADR-007 / Decision 073・076)。
 * stable_name があればそれを、無ければメールを伏せる。メール生値は決して出さない。
 * (既存の各エンドポイントに散在する同一ロジックの集約。施策D で再利用。)
 */
export function maskHandle(email: string | null, stableName: string | null): string {
  if (stableName) return stableName;
  if (!email) return '—';
  if (email.endsWith('@user.sevendays')) return 'ウォレットユーザー';
  return `${email.slice(0, 2)}***`;
}
