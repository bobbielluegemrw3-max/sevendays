'use client';

import { useMemo } from 'react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import {
  bandRaceFrame,
  buildBandRace,
  type BandRaceInput,
  type BandRaceModel,
} from '@/lib/band-race';
import s from '../../app/daily-derby.module.css';

/* ============================================================================
 * BRACKET RACE — 帯レース(FUN_V3 施策G「帯の可視化」)
 *
 * ログ濁流(ダミー行)を、実データの暫定リーダーボードに置き換える幕。
 * このゲームにレースを追加する必要はない。既に存在しているレースが
 * 見えていないだけである — BURN は帯内スコア下位N頭切り、すなわち競走である。
 *
 * 品質の源泉は情報設計であってアート実装ではない(7/10 ドット走行撤去の教訓)。
 * したがってここには馬のアニメーションを置かない。順位表が機能することを
 * 確認してから、その上に薄く視覚レイヤーを足す。
 * ========================================================================== */

export function BandRaceAct({
  input,
  model: modelProp,
  elapsed,
}: {
  /** 帯の確定結果。model を直接渡す場合は不要。 */
  input?: BandRaceInput | undefined;
  model?: BandRaceModel | undefined;
  /** act ローカルの経過秒(0 = 幕開け)。 */
  elapsed: number;
}) {
  const model = useMemo(
    () => modelProp ?? (input ? buildBandRace(input) : null),
    [modelProp, input],
  );
  const frame = useMemo(() => (model ? bandRaceFrame(model, elapsed) : null), [model, elapsed]);
  if (!model || !frame) return null;

  const { phase, day, total, burns, lineRank, myScore, myRank, myFate, showFate, margin } = frame;

  return (
    <div className={s.brWrap}>
      {/* 帯の提示 — 7日間の物語の弧はこの数字だけで出る(LVが上がるほど母数が減る) */}
      <div className={s.brHead}>
        <span className={s.brLv}>LV.{day}</span>
        <span className={s.brField}>
          <AnimatedNumber value={total} animateOnMount durationMs={900} />頭が出走
        </span>
        <span className={s.brBurn}>
          <AnimatedNumber value={burns} animateOnMount durationMs={900} delayMs={400} />頭が消える
        </span>
      </div>

      {/* 自分のスコアを先に固定する — もう動かない。動くのは他馬の開示だけ */}
      {myScore !== null && (
        <div className={`${s.brYou} ${phase === 'YOU' ? s.brYouIn : ''}`}>
          <span className={s.brYouLabel}>YOUR SCORE</span>
          <span className={s.brYouScore}>
            <AnimatedNumber value={myScore} digits={2} animateOnMount durationMs={800} />
          </span>
          <span className={s.brYouRank}>
            {myRank === null ? (
              <span className={s.brPending}>順位確定前</span>
            ) : (
              <>
                暫定 <b><AnimatedNumber value={myRank} durationMs={420} /></b> 位
                <span className={s.brOf}> / 生存ライン {lineRank}位</span>
              </>
            )}
          </span>
        </div>
      )}

      <ol className={s.brBoard} aria-live="off">
        {frame.rows.map((r, i) =>
          r.gap ? (
            <li key={`gap:${i}`} className={s.brGap}>⋮</li>
          ) : (
            <li
              key={`${r.rank}:${r.name}`}
              className={[
                s.brRow,
                r.mine ? s.brMine : '',
                r.burned ? s.brBurned : '',
                r.atLine ? s.brAtLine : '',
              ].filter(Boolean).join(' ')}
            >
              <span className={s.brRank}>{r.rank}</span>
              <span className={s.brName}>{r.name}</span>
              <span className={s.brScore}>{r.score.toFixed(2)}</span>
              {r.burned && <span className={s.brTag}>BURN</span>}
            </li>
          ),
        )}
      </ol>

      {/* 生存ラインは常に見えている — 見るべきは首位ではなく「線と自分の距離」 */}
      <div className={s.brLine}>
        <span className={s.brLineLabel}>生存ライン</span>
        <span className={s.brLineRank}>{lineRank}位まで</span>
      </div>

      {showFate && myFate && (
        <div className={`${s.brVerdict} ${myFate === 'SAFE' ? s.brSafe : s.brDead}`}>
          {margin !== null ? (
            <>
              <b><AnimatedNumber value={margin} digits={2} animateOnMount durationMs={700} /></b>
              点差で{myFate === 'SAFE' ? '生存' : '及ばず'}
            </>
          ) : (
            <>{myFate === 'SAFE' ? '生存' : 'BURN'}</>
          )}
        </div>
      )}
    </div>
  );
}
