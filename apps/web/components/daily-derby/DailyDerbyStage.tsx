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
  type DerbyJackpotView,
  type DerbyNightResults,
  type PoolActView,
  type LogTone,
  type ShowStep,
} from '@/lib/daily-derby';
import type { DerbyConditionsView, MyDerbyHorse } from '@/lib/daily-derby';
import { p2pMatchTotal } from '@/lib/daily-derby';
import { SegmentClock } from '@/components/daily-derby/SegmentClock';
import { DerbyVerdict, type VerdictInfo } from '@/components/daily-derby/DerbyVerdict';
import { PRICE_TABLE_V1 } from '@sevendays/domain';
import { NightResultsList, nightResultsCount } from '@/components/daily-derby/NightResultsList';
import { NftHorseArt } from '@/components/NftHorseArt';
import { nextRaceInstant } from '@/lib/race-time';

/** V2: 次のレースのスロット表示名(00:00 UTC=朝8:00 MYT / 12:00 UTC=夜20:00 MYT)。 */
function nextSlotV2(): { ja: string; time: string } {
  return nextRaceInstant().getUTCHours() === 0
    ? { ja: 'モーニングレース', time: '朝8:00' }
    : { ja: 'ナイターレース', time: '夜20:00' };
}
import { BandRaceAct } from '@/components/daily-derby/BandRaceAct';
import { ReachFxLayer, type ReachFxState } from '@/components/daily-derby/ReachFxLayer';
import { SettlementAct } from '@/components/daily-derby/SettlementAct';
import { type HarvestRow, type SettlementInput } from '@/lib/settlement-act';
import {
  ACT_TOTAL as BAND_ACT_TOTAL,
  ACT_VERDICT_AT as BAND_ACT_VERDICT_AT,
  bandRaceFrame,
  buildBandRace,
  selectFeaturedBand,
  type BandRaceInput,
  type BandRaceModel,
} from '@/lib/band-race';
import { deriveNftLook } from '@/lib/nft-visual';
import { DailyDerbyFailureState } from '@/components/daily-derby/DailyDerbyFailureState';
import s from '../../app/daily-derby.module.css';

/** リーチ演出「期待tier」のキーライト色(モック TIERS 準拠・激アツ〜期待薄)。 */
const TIER_RGB_V: [number, number, number][] = [
  [255, 214, 140], // 0 激アツ
  [233, 181, 88], //  1 あつい
  [205, 212, 235], // 2 普通
  [120, 150, 186], // 3 期待低
  [64, 104, 150], //  4 期待薄
];
import { tvNumStyle } from '@/lib/tv-tier';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

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
  /** V2実装-7c: このバッチで解決したジャックポット(日曜夜のみ非null・当選者マスク済)。 */
  jackpot?: DerbyJackpotView | null;
  /**
   * FUN_V3 施策G: 当夜のLV帯ごとの確定結果(実データ)。
   *
   * 渡すと RACE TURN(30〜62秒)のログ濁流が「帯レース」に置き換わる。
   * BURN は帯内スコア下位N頭切り = 既に競走なので、演出は確定済みデータの
   * 開示順序だけで作る(中間順位のデータは存在しない・作ってはならない)。
   * null/未指定なら従来の濁流のまま — 段階移行できるようにしてある。
   */
  bandRace?: readonly BandRaceInput[] | null;
  /** V2シーズン(表示のLV化・パドックのティア表示用)。 */
  engineV2?: boolean;
  /** 見逃しリプレイ再生中(2026-07-16): REPLAYバー表示+タイトルのLIVEバッジをREPLAYに。 */
  replay?: boolean;
  /** リプレイの「スキップして結果へ」ボタン(replay時のみ使用)。 */
  onReplaySkip?: (() => void) | undefined;
  /** 視覚QA専用: マウント時に審判を強制表示(プレビューのみ使用)。 */
  debugVerdict?: 'burn' | 'survive' | 'day7' | 'match_sell' | 'match_buy' | undefined;
  /** 出走馬カードの案切替(検討用 2026-07-10): 0=現行チップ / 1=出走カード / 2=パドック。 */
  tonightVariant?: 0 | 1 | 2;
  /** 上映中レースのスロット。演出は朝夜共通ダーク(2026-07-20)— 呼び出し側互換のため受理のみ。 */
  slot?: 'MORNING' | 'NIGHT';
}

/* レース条件の値ごとの色(全部同色だと読み分けられない — オーナー指摘 2026-07-10)。 */
const CONDITION_COLORS: Record<string, string> = {
  SUNNY: '#ffd97a', CLOUDY: '#aab4c8', RAIN: '#6fc3ff', STORM: '#c78cff',
  FAST: '#00eaff', GOOD: '#35d07f', SOFT: '#e6b24a', HEAVY: '#ff5c5c',
  TURF: '#58d68d', DIRT: '#d8a05a',
};

/* ③チャプター(ターン境界の全画面章タイトル・1.4秒)。
   2026-07-21(施策G): CHAPTER 03(REWARDS)を廃止。MLM/ITEM のダミー濁流を
   削ったため章そのものが無くなった(自分の形見ドロップはBURN審判が、
   サポートボーナスは通知が担う)。 */
const CHAPTERS = [
  { at: LOGS_FROM, no: 'CHAPTER 01', name: 'RACE RESULTS', cls: 'chapCyan' },
  { at: MARKET_OPEN.startAt, no: 'CHAPTER 02', name: 'SETTLEMENT', cls: 'chapMag' },
] as const;
const CHAPTER_SECONDS = 1.4;

/* ⑦点呼モード: 出走がこの頭数未満の「静かな夜」は濁流を1頭ずつの点呼に切替。 */
const QUIET_NIGHT_HORSES = 500;

