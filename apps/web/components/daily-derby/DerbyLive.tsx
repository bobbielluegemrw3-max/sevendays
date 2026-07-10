'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import {
  FIXTURE_COUNTS,
  PRE_SHOW_SECONDS,
  SHOW_TOTAL,
  conditionsView,
  type DerbyCounts,
  type DerbyNightResults,
} from '@/lib/daily-derby';
import { DailyDerbyStage } from '@/components/daily-derby/DailyDerbyStage';

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
  my_horses?: { name: string; dna_hash: string; current_day: number }[];
  tomorrow_forecast?: { weather: string; track: string; surface: string } | null;
}

export function DerbyLive() {
  const [status, setStatus] = useState<DerbyStatus | null>(null);
  // ショー最後の全結果サマリー(バッチ完了後に1回取得。記録APIと同一データ)。
  const [nightResults, setNightResults] = useState<DerbyNightResults | null>(null);
  // サーバー時刻 − ローカル時刻(ms)。ローカル時計のズレを補正する。
  const offsetRef = useRef(0);
  const [, forceTick] = useState(0);

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

  // バッチ完了後に当夜の全結果を取得(最新の確定日 = 今夜)。
  useEffect(() => {
    if (status?.phase !== 'COMPLETED' || nightResults) return;
    let cancelled = false;
    void apiFetch<DerbyNightResults>('/api/v1/daily-derby/my-results/latest').then((r) => {
      if (!cancelled && r.status === 200) setNightResults(r.body as DerbyNightResults);
    });
    return () => {
      cancelled = true;
    };
  }, [status?.phase, nightResults]);

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
    return (
      <div className="panel">
        <p className="faint">THE DAILY DERBY に接続中…</p>
      </div>
    );
  }

  // 開始までの残り秒: バッチが走り出していれば started_at 基準の経過(負値)、
  // まだなら次回20:00までの残り。
  const now = Date.now() + offsetRef.current;
  let secondsToStart: number;
  if (
    (status.phase === 'LIVE' || status.phase === 'COMPLETED' || status.phase === 'FAILED_SAFE_MODE') &&
    status.live_started_at
  ) {
    secondsToStart = -((now - new Date(status.live_started_at).getTime()) / 1000);
  } else {
    secondsToStart = (new Date(status.next_derby_at).getTime() - now) / 1000;
  }
  // COMPLETEDで既にショー時間を過ぎている(後から開いた)場合は個人結果へ直行。
  if (status.phase === 'COMPLETED' && -secondsToStart > SHOW_TOTAL + 3600) {
    secondsToStart = -(SHOW_TOTAL + 1);
  }

  return (
    <DailyDerbyStage
      secondsToStart={secondsToStart}
      counts={status.counts ?? FIXTURE_COUNTS}
      tickerEvents={status.ticker}
      nightResults={nightResults}
      failed={status.phase === 'FAILED_SAFE_MODE'}
      myHorseNames={status.my_horse_names}
      myHorses={(status.my_horses ?? []).map((h) => ({
        name: h.name,
        dnaHash: h.dna_hash,
        currentDay: h.current_day,
      }))}
      conditions={status.conditions ? conditionsView(status.conditions) : null}
      tomorrowForecast={
        status.tomorrow_forecast ? conditionsView({ ...status.tomorrow_forecast, night_name: null }) : null
      }
    />
  );
}

/** ナビ用: 次のダービーまでの秒数(ローカル計算でよい範囲)。 */
export function secondsToNextDerbyLocal(): number {
  const now = new Date();
  const candidate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0);
  const next = candidate <= now.getTime() ? candidate + 24 * 3600 * 1000 : candidate;
  return (next - now.getTime()) / 1000;
}

export { PRE_SHOW_SECONDS };
