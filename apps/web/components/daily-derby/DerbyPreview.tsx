'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FIXTURE_COUNTS,
  FIXTURE_TICKER,
  PRE_SHOW_SECONDS,
  SHOW_TOTAL,
  fixtureConditions,
  fixtureForecast,
  fixtureJackpot,
  fixtureMyHorses,
  fixtureNightResults,
} from '@/lib/daily-derby';
import { fixtureBandRace } from '@/lib/band-race';
import { DailyDerbyStage } from '@/components/daily-derby/DailyDerbyStage';

/**
 * /dev/derby-preview 用のシミュレーションドライバー。
 * 実時計の代わりにシミュレート時計(倍速可・ジャンプ可)で
 * 3分前 → 残り30秒 → 20:00 ファンファーレ → LIVE演出 → マケプレ →
 * 全結果サマリー → 完了/失敗 の全状態を再生する。本番では 404。
 */

/** 通し再生の開始位置(ファンファーレの少し前)。ここから82秒で全幕が流れる。 */
const RUN_FROM = 6;

const JUMPS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '通常待機', seconds: PRE_SHOW_SECONDS + 40 },
  { label: '3分前', seconds: PRE_SHOW_SECONDS },
  { label: '残り35秒', seconds: 35 },
  { label: '20:00 (LIVE)', seconds: 3 },
  { label: 'レース実走(足音)', seconds: -18 },
  // 施策G: 30〜62秒=帯レース、62〜77秒=SETTLEMENT、78秒=RACE END
  { label: '帯レース 開幕', seconds: -30.5 },
  { label: '帯レース YOU', seconds: -34 },
  { label: '帯レース 開示', seconds: -44 },
  { label: '帯レース ライン', seconds: -53 },
  { label: '帯レース 生死', seconds: -56.5 },
  { label: 'SETTLEMENT', seconds: -62.5 },
  { label: 'YOUR LEDGER', seconds: -66.5 },
  { label: '決算 締め', seconds: -75.5 },
  // 案B: 主役以外のチャンピオンは RACE END の直前へ(この夜は1体=+3.4秒)
  { label: 'チャンピオン', seconds: -78.5 },
  { label: 'RACE END', seconds: -81.8 },
  { label: '全結果サマリー', seconds: -(SHOW_TOTAL + 1) },
];


/**
 * プレビューの帯レースを、審判オーバーレイに出る実際の馬と一致させる。
 *
 * 以前は fixtureBandRace の生成名をそのまま使っていたため、25秒かけて競った
 * 馬と、その直後に画像が出る馬が別物になっていた(2026-07-21 オーナー指摘)。
 * 本番では同じ夜の同じデータなので当然一致する — プレビューだけが嘘をついていた。
 *
 * 主役の帯(LV.4)のライン直下 = 最上位のBURN に、当夜BURNされる自分の馬を置く。
 */
function previewBands() {
  const night = fixtureNightResults();
  const burned = night.burned[0];
  const survived = night.survived.find((r) => !r.day7);
  const named = (
    input: ReturnType<typeof fixtureBandRace>,
    rank: number,
    name: string | undefined,
  ) =>
    name === undefined
      ? input
      : {
          ...input,
          entries: input.entries.map((e, i) => (i === rank - 1 ? { ...e, name } : e)),
        };
  return [
    named(fixtureBandRace({ day: 2, total: 62, burns: 7, mineRank: 41 }), 41, survived?.name),
    // 35位 = 最上位のBURN。帯レースが「点差で及ばず」を出した直後に、
    // まさにこの馬の画像が浮かび上がる。
    named(fixtureBandRace({ day: 4, total: 38, burns: 4, mineRank: 35 }), 35, burned?.name),
    fixtureBandRace({ day: 6, total: 12, burns: 1, mineRank: 3 }),
  ];
}

