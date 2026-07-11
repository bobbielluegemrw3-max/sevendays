'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONDITION_FATIGUE_V1,
  recommendedTrainingV1,
  trainingModifierV1,
  type HorseType,
  type TrainingType,
} from '@sevendays/domain';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/horse-detail.module.css';

/**
 * Daily training selection (Decision 066 / UX redesign 088).
 * 3枚のカードに「今夜のスコア加点(タイプ相性)」と「疲労への影響」を実定数から
 * 表示し、recommendedTrainingV1 に「おすすめ」バッジを付ける。数字はすべて
 * 公開ルール(trainingModifierV1 / CONDITION_FATIGUE_V1)由来 — 架空値なし。
 */

const TRAINING_TYPES: { value: TrainingType; label: string }[] = [
  { value: 'SPEED_TRAINING', label: 'スピード調教' },
  { value: 'POWER_TRAINING', label: 'パワー調教' },
  { value: 'RECOVERY_TRAINING', label: '回復調教' },
];

/** レース日の疲労純増(調教コスト+レース5−自然回復5−回復調教の追加回復)。 */
function fatigueDelta(t: TrainingType): number {
  const p = CONDITION_FATIGUE_V1;
  const extra = t === 'RECOVERY_TRAINING' ? p.recoveryTrainingAdditionalRecovery : 0;
  return p.trainingCost[t] + p.raceFatigueCost - p.dailyNaturalRecovery - extra;
}

export function TrainingForm({
  horseId,
  horseType,
  fatigue,
}: {
  horseId: string;
  horseType: string;
  fatigue: number;
}) {
  const router = useRouter();
  const type = horseType as HorseType;
  const recommended = recommendedTrainingV1(type, fatigue);
  const [trainingType, setTrainingType] = useState<TrainingType>(recommended);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await apiFetch<{ effective_race_date: string }>(
      `/api/v1/horses/${horseId}/training`,
      { method: 'POST', body: { training_type: trainingType } },
    );
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? 'トレーニングの登録に失敗しました');
      return;
    }
    setMessage(
      `${(result.body as { effective_race_date: string }).effective_race_date} のレースに適用されます。`,
    );
    router.refresh();
  }

  return (
    <div className={s.tStack}>
      <div className={s.tCards}>
        {TRAINING_TYPES.map((t) => {
          const bonus = trainingModifierV1(type, t.value);
          const delta = fatigueDelta(t.value);
          const on = trainingType === t.value;
          return (
            <button
              key={t.value}
              type="button"
              className={`${s.tCard} ${on ? s.tCardOn : ''}`}
              onClick={() => setTrainingType(t.value)}
              aria-pressed={on}
            >
              <span className={s.tCardK}>
                {t.label}
                {recommended === t.value ? <span className={s.tReco}>おすすめ</span> : null}
              </span>
              <span className={s.tCardBonus}>今夜のスコア <b>+{bonus}</b></span>
              <span className={`${s.tCardSub} ${delta < 0 ? s.tCardGood : ''}`}>
                {delta < 0 ? `疲労を癒す(${delta})` : `疲労が溜まる(+${delta})`}
              </span>
            </button>
          );
        })}
      </div>
      {type === 'LUCK' ? (
        <div className={s.tLuckNote}>
          LUCKタイプはどの調教でも、今夜の運の振れ幅が上向きになります(−2〜+4)。
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
      <button type="button" disabled={busy} onClick={() => void submit()}>
        {busy ? '調教中…' : 'この調教にする(今夜20:00まで・1日1回)'}
      </button>
    </div>
  );
}