/* 審判の音は出来事ごとに分ける(2026-07-21)。
 *
 * それまで 生存 / DAY7チャンピオン / BURN後の形見ドロップ の3つが、
 * すべて own-good.mp3 の同一音だった(オーナー指摘)。感情が違う:
 *   生存   = 安堵    「今夜も生き延びた」
 *   DAY7   = 祝祭    7日完走はゲーム経済の頂点。通常生存と同じ音は安売り
 *   ドロップ = 慰め   馬を失った1.6秒後に鳴る。祝福の音を鳴らしてはいけない
 *
 * 専用音源は 2026-07-21 にオーナーから支給され、結線済み。
 * 差し替えるときはこの表の右辺と soundCatalog を見ればよい。
 * 音源の由来と発注仕様は public/sounds/README.md。
 *
 * ★R1: champion は「達成を祝う儀式的な音」であって「換金の音」ではない。
 *   金の当たり音に寄せると射幸性の訴求になる(施策Eと同じ線引き)。 */
const VERDICT_SOUND = {
  burn: 'ownBurn',
  survive: 'ownGood',
  day7: 'champion', // 7日完走の達成を祝う(換金の音ではない)
  drop: 'memorial', // BURNの1.6秒後。祝福ではなく慰め
} as const;

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
  jackpot = null,
  bandRace = null,
  engineV2 = false,
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
  /** 打ち切り判定から最新の審判を読むための参照。 */
  const verdictRef = useRef<VerdictInfo | null>(null);
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
        /* 2026-07-21 オーナー支給。ラウドネスを実測して階層を作ってある:
           審判(own-burn -6.2 / own-good -9.3 / champion -9.8) が前景、
           memorial -13.5 が一段下、SETTLEMENT の方向音 -19 が最も下。
           静かな決算の下で鳴るので、方向が分かる以上には主張させない。 */
        champion: { src: '/sounds/champion.mp3' },
        memorial: { src: '/sounds/memorial.mp3' },
        settleOut: { src: '/sounds/settle-out.mp3' },
        settleIn: { src: '/sounds/settle-in.mp3' },
        /* 決算幕のいななき(2026-07-21 オーナー要望)。2頭に1回だけ重ねる。
           音源は実走ブリッジの horse-whinny と同じだが、別の audio 要素にして
           音量を落としてある(原本 -13.2 LUFS は方向音 -19 より6dB大きく、
           そのまま鳴らすと静かな決算で浮く)。毎回鳴らすと馬房が騒がしくなる。 */
        whinnySoft: { src: '/sounds/horse-whinny.mp3', volume: 0.6 },
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
    verdictRef.current = next;
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
    playOneShot(VERDICT_SOUND[next.kind === 'day7' ? 'day7' : next.kind === 'burn' ? 'burn' : 'survive']);
    // 形見ドロップは BURN の1.6秒後。ここは祝福ではなく慰めの瞬間である
    if (next.kind === 'burn' && next.dropKey) setTimeout(() => playOneShot(VERDICT_SOUND.drop), 1600);
    const duration = next.kind === 'burn' ? (next.dropKey ? 5000 : 3600) : 3200;
    verdictTimer.current = setTimeout(showNextVerdict, duration);
  }, [playOneShot, hit]);

  /* SETTLEMENT幕が始まったら審判は打ち切る(2026-07-21)。
     審判1件の表示は3.2〜5.0秒あるため、保有頭数が多いとキューが後ろへ伸び、
     決算の幕が審判オーバーレイに覆われ続ける。窓に収まらなかった分は
     MY LANE と最後の全結果サマリーに必ず残るので、情報は落ちない。 */
  useEffect(() => {
    if (debugActive.current) return;
    if (elapsed < MARKET_OPEN.startAt) return;
    if (verdictQueue.current.length > 0) {
      const rest = verdictQueue.current;
      verdictQueue.current = [];
      setMyLane((prev) => [...prev, ...rest]);
      setVerdictQueued(0);
    }
    /* チャンピオンだけは切らない。BURN(ドロップあり=5.0秒)が前に居ると
       チャンピオンの表示開始が61秒までずれ込み、ここで切ると実測1.0秒しか
       映らなかった — その夜いちばんの祝祭を1秒で消していた。
       決算幕の冒頭(実カウントのカウントアップ)に少し被るのは許容する。 */
    if (verdictRef.current?.kind === 'day7') return;
    if (verdictShowing.current) {
      if (verdictTimer.current) clearTimeout(verdictTimer.current);
      verdictTimer.current = null;
      verdictShowing.current = false;
      setVerdict(null);
    }
  }, [elapsed >= MARKET_OPEN.startAt]);

  /* リプレイ/翌日待機へ戻ったらMY LANEと審判の既読をリセット(ループ視聴)。 */
  const scheduleJoined = useRef(false);
  const wasPreShow = useRef(secondsToStart > 0);
  useEffect(() => {
    const isPreShow = secondsToStart > 0;
    if (isPreShow && !wasPreShow.current) {
      setMyLane([]);
      settlementRowNo.current = 0;
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
  /** 施策G: この夜は帯レースを上映するか(審判の発火時刻がこれで変わる)。 */
  const hasBand = (bandRace?.length ?? 0) > 0;

  /* 施策G: 主役の帯を1つ選んでフル演出する(オーナー判断 2026-07-21)。
     101秒に全帯は入らないし、頭数比で機械的に割ると尺の大半が自分と無関係な
     帯に流れる — それは計画書が削ろうとしている「他人の話」を温存することになる。
     他の帯にいる自分の馬は従来どおり審判オーバーレイ + MY LANE が拾う。 */
  const bandModel = useMemo<BandRaceModel | null>(() => {
    if (!bandRace || bandRace.length === 0) return null;
    const featured = selectFeaturedBand(bandRace);
    return featured ? buildBandRace(featured) : null;
  }, [bandRace]);


  /* SETTLEMENT の方向音。出ていった/入ってきた の区別だけを鳴らす。
     ★収支のプラス/マイナスで音を変えない — それはパチンコの当たり音であり
     R1レッドライン(射幸性を訴求しない)に触れる。価値は数字が語る。 */
  const settlementRowNo = useRef(0);
  const onSettlementRow = useCallback(
    (row: HarvestRow) => {
      playOneShot(row.kind === 'out' ? 'settleOut' : 'settleIn');
      // 2頭に1回、いななきを重ねる(厩舎の気配。毎回だと騒がしい)
      settlementRowNo.current += 1;
      if (settlementRowNo.current % 2 === 0) setTimeout(() => playOneShot('whinnySoft'), 420);
    },
    [playOneShot],
  );

  /* 施策G(2026-07-21 オーナー判断・案B): チャンピオンは審判の列から出す。
   *
   * チャンピオンは「1頭ぶんの審判」ではなく *その夜の headline* である。
   * 他の馬の生死と同じ列に置く限り、順番をどう入れ替えても「もう1頭の結果」に
   * 見えてしまう。実際 55〜62秒の7秒に「喪失5.0秒 → 慰め → 祝祭3.2秒」が
   * 同居しており、感情の切り替えが効かなかった(オーナー指摘)。
   *
   * → 主役以外のチャンピオンは RACE END の直前へ動かす。決算幕15秒を挟むので
   *   喪失から十分に離れ、「1頭失った … しかし別の1頭は7日を走り切った」の弧になる。
   *   直後に finale が鳴るのも噛み合う(祝祭を受けて締めのファンファーレ)。
   *
   * ★主役自身がチャンピオンの夜は動かさない。7走目のギリギリ生存=チャンピオンは
   *   起こり得るが、そのときは帯レースが既に緊張を作り切っており、55秒側で
   *   「生存 = DAY7到達」として決済済みである。末尾にも出すと同じ馬の二重表示になる。 */
  const tailChampions = useMemo<readonly string[]>(() => {
    if (!myEvents) return [];
    const protagonist =
      bandModel && bandModel.myIndex !== null ? bandModel.entries[bandModel.myIndex]!.name : null;
    return myEvents.survived.filter((r) => r.day7 && r.name !== protagonist).map((r) => r.name);
  }, [myEvents, bandModel]);
  /** 末尾枠1件あたりの尺(審判の表示3.2秒 + 間 0.2秒)。 */
  const CHAMP_SLOT = 3.4;
  /* 尺が伸びるのは「伸ばす価値のある夜」だけ。チャンピオンは稀なので
     ほとんどの夜は 82秒のまま(末尾枠なし)。 */
  const completeAt = COMPLETE_AT + tailChampions.length * CHAMP_SLOT;
  const showTotal = SHOW_TOTAL + tailChampions.length * CHAMP_SLOT;

  /* 施策G 後半: SETTLEMENT 幕の入力。62秒以降のダミー濁流を置き換える。
     出ていった馬(売却)→入ってきた馬(購入/ミント)。数字はすべて実データ。 */
  const settlement = useMemo<SettlementInput>(() => {
    const rows: HarvestRow[] = [];
    for (const r of myEvents?.sold ?? []) {
      rows.push({
        kind: 'out', name: r.name, dnaHash: r.dna_hash, price: r.price, day: r.day,
        totalValue: r.total_value != null ? Number(r.total_value) : null,
        acquired: r.acquired_price ?? null,
        net: r.net_proceeds ?? null,
      });
    }
    for (const r of myEvents?.bought ?? []) {
      rows.push({
        kind: 'in', name: r.name, dnaHash: r.dna_hash, price: r.price, day: r.day,
        totalValue: r.total_value != null ? Number(r.total_value) : null,
        isMint: r.is_mint,
      });
    }
    return {
      pulse: {
        trades: p2pMatchTotal(counts),
        mints: counts.mints,
        listed: counts.listed,
      },
      rows,
      stableBefore: null,
    };
  }, [myEvents, counts]);
  const rollSlot = Math.min(9, Math.max(3.5, (MARKET_OPEN.startAt - LOGS_FROM) / Math.max(1, raceRunners.length)));

  const verdictSchedule = useMemo<
    ReadonlyArray<{ fireAt: number; info: VerdictInfo; overlay: boolean }>
  >(() => {
    if (!myEvents) return [];
    const out: { fireAt: number; info: VerdictInfo; overlay: boolean }[] = [];
    // exactOptionalPropertyTypes: undefinedの明示代入は不可 — 条件付きspreadで回避
    const horseOf = (name: string, dna: string, day: number | null): MyDerbyHorse => ({
      name,
      dnaHash: dna,
      ...(day !== null ? { currentDay: day } : {}),
    });
    const sec = (key: string) => LOG_SECTIONS.find((x) => x.key === key)!;
    /* 施策G: 帯レース中は審判オーバーレイを出さない。
     *
     * BURN の審判は既定で 31.5秒(BURNセクション開始+1.5)に発火する。ところが
     * 帯レースが生死を明かすのは 55秒(VERDICT幕)である。そのまま重ねると
     * 馬の画像が幕開け直後に答えを言ってしまい、順位が下がっていく25秒間が
     * まるごと無意味になる — 実際にプレビューで先に結果が見えていた。
     *
     * したがって帯がある夜は、レースターンの審判をまとめて VERDICT 幕へ寄せる。
     * 順位表が「0.56点差で生存」と出し、そのあとに馬が浮かび上がる順序になる。 */
    const bandVerdictAt = LOGS_FROM + BAND_ACT_VERDICT_AT;
    const protagonist =
      bandModel && bandModel.myIndex !== null ? bandModel.entries[bandModel.myIndex]!.name : null;
    // レースターン(生存/BURN/DAY7)。点呼の夜はスロット同期、濁流の夜はセクション同期。
    const raceTurnAt = (name: string, sectionKey: string, idxInSection: number): number => {
      // 帯レースの夜は下でまとめて通し番号を振り直す(セクション別 index だと
      // 生存1頭+BURN1頭がどちらも idx=0 になり同時刻に発火する)。
      if (hasBand) return bandVerdictAt;
      if (quiet) {
        const i = raceRunners.findIndex((h) => h.name === name);
        if (i >= 0) return LOGS_FROM + i * rollSlot + rollSlot * 0.55;
      }
      const s = sec(sectionKey);
      return s.startAt + 1.5 + idxInSection * 3.4;
    };
    myEvents.survived.filter((r) => !r.day7).forEach((r, i) => {
      out.push({
        overlay: true,
        fireAt: raceTurnAt(r.name, 'SURVIVE', i),
        info: {
          name: r.name, kind: 'survive', horse: horseOf(r.name, r.dna_hash, r.from_day),
          dropKey: null, usedItemKey: null,
        },
      });
    });
    myEvents.burned.forEach((r, i) => {
      out.push({
        overlay: true,
        fireAt: raceTurnAt(r.name, 'BURN', i),
        info: {
          name: r.name, kind: 'burn', horse: horseOf(r.name, r.dna_hash, r.day),
          dropKey: r.drop_item_key, usedItemKey: r.used_item_key,
        },
      });
    });
    myEvents.survived.filter((r) => r.day7).forEach((r, i) => {
      out.push({
        overlay: true,
        fireAt: raceTurnAt(r.name, 'DAY7', i),
        info: {
          name: r.name, kind: 'day7', horse: horseOf(r.name, r.dna_hash, r.from_day),
          dropKey: null, usedItemKey: null,
        },
      });
    });
    /* 施策G 後半(2026-07-21): 売買成立の審判は廃止。
       SETTLEMENT 幕が「出ていった馬 → 入ってきた馬」を実データで正面から
       見せるようになったため、同じ情報を2回出すことになる。加えて従来の
       発火時刻(MATCH 78秒 / MINT 85秒)は短縮後のショー終端 78秒より後で、
       そのままでは出番自体が無い。 */
    if (hasBand) {
      /* VERDICT幕(55秒)から、審判1件の表示時間(3.2〜5.0秒)ぶんずつ間隔を空けて
         通しで並べ直す。1.6秒などで詰めるとキューが後ろへ伸び、SETTLEMENT幕
         (62秒〜)が審判オーバーレイに覆われ続ける(複数保有時のみ発現)。
         窓(55→62秒)に収まらない分は MY LANE と最後の全結果サマリーへ回る。
         順番は BURN → DAY7 → 生存 — 打ち切られる末尾に回すのは、
         いちばん報せる価値の低いものにする。 */
      const kindRank = (k: VerdictInfo['kind']) => (k === 'burn' ? 0 : k === 'day7' ? 1 : 2);
      const rank = (sv: { info: VerdictInfo }) =>
        // 帯レースの主役は必ず先頭。25秒かけて順位が下がるのを見せた当の馬が
        // 「0.56点差で生存」の直後に出てこないと、緊張と結果の鎖が切れる
        // (主役が生存し別の馬がBURNした夜は、無関係な馬のBURNが先に出ていた)。
        (sv.info.name === protagonist ? -1 : kindRank(sv.info.kind));
      out.sort((a, b) => rank(a) - rank(b));

      /* ★全画面の審判オーバーレイは「主役」と「DAY7チャンピオン」だけ(B+)。
       *
       * 主役は構造上いつでも *その夜いちばん危なかった馬* である
       * (帯内は最下位スコア=ラインに最も近い馬、帯は自分が最も危なかった帯)。
       * したがって2頭目以降は定義上、主役より劇性が低い。にもかかわらず
       * 従来は「主役以外を kind 順で最上位の1頭」を同じ全画面の音量で出し、
       * 3頭目からは文字に落としていた — プレイヤーに説明できない基準であり、
       * 打ち切り自体が画像を「入り切らなかったリスト」に見せていた。
       *
       * DAY7 だけは例外。主役が「最も危なかった馬」なのに対し DAY7 は
       * 「成功し切った馬」で軸が違う。主役がギリギリ生存した夜に別の馬が
       * チャンピオンになったら、後者を文字に落とすのは誤り(200 USDT買戻し=
       * ゲーム経済の頂点であり、その夜の祝祭)。
       *
       * 基準はプレイヤーが説明できる:「全画面になるのは、25秒ハラハラした馬と、
       * チャンピオンだけ」。溢れた馬は MY LANE と全結果サマリーに必ず残る。 */
      /* 全画面に出すのは「主役」と「チャンピオン」だけ(B+)。ただしチャンピオンは
         審判窓ではなく RACE END 直前の専用枠へ動かす(案B)。
         結果として審判窓は主役ひとつの単一焦点になり、喪失の幕として綺麗に閉じる。 */
      let tail = 0;
      let shown = 0;
      for (const sv of out) {
        const isProtagonist = sv.info.name === protagonist;
        const isTailChampion = sv.info.kind === 'day7' && !isProtagonist;
        sv.overlay = isProtagonist || isTailChampion;
        sv.fireAt = isTailChampion
          ? COMPLETE_AT + tail++ * 3.4 // 決算幕のあと・finale の直前
          : sv.overlay
            ? bandVerdictAt + 1.0 + shown++ * 3.6
            : bandVerdictAt + 0.4; // 文字組は幕開けと同時に MY LANE へ記帳
      }
    }
    return out.sort((a, b) => a.fireAt - b.fireAt);
  }, [myEvents, quiet, raceRunners, rollSlot, hasBand, bandModel]);

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
    if (elapsed >= completeAt) return; // ショー後は全結果サマリーが担う
    for (const sv of verdictSchedule) {
      if (sv.fireAt <= elapsed && !seenVerdicts.current.has(keyOf(sv))) {
        seenVerdicts.current.add(keyOf(sv));
        // overlay=false は全画面に出さず MY LANE へ直接記帳する(B+ の cap)
        if (sv.overlay) enqueueVerdict(sv.info);
        else setMyLane((prev) => [...prev, sv.info]);
      }
    }
  }, [elapsed, verdictSchedule, enqueueVerdict, completeAt]);

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
      { at: completeAt, key: 'finale', fresh: 4 },
    ];
    for (const cue of cues) {
      if (prev < cue.at && elapsed >= cue.at && elapsed < cue.at + cue.fresh) {
        playOneShot(cue.key);
      }
    }
  }, [elapsed, failed, soundOn, playOneShot, completeAt]);

  /* ループ音の窓同期。
   *
   * 2026-07-21(施策G): 群衆(crowd)の窓を COMPLETE_AT(78) から 55 へ縮めた。
   * 旧構成では 30〜97秒がログ濁流の「賑わい」だったので群衆が正しかったが、
   * いま同じ時間帯にあるのは静かな順位表と、個人の決算である。
   *   - SETTLEMENT(62〜77) は私的な決算。そこに他人の話し声が乗るのは誤り
   *   - ライン接近(51〜55)で群衆が引くと、沈黙そのものが緊張になる。
   *     この幕の緊張は「まだ分からない」という性質で、沈黙と相性がよい
   * 蹄音も 25秒からフェードし、帯レースの静寂へ受け渡す。
   *
   * ★競り合いを煽る音は足さない。中間順位のデータは存在しないので、それは
   * 視覚で排除したフィクションを聴覚で再導入することになる。 */
  const BAND_LINE_CLOSING = LOGS_FROM + 21; // 51秒 = ライン接近
  const BAND_FATE_AT = LOGS_FROM + BAND_ACT_VERDICT_AT; // 55秒 = 生死確定
  useEffect(() => {
    const windows: ReadonlyArray<{
      key: string; from: number; to: number; fadeFrom: number; base: number;
    }> = [
      { key: 'hoofs', from: RACE_RUN.startAt, to: RACE_RUN.endAt, fadeFrom: 25, base: 1 },
      { key: 'crowd', from: LOGS_FROM, to: BAND_FATE_AT, fadeFrom: BAND_LINE_CLOSING, base: 0.45 },
    ];
    for (const w of windows) {
      const inWindow = !failed && soundOn && elapsed >= w.from && elapsed < w.to;
      const audio = inWindow ? getAudio(w.key) : (audioRefs.current.get(w.key) ?? null);
      if (!audio) continue;
      if (inWindow) {
        // fadeFrom → to にかけて音量を絞り切る(沈黙への受け渡し)
        const t = elapsed <= w.fadeFrom ? 0 : (elapsed - w.fadeFrom) / Math.max(0.001, w.to - w.fadeFrom);
        audio.volume = Math.max(0, w.base * (1 - Math.min(1, t)));
        if (audio.paused) void audio.play().catch(() => {});
      } else if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = w.base;
      }
    }
  }, [elapsed, failed, soundOn, getAudio, BAND_LINE_CLOSING, BAND_FATE_AT]);

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

  const showTicker = !failed && elapsed >= LOGS_FROM && elapsed < showTotal + 30;
  const chapter = !failed && elapsed < showTotal
    ? CHAPTERS.find((c) => elapsed >= c.at && elapsed < c.at + CHAPTER_SECONDS)
    : undefined;

  return (
    <>
      {/* リプレイバーはステージ枠の外(上)に置く — 枠内だと右上の SOUND ON
          (絶対配置)と衝突して崩れる(2026-07-16 本番で実発生)。 */}
      {replay && (
        <div className={s.replayBar}>
          <span className={s.replayTag}>
            <span className={s.replayDot} />
            REPLAY
          </span>
          <span className={s.replayText}>直近のダービー(録画)— 見逃し再生は1回だけ</span>
          {onReplaySkip && (
            <button type="button" className={s.replayBtn} onClick={onReplaySkip}>
              スキップして結果へ →
            </button>
          )}
        </div>
      )}
    {/* 朝/夜ともダーク基調(2026-07-20 オーナー指示で朝スキン撤去 — スロット表記のみ残す) */}
    <div className={`${s.stage} ${stageHit ? s.stageHit : ''}`}>
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
            engineV2={engineV2}
            conditions={conditions}
            forecast={tonightForecast}
            field={tonightField}
            night={nightResults}
          />
        ) : secondsToStart > 0 ? (
          <PreShowCountdown secondsToStart={secondsToStart} myHorses={myHorses} variant={tonightVariant} engineV2={engineV2} />
        ) : elapsed < showTotal ? (
          <LiveShow
            elapsed={elapsed}
            counts={counts}
            runners={raceRunners}
            rollSlot={rollSlot}
            debutCount={myHorses.length}
            conditions={conditions}
            myLane={myLane}
            quiet={quiet}
            bandModel={bandModel}
            settlement={settlement}
            onSettlementRow={onSettlementRow}
            completeAt={completeAt}
            replay={replay}
          />
        ) : (
          <PersonalOrDone
            night={nightResults}
            pool={myEvents?.pool ?? nightResults?.pool ?? null}
            jackpot={jackpot}
            forecast={tomorrowForecast}
            field={tonightField}
            engineV2={engineV2}
          />
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
    </>
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
  engineV2 = false,
  conditions,
  forecast,
  field,
  night,
}: {
  secondsToStart: number;
  myHorses: readonly MyDerbyHorse[];
  engineV2?: boolean;
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
        <div className={s.waitNote}>
          {engineV2
            ? '8:00 & 20:00 (GMT+8) — Two Races. One World. Every Day.'
            : '20:00 (GMT+8) — One Race. One World. Every Day.'}
        </div>

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
            <div className={s.waitSec}>NEXT RACE ENTRIES · 次のレースの出走({myHorses.length})</div>
            <TonightEntryCards myHorses={myHorses} engineV2={engineV2} />
          </>
        ) : (
          <>
            <div className={s.waitSec}>NEXT RACE ENTRIES · 次のレースの出走</div>
            <Link href="/market" className={s.waitInvite}>
              <span className={s.waitInviteT}>出走馬がいません</span>
              <span className={s.waitInviteD}>
                マーケットプレイスで馬を迎えると、ここに出走カードが並びます。
                プール予約は次のバッチ(朝8:00/夜20:00)でマッチングされ、その次のレースから出走します。
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
            <div className={s.waitSec}>NEXT RACE FIELD · 次のレースの出走枠</div>
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
              {engineV2
                ? boardIsForecast
                  ? `NEXT RACE FORECAST · 次の${nextSlotV2().ja}の予報(的中率70%)`
                  : `NEXT RACE · 次の${nextSlotV2().ja}の条件`
                : boardIsForecast
                  ? 'TONIGHT FORECAST · 今夜の予報(的中率70%)'
                  : 'TONIGHT · 今夜のレース条件'}
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
function TonightEntryCards({ myHorses, engineV2 = false }: { myHorses: readonly MyDerbyHorse[]; engineV2?: boolean }) {
  const lang = useLang();
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
              <div className={s.tn1NameRow}>
                <span className={s.tn1Name}>{horseDisplayName(h.name, lang)}</span>
                {h.totalValue !== null && h.totalValue !== undefined ? (
                  <b className={s.tn1Tv} style={tvNumStyle(h.totalValue)}>{Number(h.totalValue).toFixed(1)}</b>
                ) : null}
              </div>
              <div className={s.tn1Dots}>
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <span key={i} className={`${s.tn1Dot} ${i <= day ? s.tn1DotOn : ''} ${i === 7 ? s.tn1DotGoal : ''}`} />
                ))}
                <span className={s.tn1DayTag}>{engineV2 ? 'LV.' : 'DAY'}{day}</span>
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
function TonightPaddock({ myHorses, engineV2 = false }: { myHorses: readonly MyDerbyHorse[]; engineV2?: boolean }) {
  const lang = useLang();
  return (
    <div className={s.tn2Row}>
      {myHorses.slice(0, 12).map((h, i) => (
        <div key={h.name} className={s.tn2Slot}>
          <div className={s.tn2Waku}>{i + 1}</div>
          <div className={s.tn2ArtWrap}>
            <NftHorseArt look={deriveNftLook(dnaOf(h), h.name)} className={s.tn2Art} />
          </div>
          <div className={s.tn2Name}>{horseDisplayName(h.name, lang)}</div>
          <div className={s.tn2Day}>
            {engineV2 ? 'LV.' : 'DAY'}{h.currentDay ?? 0}
            {h.totalValue !== null && h.totalValue !== undefined ? (
              <b style={{ ...tvNumStyle(h.totalValue), marginLeft: 6 }}>{Number(h.totalValue).toFixed(1)}</b>
            ) : null}
          </div>
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
  engineV2 = false,
}: {
  secondsToStart: number;
  myHorses: readonly MyDerbyHorse[];
  variant?: 0 | 1 | 2;
  engineV2?: boolean;
}) {
  const lang = useLang();
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
      <div className={s.cdNote}>{engineV2 ? '8:00 / 20:00 (GMT+8)' : '20:00 (GMT+8)'}</div>
      {myHorses.length > 0 && (
        <div className={s.tonight}>
          <div className={s.tonightK}>本日のレースに参加するあなたの馬</div>
          {variant === 1 ? (
            <TonightEntryCards myHorses={myHorses} engineV2={engineV2} />
          ) : variant === 2 ? (
            <TonightPaddock myHorses={myHorses} engineV2={engineV2} />
          ) : (
            <div className={s.tonightChips}>
              {myHorses.slice(0, 4).map((h) => (
                <span key={h.name} className={s.tonightChip}>
                  {horseDisplayName(h.name, lang)}
                  {h.currentDay !== undefined && <b> {engineV2 ? 'LV.' : 'DAY'}{h.currentDay}</b>}
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
  bandModel,
  settlement,
  onSettlementRow,
  completeAt,
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
  bandModel: BandRaceModel | null;
  settlement: SettlementInput;
  onSettlementRow: (row: HarvestRow) => void;
  completeAt: number;
  replay?: boolean;
}) {
  if (elapsed >= completeAt) {
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
        bandModel={bandModel}
        settlement={settlement}
        onSettlementRow={onSettlementRow}
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
        const raw = step.countKey ? counts[step.countKey] : undefined;
        const n = typeof raw === 'number' ? raw : undefined;
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
            {matched.toLocaleString('en-US')} / {p2pMatchTotal(counts).toLocaleString('en-US')}
          </b>
          <span>P2P MATCHED</span>
        </div>
        <div className={`${s.counter} ${s.counterGold}`}>
          <b>{Math.round(counts.mints * easeOut((elapsed - p2pAt) / (rewardsAt - p2pAt))).toLocaleString('en-US')}</b>
          <span>LV.0 MINTS</span>
        </div>
      </div>
    );
  }
  const p = easeOut((elapsed - rewardsAt) / (COMPLETE_AT - rewardsAt));
  return (
    <div className={s.counters}>
      <div className={`${s.counter} ${s.counterGold}`}>
        <b>{Math.round(counts.buffs * p).toLocaleString('en-US')}</b>
        <span>MEMORIAL DROPS</span>
      </div>
    </div>
  );
}

/* 出走ゼロの夜(自分の馬が全頭「明晩デビュー」)の点呼代替カード。 */
function RollcallEmpty({ debutCount }: { debutCount: number }) {
  return (
    <div className={s.rollcall}>
      <div className={s.rollName}>このレースの出走はありません</div>
      <div className={s.rollSub}>
        {debutCount > 0
          ? `あなたの新しい馬 ${debutCount}頭は、次のレース(朝8:00/夜20:00 GMT+8)でデビューします`
          : '静かな回 — 次のダービーをお待ちください'}
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
  const lang = useLang();
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
      <div className={s.rollName}>{horseDisplayName(horse.name, lang)}</div>
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
  bandModel,
  settlement,
  onSettlementRow,
}: {
  elapsed: number;
  counts: DerbyCounts;
  runners: readonly MyDerbyHorse[];
  rollSlot: number;
  debutCount: number;
  myLane: readonly VerdictInfo[];
  quiet: boolean;
  bandModel: BandRaceModel | null;
  settlement: SettlementInput;
  onSettlementRow: (row: HarvestRow) => void;
}) {
  const lang = useLang();
  // リーチ演出FX(canvasオーバーレイ)への状態橋渡し。毎フレーム最新値を ref で読む(再描画しない)。
  const fxRef = useRef<ReachFxState>({ active: false, phase: '', danger: 0, fate: null });
  // フリーズ(寸止めの一撃): 近差の決着直前に短く画面を止める。尺内(VERDICT幕)に収める演出のみ。
  const [frozen, setFrozen] = useState(false);
  const frozeRef = useRef(false);
  // 正典のなめらかなログの流れ: ショー時計(1秒刻み)を60fpsに補間して描画する
  const elapsed = useShowClock(propElapsed);
  // 2026-07-14: 行数は当夜の実件数でキャップ(案①「件数だけ実数」の結線)。
  // 2026-07-16 #5: 濁流はフィクション(案①)なので実馬名との突合はしない —
  // 個人の実結果は myEvents のスケジュール発火(審判オーバーレイ+MY LANE)が担う。
  const lines = logWindow(elapsed, 44, undefined, counts);
  // ⑦静かな夜は結果ターン(TURN1)を点呼モードに切り替える。
  // 走った馬ゼロ(全馬明晩デビュー)の夜は点呼の代わりに空状態カードを出す。
  const rollcall = quiet && elapsed < MARKET_OPEN.startAt;
  /* 施策G: 実データの帯があるなら RACE TURN は濁流ではなく帯レース。
     act の尺(32秒)は LOGS_FROM(30) → MARKET_OPEN(62) にちょうど収まる。 */
  const bandElapsed = elapsed - LOGS_FROM;
  const bandRacing = bandModel !== null && bandElapsed < BAND_ACT_TOTAL;
  // リーチ演出FX の状態を帯フレームから算出(元の盤 BandRaceAct は不変・上に薄く重ねるだけ)。
  const bandFrame = bandRacing && bandModel ? bandRaceFrame(bandModel, bandElapsed) : null;
  const payoffReady = !!(bandFrame && bandFrame.phase === 'VERDICT' && bandFrame.showFate);
  // 期待tier(レース前総合値・実データ)→ 裏切りの深さ level。level>=2(期待と逆)でフリーズ。
  const tv = bandFrame?.myTotalValue ?? null;
  const tierIdx = tv == null ? 2 : tv >= 78 ? 0 : tv >= 66 ? 1 : tv >= 55 ? 2 : tv >= 45 ? 3 : 4;
  const surviveFate = bandFrame?.myFate === 'SAFE';
  // level: 0=期待どおり … 4=最大の裏切り(激アツBURN / 大逆転)。
  const betrayLevel = bandFrame?.myFate ? (surviveFate ? tierIdx : 4 - tierIdx) : 0;
  // freezeMs: §0-5準拠(通常0.5〜1.0s)。7秒暗黒(tier5)は32秒帯尺に収まらないので上限1.0s。
  const freezeMs = betrayLevel >= 4 ? 1000 : betrayLevel === 3 ? 720 : betrayLevel === 2 ? 520 : 0;
  // 決着の瞬間、期待と逆(裏切り)なら短くフリーズ→解けて破裂。尺内・順序の作り話はしない。
  useEffect(() => {
    if (payoffReady && freezeMs > 0 && !frozeRef.current) {
      frozeRef.current = true;
      setFrozen(true);
      const id = setTimeout(() => setFrozen(false), freezeMs);
      return () => clearTimeout(id);
    }
    if (!payoffReady) { frozeRef.current = false; if (frozen) setFrozen(false); }
    return undefined;
  }, [payoffReady, freezeMs, frozen]);
  fxRef.current = bandFrame
    ? {
        active: true,
        phase: frozen ? 'freeze' : payoffReady ? 'payoff' : bandFrame.phase.toLowerCase(),
        danger: bandFrame.myRank != null && bandFrame.lineRank ? Math.max(0, Math.min(1, bandFrame.myRank / bandFrame.lineRank)) : 0,
        fate: bandFrame.myFate,
        frozen,
        tierRgb: TIER_RGB_V[tierIdx]!,
      }
    : { active: false, phase: '', danger: 0, fate: null };
  // 盤フィルタ(元の盤は不変・ラップの filter だけ): フリーズ=無彩化 / 決着=暗転。
  const bandFilter = frozen ? 'grayscale(.85) contrast(1.12) brightness(.82)' : payoffReady ? 'brightness(.6) saturate(.82)' : 'none';
  const cineH = frozen || payoffReady ? '9%' : '0%';
  /* 施策G 後半: 62秒以降は SETTLEMENT 幕。
     LIST/BID/MATCH/MINT/MLM/ITEM のダミー行はここで完全に描画されなくなる
     (LOG_SECTIONS 自体はレガシー経路とテストのために残す)。 */
  const settling = elapsed >= MARKET_OPEN.startAt;
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
        {settling ? (
          <div className={s.logStreamBand}>
            <SettlementAct
              input={settlement}
              elapsed={elapsed - MARKET_OPEN.startAt}
              onRowRevealed={onSettlementRow}
            />
          </div>
        ) : bandRacing ? (
          <div className={s.logStreamBand} style={{ position: 'relative', overflow: 'hidden' }}>
            {/* 元の盤(BandRaceAct)は不変。ラップの filter でフリーズ=無彩/決着=暗転だけ重ねる。 */}
            <div style={{ filter: bandFilter, transition: 'filter .4s ease' }}>
              <BandRaceAct model={bandModel} elapsed={bandElapsed} />
            </div>
            <ReachFxLayer stateRef={fxRef} />
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: cineH, background: '#000', zIndex: 3, pointerEvents: 'none', transition: `height ${frozen ? '.12s' : '.5s'} cubic-bezier(.6,0,.2,1)` }} />
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: cineH, background: '#000', zIndex: 3, pointerEvents: 'none', transition: `height ${frozen ? '.12s' : '.5s'} cubic-bezier(.6,0,.2,1)` }} />
          </div>
        ) : rollcall ? (
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
                  ev.kind === 'day7' ? 'LV.7 走破 — CHAMPION'
                  : ev.kind === 'burn' ? (day !== undefined ? `LV.${day} — BURN` : 'BURN')
                  : ev.kind === 'match' ? (ev.isMint ? '新規ミント — 厩舎に加入' : `${ev.matchSide === 'buy' ? '購入' : '売却'}マッチング成立`)
                  : day !== undefined ? `LV.${day} → LV.${Math.min(7, day + 1)} 生存` : '生存';
                return (
                  <div key={`${ev.kind}:${ev.name}:${i}`} className={`${s.myEv} ${cls}`}>
                    <div className={s.myEvN}>{horseDisplayName(ev.name, lang)}</div>
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
  engineV2 = false,
}: {
  forecast: DerbyConditionsView;
  field: { entrants: number; burnSlotsMin: number; burnSlotsMax: number } | null;
  engineV2?: boolean;
}) {
  return (
    <div className={s.fcWrap}>
      <div className={s.fcK}>
        {engineV2 ? `— 次の${nextSlotV2().ja}(${nextSlotV2().time})の予報 —` : '— 明日の予報 —'}
      </div>
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

/* V2実装-7c(Decision 103): YOUR NEW STABLE幕 — プール購入の披露。
   -3b PurchaseView の物語文と同じ言い回しで、頭数の内訳はすぐ下の結果一覧が担う。 */
const fmtUsdt = (v: string | null): string => (v === null ? '—' : String(Number(v)));

function PoolStableAct({ pool }: { pool: PoolActView }) {
  if (pool.horses <= 0) return null;
  // 2026-07-21 オーナー指摘(本番初上映): 「259 USDT が1頭になりました」が、
  // 直前の決算幕(収支 +X USDT)の流れで **自分が259稼いだ** ように読めていた。
  // これは購入予約に預けた額 = 支出であって利益ではない。
  //   誤読の原因: (1)主語が金額で始まる (2)金色+グローの数字が報酬の語彙
  //   (3)「〜になりました」が変換ではなく獲得に聞こえる
  // 方向(預けた → 使った → 迎えた)を明示し、金額から報酬の装飾を外す。
  const refund =
    pool.amount !== null && pool.spent !== null
      ? Math.round((Number(pool.amount) - Number(pool.spent)) * 100) / 100
      : null;
  return (
    <div className={s.fcWrap}>
      <div className={s.fcK}>— YOUR NEW STABLE —</div>
      <div className={s.poolRow}>
        <span className={s.condK}>購入予約</span>
        <span className={s.poolAmt}>{fmtUsdt(pool.amount)} USDT</span>
        <span className={s.poolArrow}>→</span>
        <span className={s.condK}>迎えた馬</span>
        <b>{pool.horses}頭</b>
      </div>
      <div className={s.fcNote}>
        支払い {fmtUsdt(pool.spent)} USDT
        {refund !== null && refund > 0 ? ` ／ 返金 ${refund} USDT(自動)` : ''}
        {' '}— これは購入であって収益ではありません。新しい仲間は下の結果一覧に登場します。
      </div>
    </div>
  );
}

/* V2実装-7c(Decision 106/108): 週次ジャックポット幕(ショーの本当の最終幕)。
   支払い済み(PAID)の週だけ表示 — 中止/不成立の週は幕ごと出さない(108)。 */
function JackpotAct({ jackpot }: { jackpot: DerbyJackpotView }) {
  const lang = useLang();
  if (jackpot.status !== 'PAID' || jackpot.winners.length === 0) return null;
  return (
    <div className={s.fcWrap}>
      <div className={s.fcK}>— WEEKLY JACKPOT —</div>
      <div className={s.fcRow}>
        <span className={s.condK}>賞金</span>
        <b style={{ color: 'var(--gold-bright, #f2e4bf)' }}>{fmtUsdt(jackpot.prize_amount)} USDT</b>
        <span className={s.condK}>/ 応募</span>
        <b>{jackpot.total_tickets ?? 0}口</b>
      </div>
      {jackpot.winners.map((w, i) => (
        <div key={i} className={s.fcRow}>
          <span className={s.condK}>当選</span>
          <b>{horseDisplayName(w.name, lang)}</b>
          {w.amount ? (
            <>
              <span className={s.condK}>—</span>
              <b>{fmtUsdt(w.amount)} USDT</b>
            </>
          ) : null}
        </div>
      ))}
      <div className={s.fcNote}>
        抽選券=今週の調教確定数。抽選はレースと同じcommit-revealで検証できます。来週も毎レースの調教が応募になります。
      </div>
    </div>
  );
}

function PersonalOrDone({
  night,
  pool,
  jackpot,
  forecast,
  field,
  engineV2 = false,
}: {
  night: DerbyNightResults | null;
  pool: PoolActView | null;
  jackpot: DerbyJackpotView | null;
  forecast: DerbyConditionsView | null;
  field: { entrants: number; burnSlotsMin: number; burnSlotsMax: number } | null;
  engineV2?: boolean;
}) {
  if (night && nightResultsCount(night) > 0) {
    return (
      <div className={`${s.nightSum} ${s.nightSumIn}`}>
        <div className={s.nightSumHead}>
          <div className={s.liveRule} />
          <div className={s.nightSumK}>YOUR RESULTS — 本日のあなたの全結果</div>
          <div className={s.liveRule} />
        </div>
        {pool && <PoolStableAct pool={pool} />}
        <NightResultsList results={night} />
        <div className={s.nightSumNote}>この結果はレースページの「あなたのレース記録」でいつでも見返せます。</div>
        {forecast && <TomorrowForecast forecast={forecast} field={field} engineV2={engineV2} />}
        {jackpot && <JackpotAct jackpot={jackpot} />}
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
      {pool && <PoolStableAct pool={pool} />}
      {forecast && <TomorrowForecast forecast={forecast} field={field} engineV2={engineV2} />}
      {jackpot && <JackpotAct jackpot={jackpot} />}
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
