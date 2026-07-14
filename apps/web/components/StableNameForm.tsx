'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '@/app/account.module.css';

/**
 * 厩舎名の設定(Decision 097)。公開名 — マイ厩舎タイトル・成約相手・
 * 組織マップ・ギフト差出人に表示される。2〜20文字・一意・1日1回変更。
 */
export function StableNameForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (busy || trimmed.length < 2) return;
    setBusy(true);
    setError(null);
    const r = await apiFetch('/api/v1/account/stable-name', {
      method: 'POST',
      body: { name: trimmed },
    });
    setBusy(false);
    if (r.status === 200) {
      setSaved(trimmed);
      setEditing(false);
      router.refresh();
    } else {
      setError(errorMessage(r.body) ?? '厩舎名を保存できませんでした。');
    }
  };

  const shown = saved ?? current;

  if (!editing) {
    return (
      <div className={s.stableNameRow}>
        {shown ? (
          <span className={s.stableNameV}>{shown}</span>
        ) : (
          <span className={s.stableNameUnset}>厩舎名 未設定 — 設定すると成約や組織マップにこの名前が出ます</span>
        )}
        <button type="button" className={s.stableNameEdit} onClick={() => { setName(shown ?? ''); setEditing(true); }}>
          {shown ? '変更' : '厩舎名を設定'}
        </button>
      </div>
    );
  }

  return (
    <div className={s.stableNameRow}>
      <input
        className={s.stableNameInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="例: 流星ステーブル"
        maxLength={20}
        disabled={busy}
      />
      <button type="button" className={s.stableNameSave} onClick={() => void submit()} disabled={busy || name.trim().length < 2}>
        {busy ? '保存中…' : '保存'}
      </button>
      <button type="button" className={s.stableNameCancel} onClick={() => setEditing(false)} disabled={busy}>
        やめる
      </button>
      <span className={s.stableNameHint}>2〜20文字(日本語/英数字)・全ユーザーに公開・変更は1日1回</span>
      {error ? <span className={s.stableNameErr}>{error}</span> : null}
    </div>
  );
}
