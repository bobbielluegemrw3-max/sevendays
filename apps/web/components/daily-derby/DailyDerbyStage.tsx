'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ALERT_SECONDS,
  COMPLETE_AT,
  FIXTURE_COUNTS,
  LOGS_FROM,
  LOG_SECTIONS,
  MARKET_OPEN,
  OPENING_STEPS,
  PRE_SHOW_SECONDS,
  RACE_RUN,
  SHOW_TOTAL,
  TITLE_UNTIL,
  logWindow,
  matchingCount,
  turnLabel,
  type DerbyCounts,
  type LogTone,
  type PersonalResult,
  type ShowStep,
} from '@/lib/daily-derby';
import { SegmentClock } from '@/components/daily-derby/SegmentClock';
import { DailyDerbyPersonalResult } from '@/components/daily-derby/DailyDerbyPersonalResult';
import { DailyDerbyFailureState } from '@/components/daily-derby/DailyDerbyFailureState';
import s from '../../app/daily-derby.module.css';

/**
 * THE DAILY DERBY のステージ全体。「開始までの残り秒数」(負値 = 開始後の経過)
 * を与えると該当する画面を描く。時計・API との同期は呼び出し側の責務
 * (プレビューはシミュレート時計、本結線はサーバー時刻+バッチ状態)。
 *
 * 演出フロー(約100秒): WAITING → 3分前デジタルカウントダウン(残り30秒で
 * 警告色)→ 20:00 ファンファーレ+タイトル+オープニング → レース実走(蹄音)
 * → 結果ログ濁流(BURN赤/生存緑/価値/DAY7金)→ P2Pターン(出品/入札/
 * マッチング/Day0発行)→ リワード(MLM/Revenge Buff)→ TODAY RACE END →
 * 個人結果。失敗時は静穏なセーフモード表示のみ。
 */
export interface DailyDerbyStageProps {
  /** 20:00 までの残り秒。開始後は負値(-経過秒)。 */
  secondsToStart: number;
  counts?: DerbyCounts;
  tickerEvents?: readonly string[];
  personal?: PersonalResult | null;
  failed?: boolean;
  fanfareSrc?: string;
  hoofbeatsSrc?: string;
}