export function DerbyPreview() {
  const [secondsToStart, setSecondsToStart] = useState(PRE_SHOW_SECONDS + 12);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [quiet, setQuiet] = useState(false);
  /* 施策G: RACE TURN を帯レースにする(?band=0 で従来の濁流と見比べられる)。 */
  const [bandOn, setBandOn] = useState(true);
  const [replaySim, setReplaySim] = useState(false);
  // V2実装-7c: ?jp=0 でジャックポット幕を消せる(既定は表示 — 視覚QA用)
  const [jackpotSim, setJackpotSim] = useState(true);
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
    if (q.get('band') === '0') setBandOn(false);
    if (q.get('replay') === '1') setReplaySim(true);
    if (q.get('jp') === '0') setJackpotSim(false);
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
        /* 個人結果を見せたあと頭に戻す。戻り先は「3分前」ではなく
           ファンファーレ直前 — ×1の通し視聴で毎回3分待たされないため
           (2026-07-21 オーナー要望)。待機画面はジャンプボタンで見る。 */
        return next < -(SHOW_TOTAL + 14) ? RUN_FROM : next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
        {/* 通し視聴の入口。ファンファーレ直前から82秒で全幕(帯レース→決算→結果)。 */}
        <button
          type="button"
          className="primary"
          style={{ padding: '0.45rem 1rem', fontSize: '0.74rem' }}
          onClick={() => {
            setFailed(false);
            setDebugVerdict(undefined);
            setMyHorsesOverride(null);
            setSpeed(1);
            setPaused(false);
            setSecondsToStart(RUN_FROM);
          }}
        >
          ▶ 頭から通し再生（82秒）
        </button>
        <span style={{ flexBasis: '100%' }} />
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
        <button
          type="button"
          className="secondary"
          style={{
            padding: '0.35rem 0.7rem',
            fontSize: '0.68rem',
            borderColor: bandOn ? 'var(--gold, #c9a86a)' : undefined,
          }}
          onClick={() => setBandOn((v) => !v)}
        >
          {bandOn ? '帯レース(施策G) ✕' : '帯レース(施策G)'}
        </button>
        <button
          type="button"
          className="secondary"
          style={{
            padding: '0.35rem 0.7rem',
            fontSize: '0.68rem',
            borderColor: replaySim ? 'var(--gold, #c9a86a)' : undefined,
          }}
          onClick={() => setReplaySim((v) => !v)}
        >
          {replaySim ? 'リプレイ表示 ✕' : 'リプレイ表示'}
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
        counts={quiet ? { ...FIXTURE_COUNTS, horses: 180, burns: 19, listed: 168, assignments: 150, mints: 12, day7: 9, celebrations: 40 } : FIXTURE_COUNTS}
        tickerEvents={FIXTURE_TICKER}
        nightResults={fixtureNightResults()}
        failed={failed}
        myHorses={myHorsesOverride ?? fixtureMyHorses()}
        // 審判の実結線(2026-07-16 #5)の再現: 実イベント相当のフィクスチャ。
        // herd/単体審判のオーバーライド中は無効化(点呼・審判はmyHorsesから)。
        myEvents={myHorsesOverride ? null : fixtureNightResults()}
        replay={replaySim}
        onReplaySkip={() => setReplaySim(false)}
        tonightVariant={tonightVariant}
        debugVerdict={debugVerdict}
        conditions={fixtureConditions(new Date().toISOString().slice(0, 10))}
        tomorrowForecast={fixtureForecast(new Date().toISOString().slice(0, 10))}
        tonightField={{ entrants: 14, burnSlotsMin: 1, burnSlotsMax: 1 }}
        jackpot={jackpotSim ? fixtureJackpot() : null}
        /* 施策G: 3帯に馬がいる夜。主役は「ラインに最も近かった1頭」の帯 =
           LV.4(35位 = 最上位のBURN)が選ばれるはず。 */
        bandRace={bandOn ? previewBands() : null}
      />

      <p className="faint" style={{ fontSize: '0.78rem', marginTop: '0.8rem' }}>
        20:00 通過でファンファーレ、レース実走中は蹄音が鳴ります(ステージ右上でミュート可)。
        通し再生では自分の審判は実イベント(フィクスチャ)からスケジュール発火します —
        BURNは約32秒後・生存は約42秒後・DAY7は約60秒後・売買成立はP2Pターン中。
        「審判:」ボタンでいつでも単体表示できます(もう一度押すと閉じる)。
      </p>
    </div>
  );
}
