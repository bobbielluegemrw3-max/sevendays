'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TOTAL_VALUE_V2,
  TRAINING_COMBO_SIZE_V2,
  TRAINING_MENUS_V2,
  type TrainingMenuV2,
} from '@sevendays/domain';
import { apiFetch, errorMessage } from '@/lib/client-api';
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
}: {
  horseId: string;
  t: AppDict['horse'];
  /** このサイクルの確定済みロール(あれば変更不可の完了表示)。 */
  confirmed?: TrainingV2Confirmed | null;
}) {
  const router = useRouter();
  const [menus, setMenus] = useState<TrainingMenuV2[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RollResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 確定済み(props経由 or この場でロール済み)= 変更不可の結果表示(Decision 107)
  const done: TrainingV2Confirmed | null = result
    ? { menus: result.per_menu.map((m) => m.menu), delta: result.delta, synergy: result.synergy, rests_decay: result.rests_decay, slot: result.slot }
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
            </div>
          ) : (
            <div className={s.tv2Rolls}>
              {done.menus.map((m, i) => (
                <span key={`${m}-${i}`} className={s.tv2Roll}>{menuLabel(m as TrainingMenuV2, t)}</span>
              ))}
            </div>
          )}
          <div className={`${s.tv2Delta} ${done.delta < 0 ? s.tv2Neg : s.tv2Pos}`}>
            {fill(t.tv2_delta_tpl, { n: fmtSigned(done.delta) })}
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
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<RollResult>(`/api/v1/horses/${horseId}/training`, {
      method: 'POST',
      body: { menus },
    });
    setBusy(false);
    setConfirming(false);
    if (res.status !== 200) {
      setError(errorMessage(res.body) ?? t.train_fail);
      return;
    }
    setResult(res.body as RollResult);
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
