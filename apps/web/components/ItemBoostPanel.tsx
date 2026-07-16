'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { AppSelect } from '@/components/AppSelect';
import { fill, type AppDict } from '@/lib/i18n-shared';
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
  t,
  preview = false,
}: {
  horseId: string;
  currentDay: number;
  t: AppDict['horse'];
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
        setError(errorMessage(buy.body) ?? t.boost_buy_fail);
        return;
      }
    }
    const apply = await apiFetch<{ effective_race_date: string }>(
      `/api/v1/horses/${horseId}/item`,
      { method: 'POST', body: { item_key: selected } },
    );
    setBusy(false);
    if (apply.status !== 200) {
      setError(errorMessage(apply.body) ?? t.boost_apply_fail);
      await reload();
      return;
    }
    setMessage(
      fill(t.boost_applied_tpl, { date: (apply.body as { effective_race_date: string }).effective_race_date }),
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
      setError(errorMessage(r.body) ?? t.boost_cancel_fail);
      return;
    }
    setMessage(t.boost_canceled);
    await reload();
    router.refresh();
  }

  return (
    <div className={s.boost}>
      <div className={s.boostTitle}>{t.boost_title}<span className={s.boostPaid}>{t.boost_paid}</span></div>
      <div className={s.boostDesc}>{t.boost_desc}</div>

      {pendingHere ? (
        <div className={s.boostApplied}>
          <img className={s.thumb} src={`/items/${pendingHere.item_key}.webp`} alt="" width={42} height={42} />
          <span className={s.pendingBadge}>{t.boost_pending}</span>
          <b>{byKey.get(pendingHere.item_key)?.name_ja ?? pendingHere.item_key}</b>
          <span style={{ color: 'var(--faint)', fontSize: '0.75rem' }}>
            {fill(t.boost_pending_race_tpl, { date: pendingHere.effective_race_date })}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" disabled={busy} onClick={() => void cancelPending()}>
            {t.boost_cancel}
          </button>
        </div>
      ) : (
        <div className={s.boostRow}>
          <AppSelect
            className={s.boostSelect}
            value={selected}
            onChange={setSelected}
            ariaLabel={t.boost_pick_aria}
            options={[
              { value: '', label: t.boost_pick },
              ...BAND_ORDER.flatMap((band) =>
                usable
                  .filter((c) => c.band === band)
                  .map((c) => {
                    const owned = ownedByKey.get(c.key) ?? 0;
                    return {
                      value: c.key,
                      label: `${c.name_ja}${owned > 0 ? fill(t.boost_owned_tpl, { n: owned }) : fill(t.boost_price_tpl, { p: c.price })}`,
                      group: BAND_LABEL[band],
                    };
                  }),
              ),
            ]}
          />
          <button type="button" disabled={busy || !selected} onClick={() => void applySelected()}>
            {selected && (ownedByKey.get(selected) ?? 0) > 0 ? t.boost_use : t.boost_buy_use}
          </button>
        </div>
      )}

      {selected && !pendingHere ? (
        <div className={s.boostHint} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <img className={s.thumb} src={`/items/${selected}.webp`} alt="" width={42} height={42} />
          <span>{byKey.get(selected)?.description_ja}</span>
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
    </div>
  );
}
