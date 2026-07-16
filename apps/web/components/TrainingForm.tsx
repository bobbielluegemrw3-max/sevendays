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
function recommendReason(type: HorseType, fatigue: number): string {
  if (fatigue >= RECOMMENDED_RECOVERY_FATIGUE_THRESHOLD) {
    return `疲労が${RECOMMENDED_RECOVERY_FATIGUE_THRESHOLD}以上 — まず癒すのが最優先です`;
  }
  const best = trainingModifierV1(type, recommendedTrainingV1(type, fatigue));
  switch (type) {
    case 'SPRINTER':
      return `このタイプはスピード調教のスコア加点が最大(+${best})です`;
    case 'POWER':
      return `このタイプはパワー調教のスコア加点が最大(+${best})です`;
    case 'ENDURANCE':
      return `このタイプは回復調教のスコア加点が最大(+${best})です`;
    case 'BALANCED':
      return `加点は3種とも+${best} — 調子+${CONDITION_FATIGUE_V1.trainingEffect.RECOVERY_TRAINING}で疲労も溜めない回復調教が守りの最適解です`;
    case 'LUCK':
      return `回復調教は加点が最大(+${best})のうえ、調子を上げて疲労も溜めません`;
  }
}

export function TrainingForm({
  horseId,
  horseType,
  fatigue,
  trained = false,
}: {
  horseId: string;
  horseType: string;
  fatigue: number;
  /** 次のレース向けの調教が済んでいる(2026-07-14: 完了表示でボタンを閉じる)。 */
  trained?: boolean;
}) {
  const router = useRouter();
  const type = horseType as HorseType;
  const recommended = recommendedTrainingV1(type, fatigue);
  const [trainingType, setTrainingType] = useState<TrainingType>(recommended);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 調教済み(1日1回)は選択カードを畳んで完了表示だけにする。
  if (trained) {
    return (
      <div className={s.tStack}>
        <button type="button" disabled>
          ✓ 調教完了 — 次のレースに適用されます
        </button>
      </div>
    );
  }

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
          const condEffect = CONDITION_FATIGUE_V1.trainingEffect[t.value];
          const delta = fatigueDelta(t.value, fatigue);
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
              <span className={s.tCardCond}>調子 <b>+{condEffect}</b></span>
              <span className={`${s.tCardSub} ${delta <= 0 ? s.tCardGood : ''}`}>
                {delta < 0
                  ? `疲労を癒す(${delta})`
                  : delta === 0
                    ? '疲労を溜めない(±0)'
                    : `疲労が溜まる(+${delta})`}
              </span>
            </button>
          );
        })}
      </div>
      <div className={s.tRecoNote}>おすすめの理由: {recommendReason(type, fatigue)}</div>
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
