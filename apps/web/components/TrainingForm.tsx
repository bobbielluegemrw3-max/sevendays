'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONDITION_FATIGUE_V1,
  RECOMMENDED_RECOVERY_FATIGUE_THRESHOLD,
  recommendedTrainingV1,
  trainingModifierV1,
  type HorseType,
  type TrainingType,
} from '@sevendays/domain';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/horse-detail.module.css';

/**
 * Daily training selection (Decision 066 / UX redesign 088).
 * 3枚のカードに「今夜のスコア加点(タイプ相性)」と「疲労への影響」を実定数から
 * 表示し、recommendedTrainingV1 に「おすすめ」バッジを付ける。数字はすべて
 * 公開ルール(trainingModifierV1 / CONDITION_FATIGUE_V1)由来 — 架空値なし。
 */

const TRAINING_TYPE_ORDER: TrainingType[] = ['SPEED_TRAINING', 'POWER_TRAINING', 'RECOVERY_TRAINING'];

/**
 * レース日の疲労純増を、この馬の現在値からクランプ込みで実計算する
 * (調教コスト+レース5−自然回復5−回復調教の追加回復、0..100に切詰め)。
 * 固定値表示だと疲労0の馬に「−4癒す」と出て嘘になる(0未満には下がらない)。
 */
function fatigueDelta(t: TrainingType, current: number): number {
  const p = CONDITION_FATIGUE_V1;
  const extra = t === 'RECOVERY_TRAINING' ? p.recoveryTrainingAdditionalRecovery : 0;
  const raw = current + p.trainingCost[t] + p.raceFatigueCost - p.dailyNaturalRecovery - extra;
  return Math.min(p.max, Math.max(p.min, raw)) - current;
}

/** おすすめバッジの根拠(recommendedTrainingV1 と同じ公開定数から生成)。 */
function recommendReason(type: HorseType, fatigue: number, t: AppDict['horse']): string {
  if (fatigue >= RECOMMENDED_RECOVERY_FATIGUE_THRESHOLD) {
    return fill(t.reason_high_ftg_tpl, { n: RECOMMENDED_RECOVERY_FATIGUE_THRESHOLD });
  }
  const best = trainingModifierV1(type, recommendedTrainingV1(type, fatigue));
  switch (type) {
    case 'SPRINTER':
      return fill(t.reason_sprinter_tpl, { n: best });
    case 'POWER':
      return fill(t.reason_power_tpl, { n: best });
    case 'ENDURANCE':
      return fill(t.reason_endurance_tpl, { n: best });
    case 'BALANCED':
      return fill(t.reason_balanced_tpl, { n: best, c: CONDITION_FATIGUE_V1.trainingEffect.RECOVERY_TRAINING });
    case 'LUCK':
      return fill(t.reason_luck_tpl, { n: best });
  }
}

export function TrainingForm({
  horseId,
  horseType,
  fatigue,
  t,
  trained = false,
  currentTraining = null,
  uncollected = 0,
}: {
  horseId: string;
  horseType: string;
  fatigue: number;
  t: AppDict['horse'];
  /** 次のレース向けの調教が済んでいる(済みでも「変更する」でやり直し可 — A2)。 */
  trained?: boolean;
  /** 確定済みの調教タイプ(やり直しUIの初期値)。 */
  currentTraining?: string | null;
  /** 未回収(利確待ち)の上昇分$ — 初回確定の演出に使う。 */
  uncollected?: number;
}) {
  const typeLabel: Record<TrainingType, string> = {
    SPEED_TRAINING: t.tt_speed,
    POWER_TRAINING: t.tt_power,
    RECOVERY_TRAINING: t.tt_recovery,
  };
  const router = useRouter();
  const type = horseType as HorseType;
  const recommended = recommendedTrainingV1(type, fatigue);
  const [trainingType, setTrainingType] = useState<TrainingType>(
    (currentTraining as TrainingType | null) ?? recommended,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [harvest, setHarvest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A2: 確定済みでも20:00スナップショット前ならやり直せる(チケット・回収は初回のみ)
  const [editing, setEditing] = useState(false);
  const confirmed = trained && !editing;

  if (confirmed) {
    return (
      <div className={s.tStack}>
        {harvest ? <p className={`ok ${s.harvestMsg}`}>{harvest}</p> : null}
        {message ? <p className="ok">{message}</p> : null}
        <button type="button" disabled>
          {t.train_done}
        </button>
        <button type="button" className={s.redoBtn} onClick={() => setEditing(true)}>
          {t.redo_btn}
        </button>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setHarvest(null);
    const result = await apiFetch<{
      effective_race_date: string;
      first_confirm: boolean;
      training_tickets: number;
    }>(`/api/v1/horses/${horseId}/training`, { method: 'POST', body: { training_type: trainingType } });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? t.train_fail);
      return;
    }
    const body = result.body as { effective_race_date: string; first_confirm: boolean; training_tickets: number };
    if (body.first_confirm) {
      // 初回確定 = 利確+チケット(A2の収穫の瞬間)
      const parts: string[] = [];
      if (uncollected > 0) parts.push(fill(t.harvest_done_tpl, { v: uncollected.toFixed(2) }));
      parts.push(fill(t.ticket_nth_tpl, { n: body.training_tickets }));
      setHarvest(parts.join(' '));
      setMessage(fill(t.train_applied_tpl, { date: body.effective_race_date }));
    } else {
      setMessage(t.redo_saved);
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className={s.tStack}>
      <div className={s.tCards}>
        {TRAINING_TYPE_ORDER.map((value) => {
          const bonus = trainingModifierV1(type, value);
          const condEffect = CONDITION_FATIGUE_V1.trainingEffect[value];
          const delta = fatigueDelta(value, fatigue);
          const on = trainingType === value;
          return (
            <button
              key={value}
              type="button"
              className={`${s.tCard} ${on ? s.tCardOn : ''}`}
              onClick={() => setTrainingType(value)}
              aria-pressed={on}
            >
              <span className={s.tCardK}>
                {typeLabel[value]}
                {recommended === value ? <span className={s.tReco}>{t.reco}</span> : null}
              </span>
              <span className={s.tCardBonus}>{t.bonus_k} <b>+{bonus}</b></span>
              <span className={s.tCardCond}>{t.cond_eff_k} <b>+{condEffect}</b></span>
              <span className={`${s.tCardSub} ${delta <= 0 ? s.tCardGood : ''}`}>
                {delta < 0
                  ? fill(t.ftg_heal_tpl, { n: delta })
                  : delta === 0
                    ? t.ftg_zero
                    : fill(t.ftg_gain_tpl, { n: delta })}
              </span>
            </button>
          );
        })}
      </div>
      <div className={s.tRecoNote}>{t.reco_reason_k}{recommendReason(type, fatigue, t)}</div>
      {type === 'LUCK' ? (
        <div className={s.tLuckNote}>{t.luck_note}</div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {harvest ? <p className={`ok ${s.harvestMsg}`}>{harvest}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
      <button type="button" disabled={busy} onClick={() => void submit()}>
        {busy ? t.train_busy : t.train_submit}
      </button>
    </div>
  );
}
