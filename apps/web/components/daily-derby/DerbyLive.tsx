'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import {
  EMPTY_COUNTS,
  PRE_SHOW_SECONDS,
  SHOW_TOTAL,
  conditionsView,
  type DerbyCounts,
  type DerbyJackpotView,
  type DerbyNightResults,
} from '@/lib/daily-derby';
import type { BandRaceInput } from '@/lib/band-race';
import { DailyDerbyStage } from '@/components/daily-derby/DailyDerbyStage';
import { PageSkeleton } from '@/components/PageSkeleton';

/**
 * /races 本番モード(ADR-008, DAILY_DERBY_HANDOVER R2)。
 * サーバー時刻に同期した実時間カウントダウンで DailyDerbyStage を駆動する:
 * リロード不要で20:00に自動でライブへ、途中参加は経過秒に合流(完了済み演出は
 * 再生しない)、件数・ティッカー・個人結果・自分の馬名はAPIの実データ。
 * ログ濁流の行自体は決定論生成のまま(オーナー承認の案① — 全馬の実ログは重い)。
 *
 * ポーリング: ショー前後10分は5秒間隔、それ以外は60秒+タブ復帰時。
 */

interface DerbyStatus {
  server_time: string;
  next_derby_at: string;
  phase: 'WAITING' | 'LIVE' | 'COMPLETED' | 'FAILED_SAFE_MODE';
  live_started_at: string | null;
  conditions: { weather: string; track: string; surface: string; night_name: string | null } | null;
  counts: DerbyCounts | null;
  ticker: string[];
  personal: unknown;
  my_horse_names: string[];
  my_horses?: { name: string; dna_hash: string; current_day: number; trained_for_next_race?: boolean; total_value?: number | null }[];
  engine_v2?: boolean;
  slot?: 'MORNING' | 'NIGHT';
  /** 当夜の自分の実イベント(2026-07-16 #5 審判の実結線)。レースFINALIZED後に届く。 */
  my_events?: DerbyNightResults | null;
  tonight_forecast?: { weather: string; track: string; surface: string } | null;
  tomorrow_forecast?: { weather: string; track: string; surface: string } | null;
  tonight_field?: { entrants: number; burn_slots_min: number; burn_slots_max: number } | null;
  /** V2実装-7c: このバッチで解決したジャックポット(当選者マスク済)。 */
  jackpot?: DerbyJackpotView | null;
}

/** 施策G: 帯の確定順位表(GET /daily-derby/bands/:date)。 */
interface BandsResponse {
  race_id: string | null;
  bands: {
    day: number;
    total: number;
    burns: number;
    /** 上限超過の帯は順位表を出さない — 呼び出し側は従来の濁流へ退避する。 */
    truncated: boolean;
    entries: { horse_id: string; name: string; score: number; burned: boolean; total_value: number | null }[];
  }[];
  my_horse_ids: string[];
}

/* ---- 見逃しリプレイ(オーナー要望 2026-07-16) ------------------------------
   20:00のライブを見られなかったユーザーに、当夜のうち(MYT日付が変わるまで)
   1回だけショーを録画のように自動再生する。「1回」の判定は端末ローカル
   (localStorage・厳密なユーザー単位より気軽さ優先 — 消えても実害なし)。
   ライブ中に/racesを開いていた人は視聴済み扱いでリプレイしない。 */
const REPLAY_LEAD_SECONDS = 6; // 短いカウントダウンの溜め → 0通過でファンファーレ

function replayStorageKey(): string {
  // バッチ日付(MYT)。phase=COMPLETEDの間しか使わないので「今日」でよい。
  return `sdd_derby_replay:${new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)}`;
}
function replaySeen(): boolean {
  try {
    return window.localStorage.getItem(replayStorageKey()) === '1';
  } catch {
    return true; // storage不可(プライベートモード等)は「視聴済み」に倒す
  }
}
function markReplaySeen(): void {
  try {
    const key = replayStorageKey();
    // 1日1キー — 過去日のキーはここで掃除する
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('sdd_derby_replay:') && k !== key) window.localStorage.removeItem(k);
    }
    window.localStorage.setItem(key, '1');
  } catch {
    /* 記録できない環境では毎回ライブ判定に任せる */
  }
}

