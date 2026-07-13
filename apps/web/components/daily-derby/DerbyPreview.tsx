'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FIXTURE_COUNTS,
  FIXTURE_TICKER,
  PRE_SHOW_SECONDS,
  SHOW_TOTAL,
  fixtureConditions,
  fixtureForecast,
  fixtureMyHorses,
  fixtureNightResults,
} from '@/lib/daily-derby';
import { DailyDerbyStage } from '@/components/daily-derby/DailyDerbyStage';

/**
 * /dev/derby-preview 用のシミュレーションドライバー。
 * 実時計の代わりにシミュレート時計(倍速可・ジャンプ可)で
 * 3分前 → 残り30秒 → 20:00 ファンファーレ → LIVE演出 → マケプレ →
 * 全結果サマリー → 完了/失敗 の全状態を再生する。本番では 404。
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
  { label: '全結果サマリー', seconds: -(SHOW_TOTAL + 1) },
];

export function DerbyPreview() {
  const [secondsToStart, setSecondsToStart] = useState(PRE_SHOW_SECONDS + 12);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [tonightVariant, setTonightVariant] = useState<0 | 1 | 2>(1);
  const [myHorsesOverride, setMyHorsesOverride] = useState<ReturnType<typeof fixtureMyHorses> | null>(null);
  const [debugVerdict, setDebugVerdict] = useState<
    'burn' | 'survive' | 'day7' | 'match_sell' | 'match_buy' | undefined
  >(undefined);
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
    if (q.get('failed') === '1') setFailed(true);
    if (q.get('quiet') === '1') setQuiet(true);
    const tn = q.get('tonight');
    if (tn === '0' || tn === '1' || tn === '2') setTonightVariant(Number(tn) as 0 | 1 | 2);
    // 視覚QA: ?herd=100 で大量所有(100頭等)の見え方を確認
    const herd = Number(q.get('herd'));
    if (Number.isFinite(herd) && herd > 4) {
      const base = fixtureMyHorses();
      setMyHorsesOverride(
        Array.from({ length: Math.min(herd, 200) }, (_, i) => ({
          name: `${base[i % 4]!.name} ${i + 1}`,
          dnaHash: base[i % 4]!.dnaHash!,
          currentDay: i % 7,
        })),
      );
    }
    // 視覚QA: ?verdict=burn|survive|day7|match_sell|match_buy で審判を強制表示
    const dv = q.get('verdict');
    if (dv === 'burn' || dv === 'survive' || dv === 'day7' || dv === 'match_sell' || dv === 'match_buy') {
      const idx = dv === 'survive' ? 1 : dv === 'day7' ? 2 : dv.startsWith('match') ? 3 : 0;
      setMyHorsesOverride(fixtureMyHorses().slice(idx, idx + 1));
      setDebugVerdict(dv);
    }
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
              setMyHorsesOverride(null);
              setSecondsToStart(jump.seconds);
            }}
          >
            {jump.label}
          </button>
        ))}
        {([
          { kind: 'survive', label: '審判: 生存', idx: 1 },
          { kind: 'burn', label: '審判: BURN', idx: 0 },
          { kind: 'day7', label: '審判: DAY7', idx: 2 },
          { kind: 'match_sell', label: '審判: P2P売却', idx: 3 },
          { kind: 'match_buy', label: '審判: P2P購入', idx: 3 },
        ] as const).map((vb) => (
          <button
            key={vb.kind}
            type="button"
            className="secondary"
            style={{
              padding: '0.35rem 0.7rem',
              fontSize: '0.68rem',
              borderColor: debugVerdict === vb.kind ? 'var(--gold, #c9a86a)' : undefined,
            }}
            onClick={() => {
              if (debugVerdict === vb.kind) {
                // 同じボタンをもう一度押すと閉じる
                setDebugVerdict(undefined);
                setMyHorsesOverride(null);
                return;
              }
              setFailed(false);
              setMyHorsesOverride(fixtureMyHorses().slice(vb.idx, vb.idx + 1));
              setDebugVerdict(vb.kind);
            }}
          >
            {debugVerdict === vb.kind ? `${vb.label} ✕` : vb.label}
          </button>
        ))}
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
        <button
          type="button"
          className="secondary"
          style={{
            padding: '0.35rem 0.7rem',
            fontSize: '0.68rem',
            borderColor: quiet ? 'var(--gold, #c9a86a)' : undefined,
          }}
          onClick={() => setQuiet((v) => !v)}
        >
          {quiet ? '静かな夜(点呼) ✕' : '静かな夜(点呼)'}
        </button>
        {([[0, '出走馬: 現行'], [1, '出走馬: 案1カード'], [2, '出走馬: 案2パドック']] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            className="secondary"
            style={{
              padding: '0.35rem 0.7rem',
              fontSize: '0.68rem',
              borderColor: tonightVariant === v ? 'var(--gold, #c9a86a)' : undefined,
            }}
            onClick={() => setTonightVariant(v)}
          >
            {label}
          </button>
        ))}
        <span style={{ flexBasis: '100%' }} />
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
          倍速
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ padding: '0.25rem 0.5rem' }}>
            <option value={1}>×1</option>
            <option value={3}>×3</option>
            <option value={10}>×10</option>
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
        counts={quiet ? { ...FIXTURE_COUNTS, horses: 180, burns: 19, listed: 168, assignments: 150, mints: 12 } : FIXTURE_COUNTS}
        tickerEvents={FIXTURE_TICKER}
        nightResults={fixtureNightResults()}
        failed={failed}
        myHorses={myHorsesOverride ?? fixtureMyHorses()}
        tonightVariant={tonightVariant}
        debugVerdict={debugVerdict}
        conditions={fixtureConditions(new Date().toISOString().slice(0, 10))}
        tomorrowForecast={fixtureForecast(new Date().toISOString().slice(0, 10))}
        tonightField={{ entrants: 14, burnSlotsMin: 1, burnSlotsMax: 1 }}
      />

      <p className="faint" style={{ fontSize: '0.78rem', marginTop: '0.8rem' }}>
        20:00 通過でファンファーレ、レース実走中は蹄音が鳴ります(ステージ右上でミュート可)。
        通し再生では自分の審判(実NFT馬の表示)は20:00通過の約31秒後(ログ濁流中)に自動発火します。
        「審判:」ボタンでいつでも単体表示できます(もう一度押すと閉じる)。
      </p>
    </div>
  );
}
