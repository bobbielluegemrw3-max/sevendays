// PreToolUse hook: 生の `supabase db push` をブロックする(2026-07-20 事故の再発防止)。
// 適用済み・未記録のマイグレーションを db push が再実行し、試運転データが全消失した。
// 適用は必ず scripts/safe-db-push.mjs(pending照合つき)を通すこと。
import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const cmd = String(input?.tool_input?.command ?? '');
// 引用文字列・ヒアストリング内(コミットメッセージ等)の言及は実行ではないので除外
const stripped = cmd
  .replace(/@'[\s\S]*?'@/g, '')
  .replace(/@"[\s\S]*?"@/g, '')
  .replace(/'[^']*'/g, '')
  .replace(/"(?:\\.|[^"\\])*"/g, '');
if (/\bsupabase\b[\s\S]*\bdb\s+push\b/.test(stripped)) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          '生の supabase db push は禁止(2026-07-20: 未記録のリセットmigrationが再実行されデータ消失)。' +
          '必ず `node scripts/safe-db-push.mjs <14桁version>` を使う(pending照合つき・確認のみは --list)。' +
          '手動適用済みのmigrationは `supabase migration repair --status applied <version>` で記録する。',
      },
    }),
  );
}
process.exit(0);