export function DerbyLive() {
  const [status, setStatus] = useState<DerbyStatus | null>(null);
  // ショー最後の全結果サマリー(バッチ完了後に1回取得。記録APIと同一データ)。
  const [nightResults, setNightResults] = useState<DerbyNightResults | null>(null);
  // サーバー時刻 − ローカル時刻(ms)。ローカル時計のズレを補正する。
  const offsetRef = useRef(0);
  const [, forceTick] = useState(0);
  // 見逃しリプレイ: 開始時刻(ms)。null=リプレイしていない。
  const [replayStart, setReplayStart] = useState<number | null>(null);
  /** 施策G: 当夜の帯の順位表(1回だけ取得・以後不変)。 */
  const [bandRace, setBandRace] = useState<BandRaceInput[] | null>(null);
  const replayChecked = useRef(false);
  const liveElapsedRef = useRef(-1);

  const poll = useCallback(async () => {
    const r = await apiFetch<DerbyStatus>('/api/v1/daily-derby/status');
    if (r.status !== 200) return;
    const body = r.body as DerbyStatus;
    offsetRef.current = new Date(body.server_time).getTime() - Date.now();
    setStatus(body);
  }, []);

  useEffect(() => {
    void poll();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [poll]);

  // 当夜/前夜の結果を取得: ショー完了後は「今夜」、日中の待機画面では
  // 「昨夜のダイジェスト」(待機パドック 2026-07-13)として同じAPIを1回だけ叩く。
  useEffect(() => {
    if ((status?.phase !== 'COMPLETED' && status?.phase !== 'WAITING') || nightResults) return;
    let cancelled = false;
    void apiFetch<DerbyNightResults>('/api/v1/daily-derby/my-results/latest').then((r) => {
      if (!cancelled && r.status === 200) setNightResults(r.body as DerbyNightResults);
    });
    return () => {
      cancelled = true;
    };
  }, [status?.phase, nightResults]);

  /* 施策G: 帯の順位表は「レース確定後は不変」なので1回だけ取る。
     5秒ポーリングに載せると帯の頭数×同時視聴者数がそのまま負荷になる。
     自分の馬の特定は horse_id で行う — 馬名一致は 2026-07-16 に廃止された
     方式で、同名馬や生成名との偶然一致で壊れる。 */
  useEffect(() => {
    if (bandRace !== null) return;
    if (status?.phase !== 'LIVE' && status?.phase !== 'COMPLETED') return;
    let cancelled = false;
    void apiFetch<BandsResponse>('/api/v1/daily-derby/bands/latest').then((r) => {
      if (cancelled || r.status !== 200) return;
      const body = r.body as BandsResponse;
      const mine = new Set(body.my_horse_ids);
      setBandRace(
        body.bands
          .filter((b) => !b.truncated && b.entries.length > 0)
          .map((b) => ({
            day: b.day,
            seed: `${body.race_id ?? ''}:${b.day}`,
            entries: b.entries.map((e) => ({
              name: e.name,
              score: e.score,
              burned: e.burned,
              mine: mine.has(e.horse_id),
              total_value: e.total_value,
            })),
          })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [status?.phase, bandRace]);

  // 見逃しリプレイ①: ライブ中に開いていた人は視聴済み扱い(後でリプレイしない)。
  useEffect(() => {
    if (!status) return;
    const el = liveElapsedRef.current;
    if ((status.phase === 'LIVE' || status.phase === 'COMPLETED') && el >= 0 && el < SHOW_TOTAL) {
      markReplaySeen();
    }
  }, [status]);

  // 見逃しリプレイ②: 初回status到着時に1回だけ判定 — ショーが終わった後に
  // 来た未視聴ユーザーへ自動再生を開始する。開始した時点で「1回」を消費。
  useEffect(() => {
    if (!status || replayChecked.current) return;
    replayChecked.current = true;
    if (status.phase !== 'COMPLETED') return; // 今夜のショーが未完/失敗/待機
    if (liveElapsedRef.current >= 0 && liveElapsedRef.current <= SHOW_TOTAL) return; // ライブがまだ流れている
    if (replaySeen()) return;
    markReplaySeen();
    setReplayStart(Date.now());
  }, [status]);

  // 見逃しリプレイ③: 再生し切ったら通常表示(全結果サマリー)へ戻す。
  useEffect(() => {
    if (replayStart === null) return;
    const id = setInterval(() => {
      if ((Date.now() - replayStart) / 1000 - REPLAY_LEAD_SECONDS > SHOW_TOTAL + 2) setReplayStart(null);
    }, 1000);
    return () => clearInterval(id);
  }, [replayStart]);

  // 表示は1秒刻み、ポーリングはショー窓の内外で間隔を変える。
  useEffect(() => {
    let lastPoll = Date.now();
    const id = setInterval(() => {
      forceTick((t) => t + 1);
      const now = Date.now() + offsetRef.current;
      const next = status ? new Date(status.next_derby_at).getTime() : now;
      const started = status?.live_started_at ? new Date(status.live_started_at).getTime() : null;
      const nearShow =
        Math.abs(next - now) < 10 * 60 * 1000 ||
        (started !== null && now - started < (SHOW_TOTAL + 120) * 1000);
      const interval = nearShow ? 5000 : 60000;
      if (Date.now() - lastPoll >= interval) {
        lastPoll = Date.now();
        void poll();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [status, poll]);

  if (!status) {
    // 初回status取得までの一瞬はブランドスケルトン(ページ遷移のloading.tsxと
    // 同じ意匠)で埋める — 素のテキストのチラつきを出さない(オーナー指摘 2026-07-13)。
    return <PageSkeleton rows={2} />;
  }

  // 開始までの残り秒: バッチが走り出していれば started_at 基準の経過(負値)、
  // まだなら次回20:00までの残り。
  const now = Date.now() + offsetRef.current;
  // V2(1日2レース)はレース間隔が12時間。V1由来の「1日=1レース」前提の計算を
  // すべてこのインターバルで置き換える。
  const intervalMs = status.engine_v2 === true ? 43_200_000 : 86_400_000;
  let secondsToStart: number;
  if (
    (status.phase === 'LIVE' || status.phase === 'COMPLETED' || status.phase === 'FAILED_SAFE_MODE') &&
    status.live_started_at
  ) {
    // バッチ行の作成はワーカーtickで20:00より数秒〜数十秒遅れる。通常の夜は
    // 20:00ちょうどをアンカーにして、カウントダウン→ショーの経過秒を連続させる
    // (グレース中に進んだオープニングが巻き戻らない)。大幅に遅れて始まった
    // バッチ(自己修復の再実行等)は実開始時刻をアンカーにする。
    const startedMs = new Date(status.live_started_at).getTime();
    const derbyTodayMs = new Date(status.next_derby_at).getTime() - intervalMs;
    const anchor = startedMs - derbyTodayMs < 120_000 && startedMs >= derbyTodayMs ? derbyTodayMs : startedMs;
    secondsToStart = -((now - anchor) / 1000);
  } else {
    secondsToStart = (new Date(status.next_derby_at).getTime() - now) / 1000;
    // 20:00を過ぎたのにバッチ行がまだ無い空白(ワーカー30秒tick+開始ラグ)では、
    // next_derby_at が翌日に切り替わるため素直に計算すると「23:59:xx」の
    // カウントダウンに戻ってしまう(2026-07-14 初ライブで実発生)。直前の20:00
    // からの経過が10分以内なら、経過秒でオープニング演出を続けて実開始を待つ。
    const sincePrevDerby = intervalMs / 1000 - secondsToStart;
    if (status.phase === 'WAITING' && sincePrevDerby >= 0 && sincePrevDerby < 600) {
      secondsToStart = -sincePrevDerby;
    }
  }
  // COMPLETEDで既にショー時間を過ぎている(後から開いた)場合は個人結果へ直行。
  // V2は次のレースが12時間後に控えるため、結果画面を占有し続けず(ショー後1時間で)
  // 次のレースへのカウントダウンに戻す — 「カウントダウンが出ない」実発生の修正。
  if (status.phase === 'COMPLETED' && -secondsToStart > SHOW_TOTAL + 3600) {
    if (status.engine_v2 === true) {
      const toNext = (new Date(status.next_derby_at).getTime() - now) / 1000;
      const sincePrev = intervalMs / 1000 - toNext;
      secondsToStart = sincePrev >= 0 && sincePrev < 600 ? -sincePrev : toNext;
    } else {
      secondsToStart = -(SHOW_TOTAL + 1);
    }
  }
  // スキンのスロット(2026-07-19 オーナー指摘): 「今の時間帯」ではなく
  // 「待っているレース」に従う。待機/カウントダウン中は next_derby_at の
  // スロット(00:00Z=朝白 / 12:00Z=夜黒)、上映・結果表示中はそのレースのスロット。
  // 上映・結果中は「取得時点のstatus.slot」ではなく現在時刻(サーバー補正済み)から
  // 導出する — 20:00切替の瞬間、直前に取得したstatusのslot(=MORNING)を参照して
  // 白が一瞬出る実障害の修正(2026-07-19夜)。
  const displaySlot: 'MORNING' | 'NIGHT' =
    secondsToStart > 0
      ? (new Date(status.next_derby_at).getUTCHours() === 0 ? 'MORNING' : 'NIGHT')
      : (new Date(now).getUTCHours() >= 12 ? 'NIGHT' : 'MORNING');

  // リプレイ判定用にライブの経過秒を記録(効果①②が読む)
  liveElapsedRef.current = -secondsToStart;

  // 見逃しリプレイ: ローカルのリプレイ時計でステージを駆動する(録画再生)。
  const replayMode = replayStart !== null;
  if (replayStart !== null) {
    secondsToStart = REPLAY_LEAD_SECONDS - (Date.now() - replayStart) / 1000;
  }

  const stage = (
    <DailyDerbyStage
      replay={replayMode}
      onReplaySkip={() => setReplayStart(null)}
      secondsToStart={secondsToStart}
      counts={status.counts ?? EMPTY_COUNTS}
      tickerEvents={status.ticker}
      nightResults={nightResults}
      failed={status.phase === 'FAILED_SAFE_MODE'}
      myEvents={status.my_events ?? null}
      bandRace={bandRace}
      myHorses={(status.my_horses ?? []).map((h) => ({
        name: h.name,
        dnaHash: h.dna_hash,
        currentDay: h.current_day,
        trainedForNextRace: h.trained_for_next_race,
        totalValue: h.total_value ?? null,
      }))}
      engineV2={status.engine_v2 === true}
      slot={displaySlot}
      conditions={status.conditions ? conditionsView(status.conditions) : null}
      tonightForecast={
        status.tonight_forecast ? conditionsView({ ...status.tonight_forecast, night_name: null }) : null
      }
      tonightField={
        status.tonight_field
          ? {
              entrants: status.tonight_field.entrants,
              burnSlotsMin: status.tonight_field.burn_slots_min,
              burnSlotsMax: status.tonight_field.burn_slots_max,
            }
          : null
      }
      tomorrowForecast={
        status.tomorrow_forecast ? conditionsView({ ...status.tomorrow_forecast, night_name: null }) : null
      }
      jackpot={status.jackpot ?? null}
    />
  );

  return stage;
}

/** ナビ用: 次のダービーまでの秒数(ローカル計算でよい範囲)。 */
export function secondsToNextDerbyLocal(): number {
  const now = new Date();
  const candidate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0);
  const next = candidate <= now.getTime() ? candidate + 24 * 3600 * 1000 : candidate;
  return (next - now.getTime()) / 1000;
}

export { PRE_SHOW_SECONDS };
