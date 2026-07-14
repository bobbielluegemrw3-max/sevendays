'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/admin.module.css';

/* メンテナンスモードの切替(Decision 098・/adminコックピット)。
 * ONは強い操作なので確認ダイアログを挟む。反映は最大10秒
 * (ブリッジ側キャッシュ)。管理者自身は遮断されない。 */
export function MaintenanceToggle({
  enabled,
  message,
}: {
  enabled: boolean;
  message: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(message);
  const [error, setError] = useState<string | null>(null);

  async function setMode(next: boolean) {
    if (
      next &&
      !window.confirm(
        'メンテナンスモードを開始します。\n一般ユーザーは全ページ・全APIが遮断されます(管理者は影響なし)。\nよろしいですか?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiFetch('/api/v1/admin/maintenance', {
      method: 'POST',
      body: { enabled: next, message: draft },
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '切替に失敗しました');
      return;
    }
    router.refresh();
  }

  return (
    <div className={enabled ? `${s.mnRow} ${s.qBad}` : s.mnRow}>
      <div className={s.mnMain}>
        <div className={s.mnStatus}>
          {enabled ? (
            <span className={`${s.st} ${s.stBad}`}>メンテナンス中</span>
          ) : (
            <span className={`${s.st} ${s.stGood}`}>通常運用中</span>
          )}
          <span className={s.mnHint}>
            {enabled
              ? '一般ユーザーは遮断中(管理者のみ閲覧可)。反映まで最大10秒。'
              : 'ONにすると一般ユーザーは全ページ・全APIが遮断されます(バッチは走り続けます)。'}
          </span>
        </div>
        <input
          className={s.inp}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="ユーザーに表示するメッセージ(任意・例: 2026-07-15 02:00頃まで)"
          maxLength={500}
        />
        {error ? <span className={s.error}>{error}</span> : null}
      </div>
      <button
        type="button"
        className={enabled ? s.btn : `${s.btn} ${s.btnDanger}`}
        onClick={() => void setMode(!enabled)}
        disabled={busy}
      >
        {enabled ? 'メンテナンスを解除' : 'メンテナンスを開始'}
      </button>
    </div>
  );
}
