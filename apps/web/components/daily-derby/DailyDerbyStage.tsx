'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OPENING_STEPS,
  ALERT_SECONDS,
  COMPLETE_AT,
  FIXTURE_COUNTS,
  LOGS_FROM,
  LOG_SECTIONS,
  MARKET_OPEN,
  PRE_SHOW_SECONDS,
  RACE_RUN,
  SHOW_TOTAL,
  TITLE_UNTIL,
  logWindow,
  matchingCount,
  turnLabel,
  type DerbyCounts,
  type DerbyNightResults,
  type LogTone,
  type ShowStep,
} from '@/lib/daily-derby';
import type { DerbyConditionsView, MyDerbyHorse } from '@/lib/daily-derby';
import { SegmentClock } from '@/components/daily-derby/SegmentClock';
import { DerbyVerdict, type VerdictInfo } from '@/components/daily-derby/DerbyVerdict';
import { PRICE_TABLE_V1 } from '@sevendays/domain';
import { NightResultsList, nightResultsCount } from '@/components/daily-derby/NightResultsList';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
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
 * その夜の自分の全結果サマリー。失敗時は静穏なセーフモード表示のみ。
 */
export interface DailyDerbyStageProps {
  /** 20:00 までの残り秒。開始後は負値(-経過秒)。 */
  secondsToStart: number;
  counts?: DerbyCounts;
  tickerEvents?: readonly string[];
  /** ショー最後に出す当夜の自分の全結果(下の記録と同一データ)。 */
  nightResults?: DerbyNightResults | null;
  failed?: boolean;
  fanfareSrc?: string;
  hoofbeatsSrc?: string;
  /** 自分の馬(dna/Day込み)。待機パドック・点呼のフォールバックに使う。 */
  myHorses?: readonly MyDerbyHorse[];
  /** 当夜の自分の実イベント(審判演出の実結線 2026-07-16 #5)。
   *  レースFINALIZED後にAPIから届く。null=まだ確定していない。
   *  従来の「濁流のフィクション行と実馬名の偶然一致」方式は本番で発火せず廃止。 */
  myEvents?: DerbyNightResults | null;
  /** 当夜のレース条件(Decision 082)。タイトル直後に一瞬テキスト表示する。 */
  conditions?: DerbyConditionsView | null;
  /** 今夜の予報(日中の待機パドック掲示板用・確定条件が出るまでの代役) */
  tonightForecast?: DerbyConditionsView | null;
  /** 次のレースの全体出走枠(Decision 093: 少頭数有利の可視化・実データ)。 */
  tonightField?: { entrants: number; burnSlotsMin: number; burnSlotsMax: number } | null;
  /** 明日の予報(ADR-012)。ショー最終幕(YOUR RESULTSの後)で発表する。 */
  tomorrowForecast?: DerbyConditionsView | null;
  /** 見逃しリプレイ再生中(2026-07-16): REPLAYバー表示+タイトルのLIVEバッジをREPLAYに。 */
  replay?: boolean;
  /** リプレイの「スキップして結果へ」ボタン(replay時のみ使用)。 */
  onReplaySkip?: (() => void) | undefined;
  /** 視覚QA専用: マウント時に審判を強制表示(プレビューのみ使用)。 */
  debugVerdict?: 'burn' | 'survive' | 'day7' | 'match_sell' | 'match_buy' | undefined;
  /** 出走馬カードの案切替(検討用 2026-07-10): 0=現行チップ / 1=出走カード / 2=パドック。 */
  tonightVariant?: 0 | 1 | 2;
}

/* レース条件の値ごとの色(全部同色だと読み分けられない — オーナー指摘 2026-07-10)。 */
const CONDITION_COLORS: Record<string, string> = {
  SUNNY: '#ffd97a', CLOUDY: '#aab4c8', RAIN: '#6fc3ff', STORM: '#c78cff',
  FAST: '#00eaff', GOOD: '#35d07f', SOFT: '#e6b24a', HEAVY: '#ff5c5c',
  TURF: '#58d68d', DIRT: '#d8a05a',
};

/* ③チャプター(ターン境界の全画面章タイトル・1.4秒)。 */
const CHAPTERS = [
  { at: LOGS_FROM, no: 'CHAPTER 01', name: 'RACE RESULTS', cls: 'chapCyan' },
  { at: MARKET_OPEN.startAt, no: 'CHAPTER 02', name: 'P2P MARKETPLACE', cls: 'chapMag' },
  { at: LOG_SECTIONS.find((sec) => sec.key === 'MLM')!.startAt, no: 'CHAPTER 03', name: 'REWARDS', cls: 'chapGold' },
] as const;
const CHAPTER_SECONDS = 1.4;

/* ⑦点呼モード: 出走がこの頭数未満の「静かな夜」は濁流を1頭ずつの点呼に切替。 */
const QUIET_NIGHT_HORSES = 500;

/* 大量所有(100頭等)対策: 審判オーバーレイの待ち行列上限。超過分はオーバーレイを
   省略してMY LANEと最後の全結果サマリーにだけ記録する(ショー尺101秒に収める)。 */
const VERDICT_QUEUE_MAX = 6;
/* MY LANEに同時表示する最新件数(超過は「ほか n 件」)。 */
const MY_LANE_VISIBLE = 7;

/* 一番最初のバージョンの起動ターミナル最終ステップ(絵文字なし)。 */
const RACE_STEP: ShowStep = {
  key: 'RACE',
  runLine: 'Running Race Engine...',
  doneLine: '✓ Race Completed',
  startAt: RACE_RUN.startAt,
  duration: RACE_RUN.endAt - RACE_RUN.startAt,
  progress: true,
};

