'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { DerbyConditionsView, MyDerbyHorse } from '@/lib/daily-derby';
import { SegmentClock } from '@/components/daily-derby/SegmentClock';
import { DerbyVerdict, fixtureDropKey, type VerdictInfo } from '@/components/daily-derby/DerbyVerdict';
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
  /** 自分の馬名(ログ濁流で該当行をハイライト+チャイム)。 */
  myHorseNames?: readonly string[];
  /** 審判演出つきの自分の馬(dna/Day込み)。指定時は myHorseNames を上書き。 */
  myHorses?: readonly MyDerbyHorse[];
  /** 当夜のレース条件(Decision 082)。馬場発表スタンプ演出に使う。 */
  conditions?: DerbyConditionsView | null;
  /** 視覚QA専用: マウント時に審判演出を強制表示(プレビューのみ使用)。 */
  debugVerdict?: 'burn' | 'survive' | 'day7' | undefined;
}

/** 心拍音の開始窓(開始前の残り秒)。アイデア原文どおり19:58〜(=2分前)。 */
const HEARTBEAT_FROM = 120;

function audioContextCtor(): typeof AudioContext | undefined {
  return typeof AudioContext !== 'undefined'
    ? AudioContext
    : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export function DailyDerbyStage({
  secondsToStart,
  counts = FIXTURE_COUNTS,
  tickerEvents = [],
  personal = null,
  failed = false,
  fanfareSrc = '/sounds/fanfare.mp3',
  hoofbeatsSrc = '/sounds/hoofbeats.mp3',
  myHorses = [],
  conditions = null,
  debugVerdict,
  myHorseNames = [],
}: DailyDerbyStageProps) {
  const elapsed = -secondsToStart;
  const [soundOn, setSoundOn] = useState(true);
  const effectiveNames = myHorses.length > 0 ? myHorses.map((h) => h.name) : myHorseNames;
  const [verdict, setVerdict] = useState<VerdictInfo | null>(null);
  const verdictDone = useRef(false);
  useEffect(() => {
    if (!debugVerdict) {
      // ボタンで閉じた/ジャンプした: 強制表示を解除し、通常再生の審判は再度出せる
      setVerdict(null);
      verdictDone.current = false;
      return;
    }
    verdictDone.current = true;
    const horse = myHorses[0];
    setVerdict({
      name: horse?.name ?? 'Test Horse',
      kind: debugVerdict,
      horse,
      dropKey: debugVerdict === 'burn' ? 'spirit_roar' : null,
    });
    // QA表示は自動では消さない(スクリーンショットのため)。myHorsesは意図的に依存から除外。
  }, [debugVerdict]);
  const prevElapsed = useRef(elapsed);
  const primed = useRef(false);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const lastOwnSoundAt = useRef(0);

  /* 音源カタログ(オーナー支給の実音源、2026-07-07)。 */
  const soundCatalog = useMemo(
    () =>
      ({
        fanfare: { src: fanfareSrc },
        hoofs: { src: hoofbeatsSrc, loop: true },
        gate: { src: '/sounds/gate-open.mp3' },
        whinny: { src: '/sounds/horse-whinny.mp3' },
        crowd: { src: '/sounds/crowd.mp3', loop: true, volume: 0.45 },
        ownBurn: { src: '/sounds/own-burn.mp3' },
        ownGood: { src: '/sounds/own-good.mp3' },
        finale: { src: '/sounds/finale.mp3' },
      }) satisfies Record<string, { src: string; loop?: boolean; volume?: number }>,
    [fanfareSrc, hoofbeatsSrc],
  );

  const getAudio = useCallback(
    (key: string): HTMLAudioElement | null => {
      const conf = (soundCatalog as Record<string, { src: string; loop?: boolean; volume?: number }>)[key];
      if (!conf) return null;
      let audio = audioRefs.current.get(key) ?? null;
      if (!audio) {
        audio = new Audio(conf.src);
        if (conf.loop) audio.loop = true;
        if (conf.volume !== undefined) audio.volume = conf.volume;
        audioRefs.current.set(key, audio);
      }
      return audio;
    },
    [soundCatalog],
  );

  const playOneShot = useCallback(
    (key: string) => {
      if (!soundOn || failed) return;
      const audio = getAudio(key);
      if (!audio) return;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        /* 音源未配置/未アンロックでも演出は続行 */
      });
    },
    [soundOn, failed, getAudio],
  );

  /* 自分該当行(DERBY_DRAMA 第3幕):
     最初の審判対象行(BURN/生存/DAY7)は「0.8秒の完全静寂 → 審判オーバーレイ」。
     以降の該当行は従来どおりのチャイム。 */
  const playOwnLine = useCallback(
    (info: { name: string; tone: string }) => {
      const isVerdictTone = info.tone === 'burn' || info.tone === 'survive' || info.tone === 'day7';
      if (isVerdictTone && !verdictDone.current) {
        verdictDone.current = true;
        // 完全静寂: ループ音を止める(0.8秒後の審判音で破る)
        for (const key of ['hoofs', 'crowd']) {
          const audio = audioRefs.current.get(key);
          if (audio && !audio.paused) audio.pause();
        }
        const horse = myHorses.find((h) => h.name === info.name);
        const kind = info.tone === 'burn' ? 'burn' : info.tone === 'day7' ? 'day7' : 'survive';
        const dropKey = kind === 'burn'
          ? fixtureDropKey(info.name, new Date().toISOString().slice(0, 10))
          : null;
        setVerdict({ name: info.name, kind, horse, dropKey });
        setTimeout(() => playOneShot(kind === 'burn' ? 'ownBurn' : 'ownGood'), 800);
        if (kind === 'burn' && dropKey) setTimeout(() => playOneShot('ownGood'), 2600);
        // 審判の幕引き(ループ音は窓同期エフェクトが自動復帰させる)
        setTimeout(() => setVerdict(null), kind === 'burn' && dropKey ? 6200 : 4600);
        return;
      }
      if (performance.now() - lastOwnSoundAt.current < 400) return; // 連発抑制
      lastOwnSoundAt.current = performance.now();
      playOneShot(info.tone === 'burn' ? 'ownBurn' : 'ownGood');
    },
    [playOneShot, myHorses],
  );

  /* iOS/Safariはユーザー操作の文脈外の音声再生をブロックし、許可は音声要素
     ごとに別。最初のタップで全音源を無音再生→即停止してロック解除(priming)。 */
  useEffect(() => {
    const prime = () => {
      if (primed.current) return;
      primed.current = true;
      // WebAudio(心拍)もこのジェスチャーでロック解除しておく
      const Ctor = audioContextCtor();
      if (Ctor) {
        if (!heartCtxRef.current) heartCtxRef.current = new Ctor();
        if (heartCtxRef.current.state === 'suspended') {
          void heartCtxRef.current.resume().catch(() => undefined);
        }
      }
      for (const key of Object.keys(soundCatalog)) {
        const audio = getAudio(key);
        if (!audio) continue;
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
  }, [soundCatalog, getAudio]);

  /* 一発モノのキュー(経過秒の通過検知)。freshを超えて飛び越えた場合は鳴らさ
     ない — 途中参加でフィナーレ音だけ鳴る事故を防ぐ。ファンファーレの
     「20:00通過の瞬間だけ」というライブの一回性もこの仕組みで維持。 */
  useEffect(() => {
    const prev = prevElapsed.current;
    prevElapsed.current = elapsed;
    if (failed || !soundOn) return;
    const cues: ReadonlyArray<{ at: number; key: string; fresh: number }> = [
      { at: 0, key: 'fanfare', fresh: 6 },
      { at: RACE_RUN.startAt, key: 'gate', fresh: 3 },
      { at: RACE_RUN.startAt + 1.6, key: 'whinny', fresh: 3 },
      { at: COMPLETE_AT, key: 'finale', fresh: 4 },
    ];
    for (const cue of cues) {
      if (prev < cue.at && elapsed >= cue.at && elapsed < cue.at + cue.fresh) {
        playOneShot(cue.key);
      }
    }
  }, [elapsed, failed, soundOn, playOneShot]);

  /* ループ音の窓同期: 蹄音=レース実走、群衆の話し声=ログ濁流の間ずっと。 */
  useEffect(() => {
    const windows: ReadonlyArray<{ key: string; from: number; to: number }> = [
      { key: 'hoofs', from: RACE_RUN.startAt, to: RACE_RUN.endAt },
      { key: 'crowd', from: LOGS_FROM, to: COMPLETE_AT },
    ];
    for (const w of windows) {
      const inWindow = !failed && soundOn && elapsed >= w.from && elapsed < w.to;
      const audio = inWindow ? getAudio(w.key) : (audioRefs.current.get(w.key) ?? null);
      if (!audio) continue;
      if (inWindow && audio.paused) {
        void audio.play().catch(() => {});
      } else if (!inWindow && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
  }, [elapsed, failed, soundOn, getAudio]);

  /* 心拍(DERBY_DRAMA 第1幕): 残り2分からWebAudioの合成心音。0に近づくほど速く。 */
  const heartCtxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    const inWindow = soundOn && !failed && secondsToStart > 0 && secondsToStart <= HEARTBEAT_FROM;
    if (!inWindow) return;
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    if (!heartCtxRef.current) heartCtxRef.current = new Ctor();
    const ctx = heartCtxRef.current;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const thump = (when: number, gainPeak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      // 純サブベース(38-52Hz)は小型スピーカーで再生不能 — 110Hz起点で落とす
      osc.frequency.setValueAtTime(112, when);
      osc.frequency.exponentialRampToValueAtTime(44, when + 0.1);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(gainPeak, when + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.18);
    };
    const beat = () => {
      if (stopped) return;
      const remain = Math.max(0, secondsToStartRef.current);
      if (remain <= 0 || remain > HEARTBEAT_FROM) return;
      const t = ctx.currentTime;
      const intensity = 0.16 + 0.24 * (1 - remain / HEARTBEAT_FROM);
      thump(t, intensity);
      thump(t + 0.24, intensity * 0.65);
      const interval = 350 + 750 * (remain / HEARTBEAT_FROM); // 1.1s -> 0.35s
      timer = setTimeout(beat, interval);
    };
    beat();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // secondsToStart は毎秒変わるため ref 経由で読む(エフェクトは窓の出入りのみ)
  }, [soundOn, failed, secondsToStart > 0 && secondsToStart <= HEARTBEAT_FROM]);
  const secondsToStartRef = useRef(secondsToStart);
  secondsToStartRef.current = secondsToStart;

  /* 馬場発表(DERBY_DRAMA 第1幕): スタンプ音(タイトル直後の3連打+祭りチャイム)。 */
  const stampPlayed = useRef(0);
  useEffect(() => {
    if (failed || !conditions || elapsed < TITLE_UNTIL + 0.5 || elapsed > TITLE_UNTIL + 6) return;
    const local = elapsed - (TITLE_UNTIL + 0.5);
    const due = Math.min(3, Math.floor(local / 1.1) + 1);
    while (stampPlayed.current < due) {
      stampPlayed.current += 1;
      playOneShot('gate');
    }
    if (conditions.night_name && local >= 3.6 && stampPlayed.current < 4) {
      stampPlayed.current = 4;
      playOneShot('ownGood');
    }
  }, [elapsed, failed, conditions, playOneShot]);

  /* サウンドOFF即時反映+アンマウント時の停止。 */
  useEffect(() => {
    if (!soundOn) for (const audio of audioRefs.current.values()) audio.pause();
  }, [soundOn]);
  const refsForUnmount = audioRefs;
  useEffect(
    () => () => {
      for (const audio of refsForUnmount.current.values()) audio.pause();
    },
    [refsForUnmount],
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
          <PreShowCountdown secondsToStart={secondsToStart} myHorses={myHorses} />
        ) : elapsed < SHOW_TOTAL ? (
          <LiveShow
            elapsed={elapsed}
            counts={counts}
            myHorseNames={effectiveNames}
            myHorses={myHorses}
            conditions={conditions}
            onMine={playOwnLine}
          />
        ) : (
          <PersonalOrDone personal={personal} />
        )}
      </div>

      {showTicker && tickerEvents.length > 0 && <Ticker events={tickerEvents} />}
      {verdict && <DerbyVerdict verdict={verdict} />}
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

function PreShowCountdown({
  secondsToStart,
  myHorses,
}: {
  secondsToStart: number;
  myHorses: readonly MyDerbyHorse[];
}) {
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
      {myHorses.length > 0 && (
        <div className={s.tonight}>
          <div className={s.tonightK}>今夜のあなた</div>
          <div className={s.tonightChips}>
            {myHorses.slice(0, 4).map((h) => (
              <span key={h.name} className={s.tonightChip}>
                {h.name}
                {h.currentDay !== undefined && <b> DAY{h.currentDay}</b>}
              </span>
            ))}
          </div>
          <div className={s.tonightNote}>
            生き残れば馬の価値は上がり、DAY7走破で 200 USDT。すべては今夜の1走に。
          </div>
        </div>
      )}
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

function LiveShow({
  elapsed,
  counts,
  myHorseNames,
  myHorses,
  conditions,
  onMine,
}: {
  elapsed: number;
  counts: DerbyCounts;
  myHorseNames: readonly string[];
  myHorses: readonly MyDerbyHorse[];
  conditions: DerbyConditionsView | null;
  onMine: (info: { name: string; tone: string }) => void;
}) {
  if (elapsed >= COMPLETE_AT) {
    return (
      <div className={s.doneBanner}>
        <div className={s.liveRule} />
        <div className={s.doneText}>TODAY RACE END</div>
        <div className={s.liveRule} />
      </div>
    );
  }
  if (elapsed >= LOGS_FROM) {
    return <LogPhase elapsed={elapsed} counts={counts} myHorseNames={myHorseNames} onMine={onMine} />;
  }
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
      {conditions && elapsed >= TITLE_UNTIL + 0.5 && (
        <BabaHappyo conditions={conditions} local={elapsed - (TITLE_UNTIL + 0.5)} />
      )}
      {myHorses.length > 0 && elapsed >= RACE_RUN.startAt && elapsed < RACE_RUN.endAt + 1 && (
        <MidRace elapsed={elapsed} horse={myHorses[0]!} />
      )}
    </div>
  );
}

/* --------------------------- 馬場発表(Decision 082 × DERBY_DRAMA 第1幕) */

function BabaHappyo({ conditions, local }: { conditions: DerbyConditionsView; local: number }) {
  const stamps: Array<{ k: string; v: string; at: number; cls?: string }> = [
    { k: '天候', v: conditions.weather_ja, at: 0 },
    { k: '馬場', v: conditions.track_ja, at: 1.1 },
    { k: 'コース', v: conditions.surface_ja, at: 2.2 },
  ];
  return (
    <div className={s.baba}>
      <div className={s.babaK}>— 本日の馬場発表 —</div>
      <div className={s.babaRow}>
        {stamps.map((st) => (
          <div key={st.k} className={`${s.babaStamp} ${local >= st.at ? s.babaStampIn : ''}`}>
            <span className={s.babaStampK}>{st.k}</span>
            <span className={s.babaStampV}>{st.v}</span>
          </div>
        ))}
      </div>
      {conditions.night_name && local >= 3.6 && (
        <div className={s.babaFes}>{conditions.night_name}</div>
      )}
    </div>
  );
}

/* ------------------------- 中間経過(自分の馬・DERBY_DRAMA 第2幕の近似) */

function MidRace({ elapsed, horse }: { elapsed: number; horse: MyDerbyHorse }) {
  // 馬名から決定論的な順位の推移を作る(演出 — 実順位はレース後に確定)
  let h = 2166136261;
  for (let i = 0; i < horse.name.length; i++) {
    h ^= horse.name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = (n: number) => ((h >>> (n * 5)) % 9);
  const checks: Array<{ at: number; label: string; rank: number }> = [
    { at: RACE_RUN.startAt + 3, label: '第2コーナー', rank: 6 + r(0) },
    { at: RACE_RUN.startAt + 7, label: '第3コーナー', rank: 3 + r(1) },
    { at: RACE_RUN.startAt + 11, label: '第4コーナー', rank: 1 + (r(2) % 6) },
  ];
  const visible = checks.filter((c) => elapsed >= c.at);
  if (visible.length === 0) return null;
  return (
    <div className={s.midRace}>
      {visible.map((c) => (
        <div key={c.label} className={s.midLine}>
          🏇 {c.label} — <b>{horse.name}</b> 現在 {c.rank}位
        </div>
      ))}
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

function LogPhase({
  elapsed,
  counts,
  myHorseNames,
  onMine,
}: {
  elapsed: number;
  counts: DerbyCounts;
  myHorseNames: readonly string[];
  onMine: (info: { name: string; tone: string }) => void;
}) {
  const myNames = useMemo(() => new Set(myHorseNames), [myHorseNames]);
  const lines = logWindow(elapsed, 44, myNames);
  // 自分該当行が新しく現れたらチャイム(1行につき1回)
  const seenMine = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const line of lines) {
      if (line.mine && !seenMine.current.has(line.id)) {
        seenMine.current.add(line.id);
        onMine({ name: line.name ?? '', tone: line.tone });
      }
    }
  }, [lines, onMine]);
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
          <div
            key={line.id}
            className={`${s.lg} ${TONE_CLASS[line.tone]} ${line.mine ? s.lgMine : ''}`}
          >
            {line.text}
            {line.mine ? '  ◀ YOU' : ''}
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
