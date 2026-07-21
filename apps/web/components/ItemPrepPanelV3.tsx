'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { refreshAfterFx, refreshSoft } from '@/lib/deferred-refresh';
import { TrainStep, StepLink, stepStyles as st } from '@/components/TrainStep';
import { Button } from '@/components/ui/Button';
import type { ItemCopy } from '@/lib/items';
import { AppSelect } from '@/components/AppSelect';
import { fill, type AppDict } from '@/lib/i18n-shared';
import { ItemCardPicker } from '@/components/ItemCardPicker';
import {
  effectSummary,
  type CatalogItem,
  type InventoryData,
} from '@/lib/items';
import s from '../app/items.module.css';
import { ErrorLine } from '@/components/ui/ErrorLine';

/**
 * 馬詳細のレースアイテム(カタログV2・Decision 109)。
 * 予報(70%)を読んで次のレースに「備える」— 的中で軸が上限側へ、外れたら下限側へ。
 * 外れのペナルティは正直に表示する(R1)。DUAL(完全装備/野営一式)は備え先の
 * グループを選ぶ。凍結前なら取消可。減衰シールド(星霜の砂)は即時適用。
 * ※V2固有文言は日本語直書き(items系はi18n宿題に合流 — -3bプールUIと同じ方針)
 */
