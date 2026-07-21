'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BandRaceAct } from '@/components/daily-derby/BandRaceAct';
import {
  ACT_INTRO,
  ACT_TOTAL,
  buildBandRace,
  fixtureBandRace,
} from '@/lib/band-race';

/**
 * /dev/band-race-preview — 帯レース(施策G)のシミュレーションドライバー。
 *
 * この幕の品質は「何秒で1頭ずつ開示するか」「カメラをどこに置くか」で決まり、
 * 静止画では設計できない(FUN_V3_PLAN.md §4)。したがってモックアップは作らず、
 * ここで動かしながら詰める。
 *
 * ?t=<秒>&paused=1&rank=<自分の確定順位>&total=<頭数>&burns=<BURN数>
 * で任意の瞬間を直接開ける(視覚QAの決定論化)。
 */

const JUMPS: ReadonlyArray<{ label: string; at: number }> = [
  { label: '帯の提示', at: 0 },
  { label: 'YOUR SCORE 固定', at: ACT_INTRO + 1 },
  { label: '開示 序盤', at: 8 },
  { label: '開示 中盤', at: 14 },
  { label: '開示 終盤', at: 19 },
  { label: 'ライン確定', at: 22.5 },
  { label: '生死', at: 26 },
];

/** 見え方が変わる代表ケース(ライン際が主役)。 */
const CASES: ReadonlyArray<{ label: string; rank: number | null; extra?: number[] }> = [
  { label: '首位', rank: 1 },
  { label: '中位', rank: 18 },
  { label: '★ぎりぎり生存', rank: 34 },
  { label: '★ぎりぎりBURN', rank: 35 },
  { label: '最下位', rank: 38 },
  // 同じ帯に複数所有: 主役は最もラインに近い1頭、他は金色の行として出る
  { label: '同じ帯に3頭', rank: 35, extra: [4, 20] },
  { label: '出走なし(観戦)', rank: null },
];

export function BandRacePreview() {
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [rank, setRank] = useState<number | null>(34);
  /** 同じ帯に持っている他の馬の確定順位(主役以外)。 */
  const [extra, setExtra] = useState<number[]>([]);
  const [total, setTotal] = useState(38);
  const [burns, setBurns] = useState(4);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  speedRef.current = speed;
  pausedRef.current = paused;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const qt = q.get('t');
    if (qt !== null && Number.isFinite(Number(qt))) setT(Number(qt));
    if (q.get('paused') === '1') setPaused(true);
    const qr = q.get('rank');
    if (qr === 'none') setRank(null);
    else if (qr !== null && Number.isFinite(Number(qr))) setRank(Number(qr));
    const qn = q.get('total');
    if (qn !== null && Number.isFinite(Number(qn))) setTotal(Number(qn));
    const qb = q.get('burns');
    if (qb !== null && Number.isFinite(Number(qb))) setBurns(Number(qb));
  }, []);

  useEffect(() => {
    const TICK = 100;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setT((prev) => (prev > ACT_TOTAL + 4 ? 0 : prev + (TICK / 1000) * speedRef.current));
    }, TICK);
    return () => clearInterval(id);
  }, []);

  const model = useMemo(() => {
    const input = fixtureBandRace({
      total,
      burns,
      ...(rank !== null ? { mineRank: rank } : {}),
    });
    if (rank === null) {
      return buildBandRace({ ...input, entries: input.entries.map((e) => ({ ...e, mine: false })) });
    }
    if (extra.length === 0) return buildBandRace(input);
    const marked = new Set(extra);
    return buildBandRace({
      ...input,
      entries: input.entries.map((e, i) => (marked.has(i + 1) ? { ...e, mine: true } : e)),
    });
  }, [rank, total, burns, extra]);

  const btn = { padding: '0.35rem 0.7rem', fontSize: '0.68rem' } as const;

  return (
    <div>
      <div className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
        {JUMPS.map((j) => (
          <button key={j.label} type="button" className="secondary" style={btn} onClick={() => setT(j.at)}>
            {j.label}
          </button>
        ))}
        <span style={{ flexBasis: '100%' }} />
        {CASES.map((c) => (
          <button
            key={c.label}
            type="button"
            className="secondary"
            style={{ ...btn, borderColor: rank === c.rank ? 'var(--gold, #c9a86a)' : undefined }}
            onClick={() => { setRank(c.rank); setExtra(c.extra ?? []); setT(0); }}
          >
            {c.label}
          </button>
        ))}
        <span style={{ flexBasis: '100%' }} />
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
          帯の頭数
          <select
            value={total}
            onChange={(e) => {
              const n = Number(e.target.value);
              setTotal(n);
              setBurns(Math.max(1, Math.round(n * 0.107)));
              setRank((r) => (r === null ? null : Math.min(r, n)));
              setT(0);
            }}
            style={{ padding: '0.25rem 0.5rem' }}
          >
            <option value={18}>18頭(テストネット実測)</option>
            <option value={38}>38頭(計画書の例)</option>
            <option value={98}>98頭</option>
            <option value={190}>190頭(本番想定の上限)</option>
          </select>
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
          倍速
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ padding: '0.25rem 0.5rem' }}>
            <option value={0.5}>×0.5</option>
            <option value={1}>×1</option>
            <option value={3}>×3</option>
          </select>
        </label>
        <button type="button" className="secondary" style={btn} onClick={() => setPaused((v) => !v)}>
          {paused ? '▶ 再生' : '⏸ 一時停止'}
        </button>
        <span className="faint" style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
          t=+{t.toFixed(1)}s / {ACT_TOTAL}s
        </span>
      </div>

      <div style={{ padding: '1rem 0' }}>
        <BandRaceAct model={model} elapsed={t} />
      </div>
    </div>
  );
}
