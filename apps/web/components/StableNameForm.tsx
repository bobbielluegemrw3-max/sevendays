'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import type { AppDict } from '@/lib/i18n-shared';
import s from '@/app/account.module.css';

/**
 * 厩舎名の設定(Decision 097)。公開名 — マイ厩舎タイトル・成約相手・
 * 組織マップ・ギフト差出人に表示される。2〜20文字・一意・1日1回変更。
 */
export function StableNameForm({ current, t }: { current: string | null; t: AppDict['stableName'] }) {
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
      setError(errorMessage(r.body) ?? t.err);
    }
  };

  const shown = saved ?? current;

  if (!editing) {
    return (
      <div className={s.stableNameRow}>
        {shown ? (
          <span className={s.stableNameV}>{shown}</span>
        ) : (
          <span className={s.stableNameUnset}>{t.unset}</span>
        )}
        <button type="button" className={s.stableNameEdit} onClick={() => { setName(shown ?? ''); setEditing(true); }}>
          {shown ? t.change_btn : t.set_btn}
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
        placeholder={t.placeholder}
        maxLength={20}
        disabled={busy}
      />
      <button type="button" className={s.stableNameSave} onClick={() => void submit()} disabled={busy || name.trim().length < 2}>
        {busy ? t.saving : t.save}
      </button>
      <button type="button" className={s.stableNameCancel} onClick={() => setEditing(false)} disabled={busy}>
        {t.cancel}
      </button>
      <span className={s.stableNameHint}>{t.hint}</span>
      {error ? <span className={s.stableNameErr}>{error}</span> : null}
    </div>
  );
}