/* ④動く数字: 実バッチ値へ向かう ease-out 補間(表示専用・途中参加でも正値)。 */
const easeOut = (x: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

export function DailyDerbyStage({
  secondsToStart,
  counts = FIXTURE_COUNTS,
  tickerEvents = [],
  nightResults = null,
  failed = false,
  fanfareSrc = '/sounds/fanfare.mp3',
  hoofbeatsSrc = '/sounds/hoofbeats.mp3',
  myHorses = [],
  myEvents = null,
  conditions = null,
  tonightForecast = null,
  tonightField = null,
  tomorrowForecast = null,
  replay = false,
  onReplaySkip,
  debugVerdict,
  tonightVariant = 1,
}: DailyDerbyStageProps) {
  const elapsed = -secondsToStart;
  const [soundOn, setSoundOn] = useState(true);
  const [verdict, setVerdict] = useState<VerdictInfo | null>(null);
  const [verdictQueued, setVerdictQueued] = useState(0);
  /* ①MY LANE: 発火済みの自分イベントを時系列で保持(濁流右の専用レーン)。 */
  const [myLane, setMyLane] = useState<VerdictInfo[]>([]);
  /* ②ヒットストップ: 自分の審判の瞬間、ステージ全体を320msだけ微拡大。 */
  const [stageHit, setStageHit] = useState(false);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hit = useCallback(() => {
    setStageHit(false);
    if (hitTimer.current) clearTimeout(hitTimer.current);
    requestAnimationFrame(() => setStageHit(true));
    hitTimer.current = setTimeout(() => setStageHit(false), 340);
  }, []);
  /* 審判キュー: 複数馬・複数P2P成立でも1件ずつ順番に見せる(オーナー承認の方式)。 */
  const verdictQueue = useRef<VerdictInfo[]>([]);
  const verdictShowing = useRef(false);
  const verdictTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenVerdicts = useRef<Set<string>>(new Set());
  const debugActive = useRef(false);
  useEffect(() => {
    if (!debugVerdict) {
      // ボタンで閉じた/ジャンプした: 強制表示を解除し、通常再生の審判は再度出せる
      debugActive.current = false;
      setVerdict(null);
      setVerdictQueued(0);
      verdictQueue.current = [];
      verdictShowing.current = false;
      if (verdictTimer.current) clearTimeout(verdictTimer.current);
      verdictTimer.current = null;
      seenVerdicts.current.clear();
      return;
    }
    // デバッグ中は自然再生のキュー/タイマーを止める(3.2秒で消える競合の防止)
    debugActive.current = true;
    if (verdictTimer.current) clearTimeout(verdictTimer.current);
    verdictTimer.current = null;
    verdictQueue.current = [];
    setVerdictQueued(0);
    verdictShowing.current = true;
    const horse = myHorses[0];
    const kind = debugVerdict === 'match_sell' || debugVerdict === 'match_buy' ? 'match' : debugVerdict;
    setVerdict({
      name: horse?.name ?? 'Test Horse',
      kind,
      horse,
      dropKey: debugVerdict === 'burn' ? 'spirit_roar' : null,
      usedItemKey: debugVerdict === 'burn' ? 'rain_hood' : null,
      matchSide: debugVerdict === 'match_sell' ? 'sell' : debugVerdict === 'match_buy' ? 'buy' : undefined,
      counterpart: kind === 'match' ? 'k*****i@gmail.com' : undefined,
    });
    // QA表示は自動では消さない(スクリーンショットのため)。myHorsesは意図的に依存から除外。
  }, [debugVerdict]);
  const prevElapsed = useRef(elapsed);
  const primed = useRef(false);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

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

  /* 審判キューの再生: 先頭を表示→表示時間後に次へ(空になったら閉じる)。
     表示の瞬間に ②ヒットストップ+①MY LANEへの記帳も行う。 */
  const showNextVerdict = useCallback(() => {
    const next = verdictQueue.current.shift() ?? null;
    setVerdict(next);
    setVerdictQueued(verdictQueue.current.length);
    if (!next) {
      verdictShowing.current = false;
      verdictTimer.current = null;
      return;
    }
    verdictShowing.current = true;
    hit();
    setMyLane((prev) => [...prev, next]);
    playOneShot(next.kind === 'burn' ? 'ownBurn' : 'ownGood');
    if (next.kind === 'burn' && next.dropKey) setTimeout(() => playOneShot('ownGood'), 1600);
    const duration = next.kind === 'burn' ? (next.dropKey ? 5000 : 3600) : 3200;
    verdictTimer.current = setTimeout(showNextVerdict, duration);
  }, [playOneShot, hit]);

  /* リプレイ/翌日待機へ戻ったらMY LANEと審判の既読をリセット(ループ視聴)。 */
  const scheduleJoined = useRef(false);
  const wasPreShow = useRef(secondsToStart > 0);
  useEffect(() => {
    const isPreShow = secondsToStart > 0;
    if (isPreShow && !wasPreShow.current) {
      setMyLane([]);
      seenVerdicts.current.clear();
      verdictQueue.current = [];
      scheduleJoined.current = false;
    }
    wasPreShow.current = isPreShow;
  }, [secondsToStart > 0]);
  useEffect(
    () => () => {
      if (verdictTimer.current) clearTimeout(verdictTimer.current);
    },
    [],
  );

  /* 審判キューへの投入(共通): 上限超過分はオーバーレイを省略してMY LANEへ直接記帳。 */
  const enqueueVerdict = useCallback(
    (ev: VerdictInfo) => {
      if (debugActive.current) return; // QA強制表示中は自然キューを積まない
      if (verdictQueue.current.length >= VERDICT_QUEUE_MAX) {
        setMyLane((prev) => [...prev, ev]);
        return;
      }
      verdictQueue.current.push(ev);
      if (verdictShowing.current) setVerdictQueued(verdictQueue.current.length);
      else showNextVerdict();
    },
    [showNextVerdict],
  );

  /* ---- 審判演出の実結線(2026-07-16 #5) ----------------------------------
     当夜の実イベント(myEvents)を、該当セクションの時間帯に1件ずつ発火する。
     - 生存: SURVIVORSセクション / BURN: BURN RESOLUTIONセクション /
       DAY7: DAY7 CLEARセクション / 売買成立: P2P MATCHINGセクション
     - 静かな夜(点呼)は点呼スロットに同期(その馬の大写し中に審判が重なる)
     - 途中参加は12秒以上過去のイベントを再生せずMY LANEにだけ記帳 */
  const raceRunners = useMemo<readonly MyDerbyHorse[]>(() => {
    if (myEvents && (myEvents.survived.length > 0 || myEvents.burned.length > 0)) {
      return [
        ...myEvents.survived.map((r) => ({ name: r.name, dnaHash: r.dna_hash, currentDay: r.from_day })),
        ...myEvents.burned.map((r) => ({ name: r.name, dnaHash: r.dna_hash, currentDay: r.day ?? 1 })),
      ];
    }
    // イベント未確定の間のフォールバック(今夜走った=currentDay>=1のACTIVE馬)
    return myHorses.filter((h) => (h.currentDay ?? 1) >= 1);
  }, [myEvents, myHorses]);
  const quiet = counts.horses < QUIET_NIGHT_HORSES && (raceRunners.length > 0 || myHorses.length > 0);
  const rollSlot = Math.min(9, Math.max(3.5, (MARKET_OPEN.startAt - LOGS_FROM) / Math.max(1, raceRunners.length)));

  const verdictSchedule = useMemo<ReadonlyArray<{ fireAt: number; info: VerdictInfo }>>(() => {
    if (!myEvents) return [];
    const out: { fireAt: number; info: VerdictInfo }[] = [];
    // exactOptionalPropertyTypes: undefinedの明示代入は不可 — 条件付きspreadで回避
    const horseOf = (name: string, dna: string, day: number | null): MyDerbyHorse => ({
      name,
      dnaHash: dna,
      ...(day !== null ? { currentDay: day } : {}),
    });
    const sec = (key: string) => LOG_SECTIONS.find((x) => x.key === key)!;
    // レースターン(生存/BURN/DAY7)。点呼の夜はスロット同期、濁流の夜はセクション同期。
    const raceTurnAt = (name: string, sectionKey: string, idxInSection: number): number => {
      if (quiet) {
        const i = raceRunners.findIndex((h) => h.name === name);
        if (i >= 0) return LOGS_FROM + i * rollSlot + rollSlot * 0.55;
      }
      const s = sec(sectionKey);
      return s.startAt + 1.5 + idxInSection * 3.4;
    };
    myEvents.survived.filter((r) => !r.day7).forEach((r, i) => {
      out.push({
        fireAt: raceTurnAt(r.name, 'SURVIVE', i),
        info: {
          name: r.name, kind: 'survive', horse: horseOf(r.name, r.dna_hash, r.from_day),
          dropKey: null, usedItemKey: null,
        },
      });
    });
    myEvents.burned.forEach((r, i) => {
      out.push({
        fireAt: raceTurnAt(r.name, 'BURN', i),
        info: {
          name: r.name, kind: 'burn', horse: horseOf(r.name, r.dna_hash, r.day),
          dropKey: r.drop_item_key, usedItemKey: r.used_item_key,
        },
      });
    });
    myEvents.survived.filter((r) => r.day7).forEach((r, i) => {
      out.push({
        fireAt: raceTurnAt(r.name, 'DAY7', i),
        info: {
          name: r.name, kind: 'day7', horse: horseOf(r.name, r.dna_hash, r.from_day),
          dropKey: null, usedItemKey: null,
        },
      });
    });
    const match = sec('MATCH');
    myEvents.sold.forEach((r, i) => {
      out.push({
        fireAt: match.startAt + 1.5 + i * 3.4,
        info: {
          name: r.name, kind: 'match', horse: horseOf(r.name, r.dna_hash, r.day),
          dropKey: null, usedItemKey: null, matchSide: 'sell', counterpart: r.counterpart,
        },
      });
    });
    myEvents.bought.forEach((r, i) => {
      out.push({
        fireAt: sec('MINT').startAt + 1.5 + i * 3.4,
        info: {
          name: r.name, kind: 'match', horse: horseOf(r.name, r.dna_hash, r.day),
          dropKey: null, usedItemKey: null, matchSide: 'buy', counterpart: r.counterpart ?? undefined,
        },
      });
    });
    return out.sort((a, b) => a.fireAt - b.fireAt);
  }, [myEvents, quiet, raceRunners, rollSlot]);

  useEffect(() => {
    if (verdictSchedule.length === 0 || elapsed < LOGS_FROM) return;
    const keyOf = (sv: { info: VerdictInfo }) => `${sv.info.kind}:${sv.info.matchSide ?? ''}:${sv.info.name}`;
    // 途中参加/リロード: 大きく過ぎたイベントは再生せずMY LANEにだけ記帳する
    if (!scheduleJoined.current) {
      scheduleJoined.current = true;
      const stale = verdictSchedule.filter(
        (sv) => elapsed - sv.fireAt > 12 && !seenVerdicts.current.has(keyOf(sv)),
      );
      if (stale.length > 0) {
        for (const sv of stale) seenVerdicts.current.add(keyOf(sv));
        setMyLane((prev) => [...prev, ...stale.map((sv) => sv.info)]);
      }
    }
    if (elapsed >= COMPLETE_AT) return; // ショー後は全結果サマリーが担う
    for (const sv of verdictSchedule) {
      if (sv.fireAt <= elapsed && !seenVerdicts.current.has(keyOf(sv))) {
        seenVerdicts.current.add(keyOf(sv));
        enqueueVerdict(sv.info);
      }
    }
  }, [elapsed, verdictSchedule, enqueueVerdict]);

  /* iOS/Safariはユーザー操作の文脈外の音声再生をブロックし、許可は音声要素
     ごとに別。最初のタップで全音源を無音再生→即停止してロック解除(priming)。 */
  useEffect(() => {
    const prime = () => {
      if (primed.current) return;
      primed.current = true;
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
  const chapter = !failed && elapsed < SHOW_TOTAL
    ? CHAPTERS.find((c) => elapsed >= c.at && elapsed < c.at + CHAPTER_SECONDS)
    : undefined;

  return (
    <div className={`${s.stage} ${stageHit ? s.stageHit : ''}`}>
      {replay && (
        <div className={s.replayBar}>
          <span className={s.replayTag}>
            <span className={s.replayDot} />
            REPLAY
          </span>
          <span className={s.replayText}>今夜のダービー(録画)— 見逃し再生は今夜1回だけ</span>
          {onReplaySkip && (
            <button type="button" className={s.replayBtn} onClick={onReplaySkip}>
              スキップして結果へ →
            </button>
          )}
        </div>
      )}
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
          <Waiting
            secondsToStart={secondsToStart}
            myHorses={myHorses}
            conditions={conditions}
            forecast={tonightForecast}
            field={tonightField}
            night={nightResults}
          />
        ) : secondsToStart > 0 ? (
          <PreShowCountdown secondsToStart={secondsToStart} myHorses={myHorses} variant={tonightVariant} />
        ) : elapsed < SHOW_TOTAL ? (
          <LiveShow
            elapsed={elapsed}
            counts={counts}
            runners={raceRunners}
            rollSlot={rollSlot}
            debutCount={myHorses.length}
            conditions={conditions}
            myLane={myLane}
            quiet={quiet}
            replay={replay}
          />
        ) : (
          <PersonalOrDone night={nightResults} forecast={tomorrowForecast} field={tonightField} />
        )}
      </div>

      {chapter && (
        <div className={s.chapCard}>
          <div className={s.chapNo}>{chapter.no}</div>
          <div className={`${s.chapName} ${s[chapter.cls]}`}>{chapter.name}</div>
          <div className={s.chapRule} />
        </div>
      )}
      {showTicker && tickerEvents.length > 0 && <Ticker events={tickerEvents} />}
      {verdict && <DerbyVerdict verdict={verdict} queued={verdictQueued} />}
    </div>
  );
}

/* ---------------------------------------------------------------- WAITING */

/* 待機パドック(2026-07-13): 「ただの時計」→出走前の待合室。
   全て実データ(自分の馬・確定条件/70%予報・昨夜の自分の結果)と既存部品
   (TonightEntryCards)の再配置 — 架空値なし・追加ポーリングなし。
   背景にはチャンピオン動画ループ(hero-loop.mp4・CDNキャッシュ済4MB)を薄く敷く。 */
function Waiting({
  secondsToStart,
  myHorses,
  conditions,
  forecast,
  field,
  night,
}: {
  secondsToStart: number;
  myHorses: readonly MyDerbyHorse[];
  conditions: DerbyConditionsView | null;
  forecast: DerbyConditionsView | null;
  field: { entrants: number; burnSlotsMin: number; burnSlotsMax: number } | null;
  night: DerbyNightResults | null;
}) {
  const total = Math.max(0, Math.floor(secondsToStart));
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  // 段階ラベル: 1時間前から色味が変わり、10分前は開門予告。
  const finalHour = total <= 3600;
  const soon = total <= 600;
  const label = soon ? 'GATES OPENING SOON' : finalHour ? 'FINAL HOUR' : 'Next Daily Derby';
  const untrained = myHorses.filter((x) => x.trainedForNextRace === false);
  const board = conditions ?? forecast;
  const boardIsForecast = !conditions && !!forecast;
  const day7 = night ? night.survived.filter((r) => r.day7).length : 0;
  const digest = night
    ? { burned: night.burned.length, survived: night.survived.length, sold: night.sold.length, bought: night.bought.length, day7 }
    : null;
  const hasDigest = digest !== null && digest.burned + digest.survived + digest.sold + digest.bought > 0;

  // 背景動画はオーナー判断で撤去(2026-07-13): パドックは情報系のみで構成。
  return (
    <div className={s.waitStage}>
      <div className={s.waitInner}>
        <div className={`${s.waitLabel} ${soon ? s.waitLabelSoon : ''}`}>{label}</div>
        <div className={`${s.waitClock} ${finalHour ? s.waitClockFinal : ''}`}>{`${pad(h)}:${pad(m)}:${pad(sec)}`}</div>
        <div className={s.waitNote}>20:00 (GMT+8) — One Race. One World. Every Day.</div>

        {/* ③ 調教リマインド(実データ: 次レースの調教が未記録の馬) */}
        {untrained.length > 0 && (
          <Link href="/horses" className={s.waitTrain}>
            ⚡ 調教がまだの馬が <b>{untrained.length}頭</b> います — 厩舎で調教する →
          </Link>
        )}

        {/* ① 今夜の出走(自分の馬・実NFTアート+DAY進行+価格ステップ)。
            馬ゼロの空状態はマーケットへの招待カード(2026-07-13)。 */}
        {myHorses.length > 0 ? (
          <>
            <div className={s.waitSec}>TONIGHT&apos;S ENTRIES · 今夜の出走({myHorses.length})</div>
            <TonightEntryCards myHorses={myHorses} />
          </>
        ) : (
          <>
            <div className={s.waitSec}>TONIGHT&apos;S ENTRIES · 今夜の出走</div>
            <Link href="/market" className={s.waitInvite}>
              <span className={s.waitInviteT}>出走馬がいません</span>
              <span className={s.waitInviteD}>
                マーケットプレイスで馬を迎えると、ここに出走カードが並びます。
                今夜20:00までの購入予約はマッチング後、明晩から出走します。
              </span>
              <span className={s.waitInviteA}>マーケットプレイスへ →</span>
            </Link>
          </>
        )}

        {/* ①.5 今夜の出走枠(全体・実データ) — BURN数は floor(頭数×率) で率の器は
            8.0〜13.5%固定(公開ルール)なので、枠は事前に「確定 or 狭い範囲」で
            掲示できる。少頭数ほど枠が小さい=生き残りやすい夜(Decision 093)。 */}
        {field && field.entrants > 0 && (
          <>
            <div className={s.waitSec}>TONIGHT&apos;S FIELD · 今夜の出走枠</div>
            <div className={s.waitField}>
              <span className={s.waitFieldStat}>
                <span className={s.waitFieldK}>出走予定</span>
                <span className={s.waitFieldV}>
                  {field.entrants}
                  <span className="unit">頭</span>
                </span>
              </span>
              <span className={`${s.waitFieldStat} ${s.waitFieldBurn}`}>
                <span className={s.waitFieldK}>BURN枠</span>
                <span className={s.waitFieldV}>
                  {field.burnSlotsMin === field.burnSlotsMax
                    ? field.burnSlotsMax
                    : `${field.burnSlotsMin}〜${field.burnSlotsMax}`}
                  <span className="unit">頭</span>
                </span>
              </span>
              {field.burnSlotsMax === 0 ? (
                <span className={`${s.waitFieldTag} ${s.waitFieldTagSafe}`}>全馬生還の夜</span>
              ) : field.burnSlotsMin === field.burnSlotsMax ? (
                <span className={`${s.waitFieldTag} ${s.waitFieldTagFixed}`}>確定</span>
              ) : null}
              <span className={s.waitFieldNote}>
                枠は公開ルールにより出走頭数から定まる上限です。対象馬は発走まで誰にも分かりません。
              </span>
            </div>
          </>
        )}

        {/* ② 今夜の条件(確定)/ 予報(的中率70%)の掲示板 */}
        {board && (
          <>
            <div className={s.waitSec}>
              {boardIsForecast ? 'TONIGHT FORECAST · 今夜の予報(的中率70%)' : 'TONIGHT · 今夜のレース条件'}
            </div>
            <div className={s.waitBoard}>
              <b style={{ color: CONDITION_COLORS[board.weather] }}>{board.weather_ja}</b>
              <span className={s.waitBoardSep}>×</span>
              <b style={{ color: CONDITION_COLORS[board.track] }}>{board.track_ja}</b>
              <span className={s.waitBoardSep}>×</span>
              <b style={{ color: CONDITION_COLORS[board.surface] }}>{board.surface_ja}</b>
              <Link href="/items" className={s.waitBoardLink}>条件に備える(アイテム)→</Link>
            </div>
          </>
        )}

        {/* ④ 昨夜のダイジェスト(自分の結果・実数のみ) */}
        {hasDigest && digest && (
          <>
            <div className={s.waitSec}>LAST NIGHT · 昨夜のあなたの結果</div>
            <div className={s.waitDigest}>
              {digest.day7 > 0 && <span className={`${s.waitChip} ${s.waitChipGold}`}>👑 CHAMPION {digest.day7}</span>}
              {digest.survived > 0 && <span className={`${s.waitChip} ${s.waitChipGood}`}>生還 {digest.survived}</span>}
              {digest.burned > 0 && <span className={`${s.waitChip} ${s.waitChipBad}`}>BURN {digest.burned}</span>}
              {digest.sold > 0 && <span className={s.waitChip}>売却 {digest.sold}</span>}
              {digest.bought > 0 && <span className={s.waitChip}>購入 {digest.bought}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------- COUNTDOWN(3分前・7セグ表示) */

/** dna未取得時のフォールバック(馬名から擬似dna)。 */
function dnaOf(h: MyDerbyHorse): string {
  return h.dnaHash
    ?? `0x${Array.from(h.name).map((ch) => ch.charCodeAt(0).toString(16)).join('').padEnd(64, 'a').slice(0, 64)}`;
}

/** 案1: 出走カード — 実NFTアート+DAY進行7点+今夜の価値(実価格テーブルのみ)。 */
function TonightEntryCards({ myHorses }: { myHorses: readonly MyDerbyHorse[] }) {
  return (
    <div className={s.tn1Grid}>
      {myHorses.slice(0, 8).map((h) => {
        const day = h.currentDay ?? 0;
        const now = PRICE_TABLE_V1[day] ?? '100.00';
        const next = day >= 6 ? '200.00' : PRICE_TABLE_V1[day + 1] ?? '—';
        return (
          <div key={h.name} className={s.tn1Card}>
            <NftHorseArt look={deriveNftLook(dnaOf(h), h.name)} className={s.tn1Art} />
            <div className={s.tn1Body}>
              <div className={s.tn1Name}>{h.name}</div>
              <div className={s.tn1Dots}>
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <span key={i} className={`${s.tn1Dot} ${i <= day ? s.tn1DotOn : ''} ${i === 7 ? s.tn1DotGoal : ''}`} />
                ))}
                <span className={s.tn1DayTag}>DAY{day}</span>
              </div>
              <div className={s.tn1Price}>
                {now} → <b className={day >= 6 ? s.tn1NextGold : ''}>{next}</b> USDT
              </div>
            </div>
          </div>
        );
      })}
      {myHorses.length > 8 && <div className={s.tn1More}>ほか {myHorses.length - 8} 頭が出走</div>}
    </div>
  );
}

/** 案2: パドック風の出走表 — 枠番+実NFTアートの横並び。 */
function TonightPaddock({ myHorses }: { myHorses: readonly MyDerbyHorse[] }) {
  return (
    <div className={s.tn2Row}>
      {myHorses.slice(0, 12).map((h, i) => (
        <div key={h.name} className={s.tn2Slot}>
          <div className={s.tn2Waku}>{i + 1}</div>
          <div className={s.tn2ArtWrap}>
            <NftHorseArt look={deriveNftLook(dnaOf(h), h.name)} className={s.tn2Art} />
          </div>
          <div className={s.tn2Name}>{h.name}</div>
          <div className={s.tn2Day}>DAY{h.currentDay ?? 0}</div>
        </div>
      ))}
      {myHorses.length > 12 && <div className={s.tn2More}>+{myHorses.length - 12}頭</div>}
    </div>
  );
}

function PreShowCountdown({
  secondsToStart,
  myHorses,
  variant = 0,
}: {
  secondsToStart: number;
  myHorses: readonly MyDerbyHorse[];
  variant?: 0 | 1 | 2;
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
          <div className={s.tonightK}>本日のレースに参加するあなたの馬</div>
          {variant === 1 ? (
            <TonightEntryCards myHorses={myHorses} />
          ) : variant === 2 ? (
            <TonightPaddock myHorses={myHorses} />
          ) : (
            <div className={s.tonightChips}>
              {myHorses.slice(0, 4).map((h) => (
                <span key={h.name} className={s.tonightChip}>
                  {h.name}
                  {h.currentDay !== undefined && <b> DAY{h.currentDay}</b>}
                </span>
              ))}
              {myHorses.length > 4 && (
                <span className={s.tonightChip}>
                  ほか<b>{myHorses.length - 4}頭</b>が出走
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- LIVE */

function LiveShow({
  elapsed,
  counts,
  runners,
  rollSlot,
  debutCount,
  conditions,
  myLane,
  quiet,
  replay = false,
}: {
  elapsed: number;
  counts: DerbyCounts;
  runners: readonly MyDerbyHorse[];
  rollSlot: number;
  debutCount: number;
  conditions: DerbyConditionsView | null;
  myLane: readonly VerdictInfo[];
  quiet: boolean;
  replay?: boolean;
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
    return (
      <LogPhase
        elapsed={elapsed}
        counts={counts}
        runners={runners}
        rollSlot={rollSlot}
        debutCount={debutCount}
        myLane={myLane}
        quiet={quiet}
      />
    );
  }
  /* オーナー指示(2026-07-10): ドット走行canvasは廃止し、一番最初のバージョン
     (タイトル+起動ターミナル)へ戻す。天候テキストは現行の色分き1行のまま。 */
  return (
    <div>
      <div className={s.liveTitle}>
        <div className={s.liveRule} />
        <div className={s.liveTitleText}>THE DAILY DERBY</div>
        <div className={s.liveBadge}>
          <span className={s.liveDot} />
          {replay ? 'REPLAY' : 'LIVE'}
        </div>
        <div className={s.liveRule} />
      </div>
      {elapsed >= TITLE_UNTIL && (
        <Terminal steps={[...OPENING_STEPS, RACE_STEP]} elapsed={elapsed} counts={counts} />
      )}
      {conditions && elapsed >= TITLE_UNTIL + 0.5 && elapsed < TITLE_UNTIL + 3.5 && (
        <div className={s.condFlash}>
          <span className={s.condK}>天候</span>
          <b style={{ color: CONDITION_COLORS[conditions.weather] }}>{conditions.weather_ja}</b>
          <span className={s.condK}>/ 馬場</span>
          <b style={{ color: CONDITION_COLORS[conditions.track] }}>{conditions.track_ja}</b>
          <span className={s.condK}>/ コース</span>
          <b style={{ color: CONDITION_COLORS[conditions.surface] }}>{conditions.surface_ja}</b>
        </div>
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

/* ショーの時計(propは1秒/100ms刻み)をrAFで60fpsに補間する共通フック。
   prop更新が1.6秒止まったら凍結(QA一時停止)。正典のなめらかな動きの土台。 */
function useShowClock(propElapsed: number): number {
  const propRef = useRef({ e: propElapsed, at: 0 });
  propRef.current = {
    e: propElapsed,
    at: typeof performance !== 'undefined' ? performance.now() : 0,
  };
  const [elapsed, setElapsed] = useState(propElapsed);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const stale = now - propRef.current.at > 1600;
      setElapsed(propRef.current.e + (stale ? 0 : (now - propRef.current.at) / 1000));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return elapsed;
}

/* ④動く数字: ターンごとの実バッチ値カウントアップ(表示専用の補間・60fps)。 */
function Counters({ elapsed: propElapsed, counts }: { elapsed: number; counts: DerbyCounts }) {
  const elapsed = useShowClock(propElapsed);
  const p2pAt = MARKET_OPEN.startAt;
  const rewardsAt = LOG_SECTIONS.find((sec) => sec.key === 'MLM')!.startAt;
  if (elapsed < p2pAt) {
    const p = easeOut((elapsed - LOGS_FROM) / (p2pAt - LOGS_FROM));
    return (
      <div className={s.counters}>
        <div className={`${s.counter} ${s.counterBurn}`}>
          <b>{Math.round(counts.burns * p).toLocaleString('en-US')}</b>
          <span>BURNED</span>
        </div>
        <div className={`${s.counter} ${s.counterGold}`}>
          <b>{Math.round((counts.horses - counts.burns) * p).toLocaleString('en-US')}</b>
          <span>SURVIVED</span>
        </div>
      </div>
    );
  }
  if (elapsed < rewardsAt) {
    const matched = matchingCount(elapsed, counts);
    return (
      <div className={s.counters}>
        <div className={`${s.counter} ${s.counterCyan}`}>
          <b>
            {matched.toLocaleString('en-US')} / {counts.assignments.toLocaleString('en-US')}
          </b>
          <span>MATCHED</span>
        </div>
        <div className={`${s.counter} ${s.counterGold}`}>
          <b>{Math.round(counts.mints * easeOut((elapsed - p2pAt) / (rewardsAt - p2pAt))).toLocaleString('en-US')}</b>
          <span>DAY0 MINTS</span>
        </div>
      </div>
    );
  }
  const p = easeOut((elapsed - rewardsAt) / (COMPLETE_AT - rewardsAt));
  return (
    <div className={s.counters}>
      <div className={`${s.counter} ${s.counterGold}`}>
        <b>{Math.round(counts.buffs * p).toLocaleString('en-US')}</b>
        <span>REVENGE BUFFS</span>
      </div>
    </div>
  );
}

/* 出走ゼロの夜(自分の馬が全頭「明晩デビュー」)の点呼代替カード。 */
function RollcallEmpty({ debutCount }: { debutCount: number }) {
  return (
    <div className={s.rollcall}>
      <div className={s.rollName}>今夜の出走はありません</div>
      <div className={s.rollSub}>
        {debutCount > 0
          ? `あなたの新しい馬 ${debutCount}頭は、明晩 20:00 (GMT+8) にデビューします`
          : '静かな夜 — 明晩のダービーをお待ちください'}
      </div>
    </div>
  );
}

/* ⑦点呼モード: 静かな夜は濁流の代わりに自分の馬を1頭ずつ大写し。
 * 対象は「今夜実際に走った馬」— 実イベント確定後はBURNされた馬も含む
 * (2026-07-16 #5: 従来はACTIVE馬のみでBURN馬が点呼から消え、かつ残り時間を
 * ループで埋めていた=2周する夜があった)。1周だけ回して最後の馬で保持し、
 * 各馬の審判(生存/BURN)はスロットに同期して重なる。 */
function Rollcall({
  elapsed,
  runners,
  slot,
}: {
  elapsed: number;
  runners: readonly MyDerbyHorse[];
  slot: number;
}) {
  const idx = Math.min(
    Math.max(0, Math.floor((elapsed - LOGS_FROM) / slot)),
    runners.length - 1,
  );
  const horse = runners[idx]!;
  const dna = horse.dnaHash
    ?? `0x${Array.from(horse.name).map((ch) => ch.charCodeAt(0).toString(16)).join('').padEnd(64, 'a').slice(0, 64)}`;
  return (
    <div className={s.rollcall}>
      <div className={s.rollArt}>
        <NftHorseArt look={deriveNftLook(dna, horse.name)} className={s.vHorseArt} />
      </div>
      <div className={s.rollName}>{horse.name}</div>
      <div className={s.rollSub}>
        点呼 {idx + 1} / {runners.length} — 静かな夜
      </div>
    </div>
  );
}

function LogPhase({
  elapsed: propElapsed,
  counts,
  runners,
  rollSlot,
  debutCount,
  myLane,
  quiet,
}: {
  elapsed: number;
  counts: DerbyCounts;
  runners: readonly MyDerbyHorse[];
  rollSlot: number;
  debutCount: number;
  myLane: readonly VerdictInfo[];
  quiet: boolean;
}) {
  // 正典のなめらかなログの流れ: ショー時計(1秒刻み)を60fpsに補間して描画する
  const elapsed = useShowClock(propElapsed);
  // 2026-07-14: 行数は当夜の実件数でキャップ(案①「件数だけ実数」の結線)。
  // 2026-07-16 #5: 濁流はフィクション(案①)なので実馬名との突合はしない —
  // 個人の実結果は myEvents のスケジュール発火(審判オーバーレイ+MY LANE)が担う。
  const lines = logWindow(elapsed, 44, undefined, counts);
  // ⑦静かな夜は結果ターン(TURN1)を点呼モードに切り替える。
  // 走った馬ゼロ(全馬明晩デビュー)の夜は点呼の代わりに空状態カードを出す。
  const rollcall = quiet && elapsed < MARKET_OPEN.startAt;
  return (
    <div className={s.logPhase}>
      <div className={s.logHead}>
        <span className={s.logBrand}>
          THE DAILY DERBY <span className={s.liveDot} />
        </span>
        <span className={s.logTurn}>{turnLabel(elapsed)}</span>
        <Counters elapsed={elapsed} counts={counts} />
      </div>

      <div className={s.floodGrid}>
        {rollcall ? (
          runners.length > 0 ? (
            <Rollcall elapsed={elapsed} runners={runners} slot={rollSlot} />
          ) : (
            <RollcallEmpty debutCount={debutCount} />
          )
        ) : (
          <div className={s.logStream} aria-live="off">
            {lines.map((line) => (
              <div
                key={line.id}
                className={`${s.lg} ${TONE_CLASS[line.tone]} ${line.mine ? `${s.lgMine} ${s.lgPop}` : ''}`}
              >
                {line.text}
                {line.mine ? '  ◀ YOU' : ''}
              </div>
            ))}
          </div>
        )}
        <div className={s.mylane}>
          <div className={s.mylaneK}>MY LANE — あなたの馬</div>
          <div className={s.mylaneList}>
            {myLane.length === 0 ? (
              <div className={s.mylaneEmpty}>あなたの馬の結果がここに順番に刻まれます。</div>
            ) : (
              <>
              {myLane.length > MY_LANE_VISIBLE && (
                <div className={s.mylaneMore}>ほか {myLane.length - MY_LANE_VISIBLE} 件(最後の全結果に全件)</div>
              )}
              {myLane.slice(-MY_LANE_VISIBLE).map((ev, i) => {
                const cls =
                  ev.kind === 'burn' ? s.myEvBurn
                  : ev.kind === 'day7' ? s.myEvDay7
                  : ev.kind === 'match' ? s.myEvMatch
                  : s.myEvSurvive;
                const day = ev.horse?.currentDay;
                const sub =
                  ev.kind === 'day7' ? 'DAY7 走破 — CHAMPION'
                  : ev.kind === 'burn' ? (day !== undefined ? `DAY${day} — BURN` : 'BURN')
                  : ev.kind === 'match' ? `${ev.matchSide === 'buy' ? '購入' : '売却'}マッチング成立`
                  : day !== undefined ? `DAY${day} → DAY${Math.min(7, day + 1)} 生存` : '生存';
                return (
                  <div key={`${ev.kind}:${ev.name}:${i}`} className={`${s.myEv} ${cls}`}>
                    <div className={s.myEvN}>{ev.name}</div>
                    <div className={s.myEvS}>{sub}</div>
                  </div>
                );
              })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- result / done / ticker */

/* ショーの最後 = その夜の自分の全結果(オーナー指示 2026-07-11:
   審判で1頭ずつ流れた結果を、代表1件ではなく全件のサマリーで締める。
   同じデータが /races「あなたのレース記録」に残り続ける)。 */
/* ADR-012 ショー最終幕: 明日の予報(的中率70%の参考情報)。
   毎晩レースを見る理由と「明日の予報なんだった?」の会話を作る(オーナー §7-4)。
   2026-07-14: 明日の出走枠(Decision 093)も併記 — ショー後のtonight_fieldは
   意味的に「明日の出走」(ACTIVE馬は次のレースを走る)なのでそのまま使える。 */
function TomorrowForecast({
  forecast,
  field,
}: {
  forecast: DerbyConditionsView;
  field: { entrants: number; burnSlotsMin: number; burnSlotsMax: number } | null;
}) {
  return (
    <div className={s.fcWrap}>
      <div className={s.fcK}>— 明日の予報 —</div>
      <div className={s.fcRow}>
        <span className={s.condK}>天候</span>
        <b style={{ color: CONDITION_COLORS[forecast.weather] }}>{forecast.weather_ja}</b>
        <span className={s.condK}>/ 馬場</span>
        <b style={{ color: CONDITION_COLORS[forecast.track] }}>{forecast.track_ja}</b>
        <span className={s.condK}>/ コース</span>
        <b style={{ color: CONDITION_COLORS[forecast.surface] }}>{forecast.surface_ja}</b>
      </div>
      {field && field.entrants > 0 && (
        <div className={s.fcRow}>
          <span className={s.condK}>出走予定</span>
          <b>{field.entrants}頭</b>
          <span className={s.condK}>/ BURN枠</span>
          <b>
            {field.burnSlotsMin === field.burnSlotsMax
              ? field.burnSlotsMax
              : `${field.burnSlotsMin}〜${field.burnSlotsMax}`}
            頭
          </b>
          {field.burnSlotsMax === 0 ? <b className={s.fcSafe}>— 全馬生還の夜</b> : null}
        </div>
      )}
      <div className={s.fcNote}>予報は参考情報です(的中率70%の演出)。結果を保証するものではありません。</div>
    </div>
  );
}

function PersonalOrDone({
  night,
  forecast,
  field,
}: {
  night: DerbyNightResults | null;
  forecast: DerbyConditionsView | null;
  field: { entrants: number; burnSlotsMin: number; burnSlotsMax: number } | null;
}) {
  if (night && nightResultsCount(night) > 0) {
    return (
      <div className={`${s.nightSum} ${s.nightSumIn}`}>
        <div className={s.nightSumHead}>
          <div className={s.liveRule} />
          <div className={s.nightSumK}>YOUR RESULTS — 本日のあなたの全結果</div>
          <div className={s.liveRule} />
        </div>
        <NightResultsList results={night} />
        <div className={s.nightSumNote}>この結果はレースページの「あなたのレース記録」でいつでも見返せます。</div>
        {forecast && <TomorrowForecast forecast={forecast} field={field} />}
      </div>
    );
  }
  return (
    <div>
      <div className={s.doneBanner}>
        <div className={s.liveRule} />
        <div className={s.doneText}>TODAY RACE END</div>
        <div className={s.liveRule} />
      </div>
      {forecast && <TomorrowForecast forecast={forecast} field={field} />}
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
