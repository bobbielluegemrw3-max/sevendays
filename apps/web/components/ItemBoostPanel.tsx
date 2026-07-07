'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import {
  BAND_LABEL,
  BAND_ORDER,
  type CatalogItem,
  type InventoryData,
} from '@/lib/items';
import s from '../app/items.module.css';

/**
 * 馬詳細の Boost Item(Decision 078): 今夜のレースに1つだけアイテムを使う。
 * 所持していれば「使う」、なければ「買って使う」(Buy & Apply)。
 * 適用済みならスナップショット確定前まで取り消せる。
 */
export function ItemBoostPanel({
  horseId,
  currentDay,
  preview = false,
}: {
  horseId: string;
  currentDay: number;
  preview?: boolean;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    const [cat, inv] = await Promise.all([
      apiFetch<{ items: CatalogItem[] }>('/api/v1/items/catalog'),
      apiFetch<InventoryData>('/api/v1/items/inventory'),
    ]);
    if (cat.status === 200) setCatalog((cat.body as { items: CatalogItem[] }).items);
    if (inv.status === 200) setInventory(inv.body as InventoryData);
  }

  useEffect(() => {
    if (!preview) void reload();
  }, [preview]);

  const ownedByKey = useMemo(
    () => new Map((inventory?.available ?? []).map((e) => [e.item_key, e.n])),
    [inventory],
  );
  const pendingHere = (inventory?.pending ?? []).find((p) => p.horse_id === horseId) ?? null;
  const byKey = useMemo(() => new Map(catalog.map((c) => [c.key, c])), [catalog]);

  const usable = useMemo(
    () =>
      catalog.filter(
        (c) =>
          (c.sellable || (ownedByKey.get(c.key) ?? 0) > 0) &&
          (c.usable_day_min === null || currentDay >= c.usable_day_min) &&
          (c.usable_day_max === null || currentDay <= c.usable_day_max),
      ),
    [catalog, ownedByKey, currentDay],
  );

  async function applySelected() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const owned = (ownedByKey.get(selected) ?? 0) > 0;
    if (!owned) {
      const buy = await apiFetch('/api/v1/items/purchase', {
        method: 'POST',
        body: { item_key: selected, quantity: 1 },
      });
      if (buy.status !== 200) {
        setBusy(false);
        setError(errorMessage(buy.body) ?? '購入に失敗しました');
        return;
      }
    }
    const apply = await apiFetch<{ effective_race_date: string }>(
      `/api/v1/horses/${horseId}/item`,
      { method: 'POST', body: { item_key: selected } },
    );
    setBusy(false);
    if (apply.status !== 200) {
      setError(errorMessage(apply.body) ?? 'アイテムの適用に失敗しました');
      await reload();
      return;
    }
    setMessage(
      `${(apply.body as { effective_race_date: string }).effective_race_date} のレースに適用されます。`,
    );
    await reload();
    router.refresh();
  }

  async function cancelPending() {
    setBusy(true);
    setError(null);
    const r = await apiFetch(`/api/v1/horses/${horseId}/item/cancel`, { method: 'POST', body: {} });
    setBusy(false);
    if (r.status !== 200) {
      setError(errorMessage(r.body) ?? '取り消しに失敗しました');
      return;
    }
    setMessage('アイテムを在庫に戻しました。');
    await reload();
    router.refresh();
  }

  return (
    <div className={s.boost}>
      <div className={s.boostTitle}>ブーストアイテム</div>
      <div className={s.boostDesc}>
        1頭・1レース・1個まで。効果はこの馬のパラメータと今日の設定(レース後公開)で決まります。
      </div>

      {pendingHere ? (
        <div className={s.boostApplied}>
          <span className={s.pendingBadge}>適用予定</span>
          <b>{byKey.get(pendingHere.item_key)?.name_ja ?? pendingHere.item_key}</b>
          <span style={{ color: 'var(--faint)', fontSize: '0.75rem' }}>
            {pendingHere.effective_race_date} のレース
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" disabled={busy} onClick={() => void cancelPending()}>
            取り消す
          </button>
        </div>
      ) : (
        <div className={s.boostRow}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">アイテムを選ぶ…</option>
            {BAND_ORDER.map((band) => {
              const group = usable.filter((c) => c.band === band);
              if (group.length === 0) return null;
              return (
                <optgroup key={band} label={BAND_LABEL[band]}>
                  {group.map((c) => {
                    const owned = ownedByKey.get(c.key) ?? 0;
                    return (
                      <option key={c.key} value={c.key}>
                        {c.name_ja}
                        {owned > 0 ? `(所持 ${owned})` : `(${c.price} USDT)`}
                      </option>
                    );
                  })}
                </optgroup>
              );
            })}
          </select>
          <button type="button" disabled={busy || !selected} onClick={() => void applySelected()}>
            {selected && (ownedByKey.get(selected) ?? 0) > 0 ? '使う' : '買って使う'}
          </button>
        </div>
      )}

      {selected && !pendingHere ? (
        <div className={s.boostHint}>{byKey.get(selected)?.description_ja}</div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
    </div>
  );
}
