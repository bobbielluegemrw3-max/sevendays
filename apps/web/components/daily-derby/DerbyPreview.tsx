'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FIXTURE_RESULTS,
  FIXTURE_TICKER,
  PRE_SHOW_SECONDS,
  SHOW_TOTAL,
  fixtureConditions,
  fixtureMyHorses,
} from '@/lib/daily-derby';
import { DailyDerbyStage } from '@/components/daily-derby/DailyDerbyStage';

/**
 * /dev/derby-preview 用のシミュレーションドライバー。
 * 実時計の代わりにシミュレート時計(倍速可・ジャンプ可)で
 * 3分前 → 残り30秒 → 20:00 ファンファーレ → LIVE演出 → マケプレ →
 * 個人結果 → 完了/失敗 の全状態を再生する。本番では 404。
 */

const JUMPS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '通常待機', seconds: PRE_SHOW_SECONDS + 40 },
  { label: '3分前', seconds: PRE_SHOW_SECONDS },
  { label: '残り35秒', seconds: 35 },
  { label: '20:00 (LIVE)', seconds: 3 },
  { label: 'レース実走(足音)', seconds: -18 },
  { label: 'BURNログ', seconds: -30.5 },
  { label: '生存ログ', seconds: -40.5 },
  { label: '価値ログ', seconds: -50.5 },
  { label: 'DAY7ログ', seconds: -58.2 },
  { label: 'P2P開幕', seconds: -62.5 },
  { label: '出品ログ', seconds: -66.5 },
  { label: '入札ログ', seconds: -72.5 },
  { label: 'マッチング', seconds: -78.5 },
  { label: '新規発行', seconds: -85.5 },
  { label: 'MLM/アイテム', seconds: -90.5 },
  { label: 'RACE END', seconds: -97.5 },
  { label: '個人結果', seconds: -(SHOW_TOTAL + 1) },
];

const SCENARIOS: ReadonlyArray<{ key: keyof typeof FIXTURE_RESULTS; label: string }> = [
  { key: 'sold', label: '売却+新馬' },
  { key: 'survived', label: '生存のみ' },
  { key: 'burned', label: 'Burn+バフ' },
  { key: 'day7', label: 'Day7クリア' },
];


export function DerbyPreview() {
  const [secondsToStart, setSecondsToStart] = useState(PRE_SHOW_SECONDS + 12);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [scenario, setScenario] = useState<keyof typeof FIXTURE_RESULTS>('sold');
  const [failed, setFailed] = useState(false);
  const [debugVerdict, setDebugVerdict] = useState<'burn' | undefined>(undefined);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  speedRef.current = speed;
  pausedRef.current = paused;

  /* 視覚QA用: ?t=<残り秒(負=経過)>&paused=1&scenario=burned&failed=1 で
     任意の瞬間を直接開ける(スクリーンショット検証を決定論化するため)。 */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('t');
    if (t !== null && Number.isFinite(Number(t))) setSecondsToStart(Number(t));
    if (q.get('paused') === '1') setPaused(true);
    const sc = q.get('scenario');
    if (sc && sc in FIXTURE_RESULTS) setScenario(sc);
    if (q.get('failed') === '1') setFailed(true);
    // 視覚QA: ?verdict=burn でBURN審判を強制表示
    if (q.get('verdict') === 'burn') setDebugVerdict('burn');
  }, []);

  useEffect(() => {
    const TICK_MS = 100;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setSecondsToStart((prev) => {
        const next = prev - (TICK_MS / 1000) * speedRef.current;
        // 個人結果表示から10秒後に自動で翌日待機へ戻る(ループ視聴用)
        return next < -(SHOW_TOTAL + 10) ? PRE_SHOW_SECONDS + 12 : next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
        {JUMPS.map((jump) => (
          <button
            key={jump.label}
            type="button"
            className="secondary"
            style={{ padding: '0.35rem 0.7rem', fontSize: '0.68rem' }}
            onClick={() => {
              setFailed(false);
              setDebugVerdict(undefined);
              setSecondsToStart(jump.seconds);
            }}
          >
            {jump.label}
          </button>
        ))}
        <button
          type="button"
          className="secondary"
          style={{
            padding: '0.35rem 0.7rem',
            fontSize: '0.68rem',
            borderColor: debugVerdict === 'burn' ? 'var(--gold, #c9a86a)' : undefined,
          }}
          onClick={() => {
            if (debugVerdict === 'burn') {
              setDebugVerdict(undefined);
              return;
            }
            setFailed(false);
            setDebugVerdict('burn');
          }}
        >
          {debugVerdict === 'burn' ? '審判: BURN ✕' : '審判: BURN'}
        </button>
        <button
          type="button"
          className="secondary"
          style={{ padding: '0.35rem 0.7rem', fontSize: '0.68rem' }}
          onClick={() => {
            setFailed(true);
            setSecondsToStart(-10);
          }}
        >
          失敗モード
        </button>
        <span style={{ flexBasis: '100%' }} />
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
          倍速
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ padding: '0.25rem 0.5rem' }}>
            <option value={1}>×1</option>
            <option value={3}>×3</option>
            <option value={10}>×10</option>
          </select>
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
          個人結果
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            style={{ padding: '0.25rem 0.5rem' }}
          >
            {SCENARIOS.map((sc) => (
              <option key={sc.key} value={sc.key}>{sc.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          style={{ padding: '0.35rem 0.7rem', fontSize: '0.68rem' }}
          onClick={() => setPaused((v) => !v)}
        >
          {paused ? '▶ 再生' : '⏸ 一時停止'}
        </button>
        <span className="faint" style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
          T{secondsToStart >= 0 ? '-' : '+'}{Math.abs(secondsToStart).toFixed(1)}s
        </span>
      </div>

      <DailyDerbyStage
        secondsToStart={secondsToStart}
        tickerEvents={FIXTURE_TICKER}
        personal={FIXTURE_RESULTS[scenario] ?? null}
        failed={failed}
        myHorses={fixtureMyHorses()}
        debugVerdict={debugVerdict}
        conditions={fixtureConditions(new Date().toISOString().slice(0, 10))}
      />

      <p className="faint" style={{ fontSize: '0.78rem', marginTop: '0.8rem' }}>
        20:00 通過でファンファーレ、レース実走中は蹄音が鳴ります(ステージ右上でミュート可)。
        通し再生では自分のBURN審判は20:00通過の約31秒後(BURNログ濁流中)に自動発火します。
        「審判: BURN」ボタンでいつでも単体表示できます(もう一度押すと閉じる)。
      </p>
    </div>
  );
}
