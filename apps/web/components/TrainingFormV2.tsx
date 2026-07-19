'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TOTAL_VALUE_V2,
  TRAINING_COMBO_SIZE_V2,
  TRAINING_MENUS_V2,
  type TrainingMenuV2,
} from '@sevendays/domain';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { ItemCardPicker } from '@/components/ItemCardPicker';
import { effectSummaryJa, type CatalogItem, type InventoryData } from '@/lib/items';
import { projectAfterConfirm, type TrainingFxDetail } from '@/components/HeroArtFx';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/horse-detail.module.css';

/**
 * V2調教フォーム(Decision 104/107)。
 *  - 6メニューを公開レンジ付きで表示(数字は TRAINING_MENUS_V2 実定数のみ — 架空値なし)
 *  - 2つまで選択(同一メニュー×2可)。RESTは減衰無効(レンジ0)
 *  - 確定は2段階: 選択 → 最終確認(「やり直しはできません」= Decision 107)→ POST
 *  - 結果(メニュー別ロール・シナジー・合計)は確定の瞬間にサーバーでロールされ、
 *    そのまま表示する。以後このサイクルは変更不可
 */

export interface TrainingV2Confirmed {
  menus: string[];
  delta: number;
  synergy: number;
  rests_decay: boolean;
  /** 調教アイテムの上乗せ(確定時添付 or 後付け・なければ0)。 */
  item_bonus?: number;
  /** 添付済みアイテムのキー(Decision 113: 後付けUIの表示判定)。 */
  item_key?: string | null;
  slot: string;
}

interface RollResult {
  per_menu: { menu: TrainingMenuV2; roll: number }[];
  synergy: number;
  delta: number;
  rests_decay: boolean;
  effective_race_date: string;
  slot: string;
  training_tickets: number;
  item_key?: string | null;
  item_bonus?: number | null;
  /** Decision 112: 確定と同時に反映された総合値(サーバー計算の実値)。 */
  total_value?: number | null;
}

function menuLabel(menu: TrainingMenuV2, t: AppDict['horse']): string {
  switch (menu) {
    case 'HILL': return t.tv2_menu_hill;
    case 'POOL': return t.tv2_menu_pool;
    case 'SPAR': return t.tv2_menu_spar;
    case 'GATE': return t.tv2_menu_gate;
    case 'WOOD': return t.tv2_menu_wood;
    case 'REST': return t.tv2_menu_rest;
  }
}

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

function slotLabel(slot: string, t: AppDict['horse']): string {
  return slot === 'MORNING' ? t.tv2_slot_morning : t.tv2_slot_night;
}

