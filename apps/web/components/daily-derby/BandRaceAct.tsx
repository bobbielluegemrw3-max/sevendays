'use client';

import { useMemo } from 'react';
import { PRICE_TABLE_V1 } from '@sevendays/domain';
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

/** 走破(LV.7到達)の買い戻し額。価格表の外側。 */
const CHAMPION_VALUE = 200;

/**
 * 生存で得たもの — 価値が1段上がる / LVが1つ進む / 走破まであと何走。
 *
 * `day` は帯のLV(= race_participant_snapshots.current_day)= レース前の値。
 * 生存すると LV は day+1 になり、価値は価格表の1段上へ動く。
 * LV.7 に届く夜は価格表の外(チャンピオン買い戻し 200 USDT)。
 */
function SurvivalGain({ day }: { day: number }) {
  const before = Number(PRICE_TABLE_V1[Math.max(0, Math.min(6, day))] ?? PRICE_TABLE_V1[0]);
  const nextDay = day + 1;
  const after = nextDay >= 7 ? CHAMPION_VALUE : Number(PRICE_TABLE_V1[Math.min(6, nextDay)] ?? before);
  const delta = Math.round((after - before) * 100) / 100;
  const remaining = 7 - nextDay;
  if (!Number.isFinite(before) || !Number.isFinite(after) || delta <= 0) return null;
  return (
    <div className={s.brGain}>
      <div className={s.brGainRow}>
        <span className={s.brGainK}>価値</span>
        <span className={s.brGainFrom}>{before.toFixed(2)}</span>
        <span className={s.brGainArrow}>→</span>
        <span className={s.brGainTo}>
          {/* 0 からではなく「昨日の価値」から登る — 上がった分が体で分かる */}
          <AnimatedNumber value={after} from={before} digits={2} animateOnMount durationMs={1100} delayMs={420} />
        </span>
        <span className={s.brGainUnit}>USDT</span>
        <span className={s.brGainDelta}>+{delta.toFixed(2)}</span>
      </div>
      <div className={s.brGainSub}>
        LV.{day} → LV.{nextDay}
        {remaining > 0 ? ` ・ 走破まで あと${remaining}走` : ' ・ 7日走破'}
      </div>
    </div>
  );
}

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
        <div className={s.brHeadL}>
          <span className={s.brEyebrow}>BRACKET</span>
          <span className={s.brLv}>LV.{day}</span>
        </div>
        <div className={s.brHeadR}>
          <span className={s.brStat}>
            <b className={s.brStatN}>
              <AnimatedNumber value={total} animateOnMount durationMs={900} />
            </b>
            <span className={s.brStatK}>出走</span>
          </span>
          <span className={s.brSep} />
          <span className={`${s.brStat} ${s.brStatBurn}`}>
            <b className={s.brStatN}>
              <AnimatedNumber value={burns} animateOnMount durationMs={900} delayMs={400} />
            </b>
            <span className={s.brStatK}>が消える</span>
          </span>
        </div>
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
                {/* ラインに到達したら暫定順位を赤へ。シアンのままだと
                    「もう死んでいる」ことが色で伝わらない(オーナー指摘) */}
                暫定{' '}
                <b className={myRank >= lineRank ? s.brRankDoomed : ''}>
                  <AnimatedNumber value={myRank} durationMs={420} />
                </b>{' '}
                位
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
              <span className={s.brVerdictK}>MARGIN</span>
              <span className={s.brVerdictN}>
                <AnimatedNumber value={margin} digits={2} animateOnMount durationMs={900} />
              </span>
              <span className={s.brVerdictT}>
                点差で{myFate === 'SAFE' ? '生存' : '及ばず'}
              </span>
            </>
          ) : (
            <span className={s.brVerdictT}>{myFate === 'SAFE' ? '生存' : 'BURN'}</span>
          )}
          {/* 生存で「得たもの」を出す(2026-07-21 オーナー指摘: ドキドキからの
              喜びが薄い)。それまで生存の瞬間に出るのは「死ななかった」だけで、
              これは損失回避であって報酬ではない — FUN_V3_PLAN §1.1 が経済に
              ついて言った診断が、そのままショーの中にも残っていた。
              生存で確定的に得るもの(価値が1段上がる / LVが1つ進む / 走破まで
              あと何走)は全て価格表と current_day の確定値なのでフィクションは
              ゼロ。数字は 0 からではなく **昨日の価値から** 登らせる。 */}
          {myFate === 'SAFE' && <SurvivalGain day={day} />}
        </div>
      )}
    </div>
  );
}