export function ItemPrepPanelV3({
  horseId,
  t,
  itemsCopy,
  preview = false,
}: {
  horseId: string;
  t: AppDict['horse'];
  /** アイテム語彙の辞書(効果の説明に使う)。 */
  itemsCopy: ItemCopy;
  preview?: boolean;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [selected, setSelected] = useState('');
  const [weatherGroup, setWeatherGroup] = useState<'RAIN_GROUP' | 'SUN_GROUP'>('RAIN_GROUP');
  const [trackGroup, setTrackGroup] = useState<'MUD_GROUP' | 'FIRM_GROUP'>('MUD_GROUP');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // 案B(2026-07-20): 買わない人のための「使わない」— この段を畳む(表示のみ)
  const [skip, setSkip] = useState(false);

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
  const byKey = useMemo(() => new Map(catalog.map((c) => [c.key, c])), [catalog]);
  const pendingHere =
    (inventory?.pending ?? []).find((p) => p.horse_id === horseId && p.usage_kind !== 'TRAINING') ?? null;

  // RACE系(買える or 所持) + 即時適用の減衰シールド(所持のみ・非売)
  const raceItems = useMemo(
    () =>
      catalog.filter(
        (c) =>
          c.item_class === 'RACE' &&
          (c.sellable || (ownedByKey.get(c.key) ?? 0) > 0),
      ),
    [catalog, ownedByKey],
  );
  const shieldItems = useMemo(
    () =>
      catalog.filter(
        (c) => c.effect?.kind === 'DECAY_SHIELD' && (ownedByKey.get(c.key) ?? 0) > 0,
      ),
    [catalog, ownedByKey],
  );

  const selectedItem = selected ? byKey.get(selected) : undefined;
  const needsGroups = selectedItem?.effect?.kind === 'DUAL_PREP';

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
    const body: Record<string, unknown> = { item_key: selected };
    if (needsGroups) {
      body.weather_group = weatherGroup;
      body.track_group = trackGroup;
    }
    const apply = await apiFetch<{ effective_race_date: string; slot?: string }>(
      `/api/v1/horses/${horseId}/item`,
      { method: 'POST', body },
    );
    setBusy(false);
    if (apply.status !== 200) {
      setError(errorMessage(apply.body) ?? t.boost_apply_fail);
      await reload();
      return;
    }
    const res = apply.body as { effective_race_date: string; slot?: string };
    setMessage(
      `${fill(t.boost_applied_tpl, { date: res.effective_race_date })}${res.slot ? `(${res.slot === 'MORNING' ? '朝' : '夜'})` : ''}`,
    );
    // 馬アートの吸い込み演出(HeroArtFx)
    window.dispatchEvent(new CustomEvent('sdd:item-applied', { detail: { horseId, itemKey: selected } }));
    await reload();
    // 吸い込み演出(〜2.1s)後に低優先で台帳同期 — 演出中のかくつき対策
    refreshAfterFx(router, 2200);
  }

  async function useShield(itemKey: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const r = await apiFetch<{ decay_shield_added: number }>(`/api/v1/horses/${horseId}/item`, {
      method: 'POST',
      body: { item_key: itemKey },
    });
    setBusy(false);
    if (r.status !== 200) {
      setError(errorMessage(r.body) ?? t.boost_apply_fail);
      return;
    }
    setMessage(`減衰シールドを${(r.body as { decay_shield_added: number }).decay_shield_added}レース分まといました。`);
    window.dispatchEvent(new CustomEvent('sdd:item-applied', { detail: { horseId, itemKey } }));
    await reload();
    refreshAfterFx(router, 2200);
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
    refreshSoft(router);
  }

  // ③のステップ状態(案B・2026-07-20): 装備済み or 使わない = 完了
  const stepState = pendingHere || skip ? 'done' : 'active';
  const stepTitle = pendingHere
    ? t.step_race_done
    : skip
      ? `${t.step_race_title} — ${t.step_skip}`
      : t.step_race_title;

  return (
    <TrainStep n={3} optional state={stepState} title={stepTitle}>
      {skip && !pendingHere ? (
        <>
          <span className={st.sum}>{t.step_skipped}</span>
          <StepLink onClick={() => setSkip(false)}>{t.step_unskip}</StepLink>
        </>
      ) : pendingHere ? (
        <div className={s.boostApplied}>
          <img className={s.thumb} src={`/items/${pendingHere.item_key}.webp`} alt="" width={42} height={42} />
          <span className={s.pendingBadge}>{t.boost_pending}</span>
          <b>{byKey.get(pendingHere.item_key)?.name_ja ?? pendingHere.item_key}</b>
          <span style={{ color: 'var(--faint)', fontSize: '0.75rem' }}>
            {fill(t.boost_pending_race_tpl, { date: pendingHere.effective_race_date })}
            {pendingHere.slot ? `(${pendingHere.slot === 'MORNING' ? '朝' : '夜'})` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" disabled={busy} onClick={() => void cancelPending()}>
            {t.boost_cancel}
          </button>
        </div>
      ) : (
        <>
          <div className={s.boostDesc}>
            {'予報(的中率70%)を読んで次のレースに備える。的中なら適性が上限側へ、外れたら下限側へ — 外れは下がります。'}
          </div>
          {/* カード式選択(2026-07-19 案2): 分類チップ+効果+価格を見て選ぶ */}
          <ItemCardPicker
            items={raceItems}
            ownedByKey={ownedByKey}
            selected={selected}
            onSelect={setSelected}
            ariaLabel={t.boost_pick_aria}
            itemsCopy={itemsCopy}
          />
          {/* カード列(横スクロールバー)と密着しないよう一呼吸(2026-07-20 オーナー指摘) */}
          <div className={s.boostRow} style={{ marginTop: '0.6rem' }}>
            <Button variant="primary" busy={busy} busyLabel="装備中…" disabled={!selected} sound="confirm" onClick={() => void applySelected()}>
              {selected
                ? `${selectedItem?.name_ja ?? ''}を${(ownedByKey.get(selected) ?? 0) > 0 ? t.boost_use : t.boost_buy_use}`
                : t.boost_pick}
            </Button>
            {/* 買わない人のための明示的な出口(2026-07-20 オーナー指示) */}
            <StepLink onClick={() => { setSelected(''); setSkip(true); }}>{t.step_skip}</StepLink>
          </div>
          {needsGroups ? (
            <div className={s.boostRow}>
              <AppSelect
                className={s.boostSelect}
                value={weatherGroup}
                onChange={(v) => setWeatherGroup(v as 'RAIN_GROUP' | 'SUN_GROUP')}
                ariaLabel="天候の備え先"
                options={[
                  { value: 'RAIN_GROUP', label: '天候: 雨系(雨・嵐)に備える' },
                  { value: 'SUN_GROUP', label: '天候: 晴れ系(晴れ・曇り)に備える' },
                ]}
              />
              <AppSelect
                className={s.boostSelect}
                value={trackGroup}
                onChange={(v) => setTrackGroup(v as 'MUD_GROUP' | 'FIRM_GROUP')}
                ariaLabel="馬場の備え先"
                options={[
                  { value: 'MUD_GROUP', label: '馬場: 道悪系(稍重・不良)に備える' },
                  { value: 'FIRM_GROUP', label: '馬場: 良系(高速・良)に備える' },
                ]}
              />
            </div>
          ) : null}
        </>
      )}

      {!pendingHere && !skip ? (
        /* 常時マウント+最低高さ(2026-07-19): 選択のたびに枠の高さが跳ねて
           ページ全体がガタつく不安定さの解消。未選択時は案内文を表示 */
        <div className={s.boostHint} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minHeight: 50 }}>
          {selectedItem ? (
            <>
              <img className={s.thumb} src={`/items/${selectedItem.key}.webp`} alt="" width={42} height={42} />
              <span>{selectedItem.effect ? effectSummary(selectedItem.effect, itemsCopy) : selectedItem.description_ja}</span>
            </>
          ) : (
            <span style={{ opacity: 0.55 }}>{t.boost_hint_empty}</span>
          )}
        </div>
      ) : null}

      {shieldItems.length > 0 && !preview ? (
        <div className={s.boostRow} style={{ marginTop: '0.4rem' }}>
          {shieldItems.map((c) => (
            <button key={c.key} type="button" className="secondary" disabled={busy} onClick={() => void useShield(c.key)}>
              {busy ? '使用中…' : `${c.name_ja}を使う(所持${ownedByKey.get(c.key) ?? 0})`}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {message ? <p className="ok">{message}</p> : null}
    </TrainStep>
  );
}