export function DailyDerbyStage({
  secondsToStart,
  counts = FIXTURE_COUNTS,
  tickerEvents = [],
  personal = null,
  failed = false,
  fanfareSrc = '/sounds/fanfare.mp3',
  hoofbeatsSrc = '/sounds/hoofbeats.mp3',
}: DailyDerbyStageProps) {
  const elapsed = -secondsToStart;
  const [soundOn, setSoundOn] = useState(true);
  const fanfareRef = useRef<HTMLAudioElement | null>(null);
  const hoofsRef = useRef<HTMLAudioElement | null>(null);
  const prevRemaining = useRef(secondsToStart);
  const primed = useRef(false);

  /* iOS/Safariはユーザー操作の文脈外の音声再生をブロックし、許可は音声要素
     ごとに別。ファンファーレは「タップの数秒後にタイマーが鳴らす」ため、
     最初のタップで両音源を無音再生→即停止してロック解除しておく(priming)。 */
  useEffect(() => {
    const prime = () => {
      if (primed.current) return;
      primed.current = true;
      if (!fanfareRef.current) fanfareRef.current = new Audio(fanfareSrc);
      if (!hoofsRef.current) {
        hoofsRef.current = new Audio(hoofbeatsSrc);
        hoofsRef.current.loop = true;
      }
      for (const audio of [fanfareRef.current, hoofsRef.current]) {
        audio.muted = true;
        void audio
          .play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
          })
          .catch(() => {
            audio.muted = false;
          });
      }
    };
    window.addEventListener('pointerdown', prime, { once: true });
    window.addEventListener('touchend', prime, { once: true });
    return () => {
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('touchend', prime);
    };
  }, [fanfareSrc, hoofbeatsSrc]);

  /* 20:00 をまたいだ瞬間にファンファーレ(実尺16.8秒がオープニングのBGM。
     途中参加では鳴らさない — ライブの一回性を守る)。 */
  useEffect(() => {
    const prev = prevRemaining.current;
    prevRemaining.current = secondsToStart;
    if (failed || !soundOn) return;
    if (prev > 0 && secondsToStart <= 0 && elapsed < 6) {
      const audio = fanfareRef.current ?? new Audio(fanfareSrc);
      fanfareRef.current = audio;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        /* 音源未配置 or ブラウザの自動再生ブロック — 演出は音なしで続行 */
      });
    }
  }, [secondsToStart, elapsed, failed, soundOn, fanfareSrc]);

  /* レース実走の間だけ蹄音ループ(窓に入ったら再生、出たら停止)。 */
  useEffect(() => {
    const inWindow =
      !failed && soundOn && elapsed >= RACE_RUN.startAt && elapsed < RACE_RUN.endAt;
    if (inWindow && !hoofsRef.current) {
      hoofsRef.current = new Audio(hoofbeatsSrc);
      hoofsRef.current.loop = true;
    }
    const audio = hoofsRef.current;
    if (!audio) return;
    if (inWindow && audio.paused) {
      void audio.play().catch(() => {});
    } else if (!inWindow && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [elapsed, failed, soundOn, hoofbeatsSrc]);

  /* サウンドOFF即時反映+アンマウント時の停止。 */
  useEffect(() => {
    if (!soundOn) {
      fanfareRef.current?.pause();
      hoofsRef.current?.pause();
    }
  }, [soundOn]);
  useEffect(
    () => () => {
      fanfareRef.current?.pause();
      hoofsRef.current?.pause();
    },
    [],
  );

  const showTicker = !failed && elapsed >= LOGS_FROM && elapsed < SHOW_TOTAL + 30;

  return (
    <div className={s.stage}>
      <button
        type="button"
        className={s.soundBtn}
        onClick={() => setSoundOn((v) => !v)}
        aria-label={soundOn ? 'サウンドをオフ' : 'サウンドをオン'}
      >
        {soundOn ? 'SOUND ON' : 'SOUND OFF'}
      </button>

      <div className={s.stageInner}>
        {failed && secondsToStart <= 0 ? (
          <DailyDerbyFailureState />
        ) : secondsToStart > PRE_SHOW_SECONDS ? (
          <Waiting secondsToStart={secondsToStart} />
        ) : secondsToStart > 0 ? (
          <PreShowCountdown secondsToStart={secondsToStart} />
        ) : elapsed < SHOW_TOTAL ? (
          <LiveShow elapsed={elapsed} counts={counts} />
        ) : (
          <PersonalOrDone personal={personal} />
        )}
      </div>

      {showTicker && tickerEvents.length > 0 && <Ticker events={tickerEvents} />}
    </div>
  );
}

/* ---------------------------------------------------------------- WAITING */

function Waiting({ secondsToStart }: { secondsToStart: number }) {
  const total = Math.max(0, Math.floor(secondsToStart));
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return (
    <div>
      <div className={s.waitLabel}>Next Daily Derby</div>
      <div className={s.waitClock}>{`${pad(h)}:${pad(m)}:${pad(sec)}`}</div>
      <div className={s.waitNote}>20:00 (GMT+8) — One Race. One World. Every Day.</div>
    </div>
  );
}

/* ------------------------------------------- COUNTDOWN(3分前・7セグ表示) */

function PreShowCountdown({ secondsToStart }: { secondsToStart: number }) {
  const total = Math.max(0, Math.ceil(secondsToStart));
  const pad = (n: number) => String(n).padStart(2, '0');
  const text = `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  const alert = secondsToStart <= ALERT_SECONDS;
  const blink = Math.floor(secondsToStart * 2) % 2 === 0;
  return (
    <div className={s.cdWrap}>
      <div className={s.cdTitle}>THE DAILY DERBY</div>
      <div className={s.cdSub}>Starts In</div>
      <div className={`${s.cdClock} ${alert ? s.cdClockAlert : ''}`}>
        <SegmentClock text={text} blinkColon={blink} />
      </div>
      <div className={s.cdNote}>20:00 (GMT+8)</div>
    </div>
  );
}

/* ------------------------------------------------------------------- LIVE */

const RACE_STEP: ShowStep = {
  key: 'RACE',
  runLine: '🏇 Running Race Engine...',
  doneLine: '✓ Race Completed',
  startAt: RACE_RUN.startAt,
  duration: RACE_RUN.endAt - RACE_RUN.startAt,
  progress: true,
};

function LiveShow({ elapsed, counts }: { elapsed: number; counts: DerbyCounts }) {
  if (elapsed >= COMPLETE_AT) {
    return (
      <div className={s.doneBanner}>
        <div className={s.liveRule} />
        <div className={s.doneText}>TODAY RACE END</div>
        <div className={s.liveRule} />
      </div>
    );
  }
  if (elapsed >= LOGS_FROM) return <LogPhase elapsed={elapsed} counts={counts} />;
  return (
    <div>
      <div className={s.liveTitle}>
        <div className={s.liveRule} />
        <div className={s.liveTitleText}>THE DAILY DERBY</div>
        <div className={s.liveBadge}>
          <span className={s.liveDot} />
          LIVE
        </div>
        <div className={s.liveRule} />
      </div>
      {elapsed >= TITLE_UNTIL && (
        <Terminal steps={[...OPENING_STEPS, RACE_STEP]} elapsed={elapsed} counts={counts} />
      )}
    </div>
  );
}

function Terminal({
  steps,
  elapsed,
  counts,
}: {
  steps: readonly ShowStep[];
  elapsed: number;
  counts: DerbyCounts;
}) {
  return (
    <div className={s.terminal}>
      {steps.map((step) => {
        if (elapsed < step.startAt) return null;
        const running = elapsed < step.startAt + step.duration;
        const n = step.countKey ? counts[step.countKey] : undefined;
        const doneLine = step.doneLine.replace('{n}', n === undefined ? '' : n.toLocaleString('en-US'));
        const progress = step.progress
          ? Math.min(1, (elapsed - step.startAt) / step.duration)
          : null;
        return (
          <div key={step.key}>
            <div className={`${s.tLine} ${running ? '' : s.tLineDone}`}>
              {running ? (
                <>
                  <span className={s.tSpinner} />
                  <span>{step.runLine}</span>
                </>
              ) : (
                <span className={s.tCheck}>{doneLine}</span>
              )}
            </div>
            {progress !== null && running && (
              <div className={s.tProgress}>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------- log flood(レース結果〜配布) */

const TONE_CLASS: Record<LogTone, string> = {
  header: s.lgHeader!,
  burn: s.lgBurn!,
  survive: s.lgSurvive!,
  value: s.lgValue!,
  day7: s.lgDay7!,
  list: s.lgList!,
  bid: s.lgBid!,
  match: s.lgMatch!,
  mint: s.lgMint!,
  mlm: s.lgMlm!,
  item: s.lgItem!,
  end: s.lgEnd!,
};

function LogPhase({ elapsed, counts }: { elapsed: number; counts: DerbyCounts }) {
  const lines = logWindow(elapsed);
  const matched = matchingCount(elapsed, counts);
  const inMarketOpen = elapsed >= MARKET_OPEN.startAt && elapsed < MARKET_OPEN.endAt;
  const matchSection = LOG_SECTIONS.find((sec) => sec.key === 'MATCH')!;
  const showCounter = elapsed >= matchSection.startAt && elapsed < matchSection.endAt + 3;
  return (
    <div className={s.logPhase}>
      <div className={s.logHead}>
        <span className={s.logBrand}>
          THE DAILY DERBY <span className={s.liveDot} />
        </span>
        <span className={s.logTurn}>{turnLabel(elapsed)}</span>
        {showCounter && (
          <span className={s.logCounter}>
            MATCHED {matched.toLocaleString('en-US')} / {counts.assignments.toLocaleString('en-US')}
          </span>
        )}
      </div>

      {inMarketOpen && (
        <div className={s.mktOpen}>
          <div className={s.liveRule} />
          <div className={s.mktTitle}>GLOBAL MARKETPLACE OPENING</div>
          <div className={s.liveRule} />
        </div>
      )}

      <div className={s.logStream} aria-live="off">
        {lines.map((line) => (
          <div key={line.id} className={`${s.lg} ${TONE_CLASS[line.tone]}`}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------- result / done / ticker */

function PersonalOrDone({ personal }: { personal: PersonalResult | null }) {
  if (personal) return <DailyDerbyPersonalResult result={personal} />;
  return (
    <div className={s.doneBanner}>
      <div className={s.liveRule} />
      <div className={s.doneText}>TODAY RACE END</div>
      <div className={s.liveRule} />
    </div>
  );
}

function Ticker({ events }: { events: readonly string[] }) {
  const doubled = [...events, ...events];
  return (
    <div className={s.ticker}>
      <div className={s.tickerTrack}>
        {doubled.map((event, i) => (
          <span key={i} className={s.tickerItem}>
            {event}
          </span>
        ))}
      </div>
    </div>
  );
}