export function TrainingFormV2({
  horseId,
  t,
  confirmed = null,
  lv = 0,
  totalValue = null,
  preview = false,
}: {
  horseId: string;
  t: AppDict['horse'];
  /** このサイクルの確定済みロール(あれば変更不可の完了表示)。 */
  confirmed?: TrainingV2Confirmed | null;
  /** 馬のLV(current_day)— アイテムのLV制限判定に使用。 */
  lv?: number;
  /** 現在の総合値(確定演出の予測値計算に使用)。 */
  totalValue?: number | null;
  preview?: boolean;
}) {
  const router = useRouter();
  const [menus, setMenus] = useState<TrainingMenuV2[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // カタログV2(Decision 109): TRAINING系アイテムを確定と同時に1個添付できる
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [itemKey, setItemKey] = useState('');

  useEffect(() => {
    // Decision 113: 確定済みでもアイテム未添付なら後付け用にカタログを読む
    if (preview || (confirmed && confirmed.item_key)) return;
    void (async () => {
      const [cat, inv] = await Promise.all([
        apiFetch<{ engine_v2?: boolean; items: CatalogItem[] }>('/api/v1/items/catalog'),
        apiFetch<InventoryData>('/api/v1/items/inventory'),
      ]);
      if (cat.status === 200 && (cat.body as { engine_v2?: boolean }).engine_v2) {
        setCatalog((cat.body as { items: CatalogItem[] }).items);
      }
      if (inv.status === 200) setInventory(inv.body as InventoryData);
    })();
  }, [preview, confirmed]);

  const ownedByKey = useMemo(
    () => new Map((inventory?.available ?? []).map((e) => [e.item_key, e.n])),
    [inventory],
  );
  // 添付できる = TRAINING系(即時適用を除く)で、選択中メニュー・LVの条件を満たすもの
  // Decision 113: 確定済みならメニュー条件は「確定したメニュー」で判定する
  const menusBasis = useMemo(
    () => (confirmed ? (confirmed.menus as TrainingMenuV2[]) : menus),
    [confirmed, menus],
  );
  const attachable = useMemo(
    () =>
      catalog.filter((c) => {
        if (c.item_class !== 'TRAINING' || !c.effect || c.effect.kind === 'DECAY_SHIELD') return false;
        if (!c.sellable && (ownedByKey.get(c.key) ?? 0) === 0) return false;
        if (c.effect.kind === 'BONUS') {
          if (c.effect.requiresMenu && !menusBasis.includes(c.effect.requiresMenu as TrainingMenuV2)) return false;
          if (c.effect.lvMin !== undefined && lv < c.effect.lvMin) return false;
          if (c.effect.lvMax !== undefined && lv > c.effect.lvMax) return false;
        }
        return true;
      }),
    [catalog, ownedByKey, menusBasis, lv],
  );
  // メニュー変更で条件を外れたら選択を自動解除
  useEffect(() => {
    if (itemKey && !attachable.some((c) => c.key === itemKey)) setItemKey('');
  }, [attachable, itemKey]);
  const attachedItem = itemKey ? catalog.find((c) => c.key === itemKey) : undefined;

  // Decision 113: 確定済みロールへのアイテム後付け(購入→添付→総合値即反映)
  async function attachItem() {
    if (!itemKey) return;
    setBusy(true);
    setError(null);
    if ((ownedByKey.get(itemKey) ?? 0) === 0) {
      const buy = await apiFetch('/api/v1/items/purchase', {
        method: 'POST',
        body: { item_key: itemKey, quantity: 1 },
      });
      if (buy.status !== 200) {
        setBusy(false);
        setError(errorMessage(buy.body) ?? t.train_fail);
        return;
      }
    }
    const res = await apiFetch<{ item_key: string; item_bonus: number; total_value: number | null }>(
      `/api/v1/horses/${horseId}/training`,
      { method: 'POST', body: { item_key: itemKey } },
    );
    setBusy(false);
    if (res.status !== 200) {
      setError(errorMessage(res.body) ?? t.train_fail);
      return;
    }
    const body = res.body as { item_key: string; item_bonus: number; total_value: number | null };
    if (result) setResult({ ...result, item_key: body.item_key, item_bonus: body.item_bonus });
    // 馬アートの生体反応 — アイテム上乗せぶんのポップ(調教行は出ない: delta 0)
    if (typeof totalValue === 'number') {
      const detail: TrainingFxDetail = {
        horseId,
        delta: 0,
        synergy: 0,
        itemBonus: body.item_bonus,
        itemKey: body.item_key,
        restsDecay: false,
        before: totalValue,
        projected: body.total_value ?? projectAfterConfirm(totalValue, body.item_bonus),
      };
      window.dispatchEvent(new CustomEvent<TrainingFxDetail>('sdd:training-confirmed', { detail }));
    }
    setItemKey('');
    router.refresh();
  }

  // 確定済み(props経由 or この場でロール済み)= 変更不可の結果表示(Decision 107)
  const done: TrainingV2Confirmed | null = result
    ? {
        menus: result.per_menu.map((m) => m.menu), delta: result.delta, synergy: result.synergy,
        rests_decay: result.rests_decay, item_bonus: result.item_bonus ?? 0,
        item_key: result.item_key ?? null, slot: result.slot,
      }
    : confirmed;
  if (done) {
    return (
      <div className={s.tStack}>
        <div className={s.tv2Result}>
          <div className={s.tv2ResultHead}>{t.tv2_result_title}</div>
          {result ? (
            <div className={s.tv2Rolls}>
              {result.per_menu.map((m, i) => (
                <span key={`${m.menu}-${i}`} className={s.tv2Roll}>
                  {menuLabel(m.menu, t)} <b className={m.roll < 0 ? s.tv2Neg : s.tv2Pos}>{fmtSigned(m.roll)}</b>
                </span>
              ))}
              {result.synergy > 0 ? (
                <span className={s.tv2Roll}>
                  {t.tv2_synergy_k} <b className={s.tv2Pos}>{fmtSigned(result.synergy)}</b>
                </span>
              ) : null}
              {result.item_key && result.item_bonus != null ? (
                <span className={s.tv2Roll}>
                  <img src={`/items/${result.item_key}.webp`} alt="" width={16} height={16} style={{ verticalAlign: '-3px', borderRadius: 3 }} />
                  {' '}
                  <b className={s.tv2Pos}>{fmtSigned(result.item_bonus)}</b>
                </span>
              ) : null}
            </div>
          ) : (
            <div className={s.tv2Rolls}>
              {done.menus.map((m, i) => (
                <span key={`${m}-${i}`} className={s.tv2Roll}>{menuLabel(m as TrainingMenuV2, t)}</span>
              ))}
              {done.item_key ? (
                <span className={s.tv2Roll}>
                  <img src={`/items/${done.item_key}.webp`} alt="" width={16} height={16} style={{ verticalAlign: '-3px', borderRadius: 3 }} />
                  {(done.item_bonus ?? 0) !== 0 ? <> <b className={s.tv2Pos}>{fmtSigned(done.item_bonus ?? 0)}</b></> : null}
                </span>
              ) : null}
            </div>
          )}
          <div className={`${s.tv2Delta} ${done.delta + (done.item_bonus ?? 0) < 0 ? s.tv2Neg : s.tv2Pos}`}>
            {fill(t.tv2_delta_tpl, { n: fmtSigned(Math.round((done.delta + (done.item_bonus ?? 0)) * 100) / 100) })}
          </div>
          {done.rests_decay ? <div className={s.tv2RestDone}>{t.tv2_rest_done}</div> : null}
          {result ? (
            <div className={s.tv2Target}>
              {fill(t.tv2_target_tpl, { date: result.effective_race_date, slot: slotLabel(result.slot, t) })}
              {' '}{fill(t.ticket_nth_tpl, { n: result.training_tickets })}
            </div>
          ) : null}
          <div className={s.tv2DoneNote}>{t.tv2_done_note}</div>
        </div>
        {/* Decision 113 (2026-07-20): 確定後でもレース処理前なら調教アイテムを
            1個後付けできる(有料の上乗せ手段・総合値へ即反映) */}
        {!done.item_key && attachable.length > 0 ? (
          <div>
            <div className={s.tv2AttachHead}>調教アイテムを後から使う(任意) — 上乗せは総合値へ即反映</div>
            <ItemCardPicker
              items={attachable}
              ownedByKey={ownedByKey}
              selected={itemKey}
              onSelect={setItemKey}
              ariaLabel="調教アイテムを使う"
            />
            {attachedItem?.effect ? (
              <div style={{ color: 'var(--faint)', fontSize: '0.72rem', margin: '0.2rem 0 0.4rem' }}>
                {effectSummaryJa(attachedItem.effect)}
              </div>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <button type="button" disabled={busy || !itemKey} onClick={() => void attachItem()}>
              {busy
                ? t.train_busy
                : itemKey && attachedItem
                  ? `${attachedItem.name_ja}を${(ownedByKey.get(itemKey) ?? 0) > 0 ? '使う' : '買って使う'}`
                  : 'アイテムを選ぶ…'}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    // 未所持のアイテムは Buy & Attach(購入→確定と同時に添付)
    if (itemKey && (ownedByKey.get(itemKey) ?? 0) === 0) {
      const buy = await apiFetch('/api/v1/items/purchase', {
        method: 'POST',
        body: { item_key: itemKey, quantity: 1 },
      });
      if (buy.status !== 200) {
        setBusy(false);
        setError(errorMessage(buy.body) ?? t.train_fail);
        return;
      }
    }
    const res = await apiFetch<RollResult>(`/api/v1/horses/${horseId}/training`, {
      method: 'POST',
      body: itemKey ? { menus, item_key: itemKey } : { menus },
    });
    setBusy(false);
    setConfirming(false);
    if (res.status !== 200) {
      setError(errorMessage(res.body) ?? t.train_fail);
      return;
    }
    const body = res.body as RollResult;
    setResult(body);
    // 馬アートの生体反応(HeroArtFx)— 実ロール値をそのまま渡す
    if (typeof totalValue === 'number') {
      const gain = body.delta + (body.item_bonus ?? 0);
      const detail: TrainingFxDetail = {
        horseId,
        delta: body.delta,
        synergy: body.synergy,
        itemBonus: body.item_bonus ?? 0,
        itemKey: body.item_key ?? null,
        restsDecay: body.rests_decay,
        before: totalValue,
        // Decision 112: 総合値は確定した瞬間に反映済み — サーバーの実値を優先
        projected: body.total_value ?? projectAfterConfirm(totalValue, gain),
      };
      window.dispatchEvent(new CustomEvent<TrainingFxDetail>('sdd:training-confirmed', { detail }));
    }
    router.refresh();
  }

  const countOf = (menu: TrainingMenuV2): number => menus.filter((m) => m === menu).length;
  const full = menus.length >= TRAINING_COMBO_SIZE_V2;

  if (confirming) {
    // 最終確認(Decision 107: 確定即最終)
    return (
      <div className={s.tStack}>
        <div className={s.tv2Confirm}>
          <div className={s.tv2ConfirmHead}>{t.tv2_confirm_title}</div>
          <div className={s.tv2Rolls}>
            {menus.map((m, i) => (
              <span key={`${m}-${i}`} className={s.tv2Roll}>{menuLabel(m, t)}</span>
            ))}
            {attachedItem ? (
              <span className={s.tv2Roll}>
                <img src={`/items/${attachedItem.key}.webp`} alt="" width={16} height={16} style={{ verticalAlign: '-3px', borderRadius: 3 }} />
                {' '}{attachedItem.name_ja}
                {(ownedByKey.get(attachedItem.key) ?? 0) === 0 ? ` (${attachedItem.price} USDT)` : ''}
              </span>
            ) : null}
          </div>
          <div className={s.tv2Warn}>{t.tv2_confirm_warn}</div>
          {error ? <p className="error">{error}</p> : null}
          <div className={s.tv2ConfirmRow}>
            <button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? t.train_busy : t.tv2_confirm_go}
            </button>
            <button type="button" className={s.redoBtn} disabled={busy} onClick={() => setConfirming(false)}>
              {t.tv2_back}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.tStack}>
      <div className={s.tv2Hint}>{t.tv2_pick_hint}</div>
      <div className={s.tv2Grid}>
        {TRAINING_MENUS_V2.map((spec) => {
          const n = countOf(spec.key);
          const isRest = spec.key === 'REST';
          return (
            <button
              key={spec.key}
              type="button"
              className={`${s.tCard} ${n > 0 ? s.tCardOn : ''}`}
              aria-pressed={n > 0}
              onClick={() => {
                if (!full) setMenus([...menus, spec.key]);
                else if (n > 0) setMenus(menus.filter((m) => m !== spec.key));
              }}
            >
              <span className={s.tCardK}>
                {menuLabel(spec.key, t)}
                {n === 2 ? <span className={s.tReco}>{t.tv2_x2}</span> : null}
              </span>
              <span className={s.tCardBonus}>
                {t.tv2_range_k}{' '}
                <b>{isRest ? '—' : `${fmtSigned(spec.min)}..${fmtSigned(spec.max)}`}</b>
              </span>
              {isRest ? (
                <span className={`${s.tCardSub} ${s.tCardGood}`}>
                  {t.tv2_rest_note}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {menus.length > 0 ? (
        <div className={s.tv2Chips}>
          {menus.map((m, i) => (
            <button
              key={`${m}-${i}`}
              type="button"
              className={s.tv2Chip}
              onClick={() => setMenus(menus.filter((_, idx) => idx !== i))}
            >
              {menuLabel(m, t)} ✕
            </button>
          ))}
        </div>
      ) : null}
      {/* メニュー未選択でも表示(2026-07-20 オーナー指摘: 存在に気づけない)。
          メニュー条件付きアイテムは選択に応じて自動で増減する */}
      {attachable.length > 0 ? (
        <div>
          {/* カード式選択(2026-07-19 案2): 分類チップ+効果+価格を見て選ぶ */}
          <div className={s.tv2AttachHead}>調教アイテムを添付(任意) — 確定ロールに上乗せ</div>
          <ItemCardPicker
            items={attachable}
            ownedByKey={ownedByKey}
            selected={itemKey}
            onSelect={setItemKey}
            allowNone
            noneLabel="アイテムなし"
            ariaLabel="調教アイテムを添付"
          />
          {attachedItem?.effect ? (
            <div style={{ color: 'var(--faint)', fontSize: '0.72rem', marginTop: '0.2rem' }}>
              {effectSummaryJa(attachedItem.effect)}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <button
        type="button"
        disabled={busy || menus.length === 0}
        onClick={() => setConfirming(true)}
      >
        {t.train_submit}
      </button>
      <div className={s.tv2Cap}>
        {`SOFT CAP ${TOTAL_VALUE_V2.softCap} / DECAY −${TOTAL_VALUE_V2.decayPerRace.toFixed(1)}`}
      </div>
    </div>
  );
}
