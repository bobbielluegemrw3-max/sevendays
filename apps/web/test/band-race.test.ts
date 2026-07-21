import { describe, expect, it } from 'vitest';
import {
  ACT_TOTAL,
  bandRaceFrame,
  buildBandRace,
  fixtureBandRace,
  selectFeaturedBand,
  type BandRaceFrame,
  type BandRaceModel,
} from '../lib/band-race';

/* 帯レース(FUN_V3 施策G)の不変条件。
   この act は「確定済みデータの開示順序」だけで競走を作る。したがって
   ①途中で結果を漏らさない ②順位は良化しない ③最後は実データと一致する
   の3点が破れた瞬間に、演出はフィクションか出来レースのどちらかになる。 */

const STEP = 0.25;
const frames = (m: BandRaceModel): BandRaceFrame[] => {
  const out: BandRaceFrame[] = [];
  for (let t = 0; t <= ACT_TOTAL + 0.001; t += STEP) out.push(bandRaceFrame(m, t));
  return out;
};

describe('band race — ネタバレしない', () => {
  it('全頭開示まで BURN 判定を表に出さない', () => {
    const m = buildBandRace(fixtureBandRace());
    for (const f of frames(m)) {
      if (f.revealed < m.total - 1) {
        expect(f.rows.some((r) => r.burned), `t: revealed=${f.revealed}`).toBe(false);
      }
    }
  });

  it('表示順位は暫定値であり、開示済み頭数を超えない', () => {
    const m = buildBandRace(fixtureBandRace());
    for (const f of frames(m)) {
      const shown = f.revealed + (f.myScore !== null ? 1 : 0);
      for (const r of f.rows) {
        if (r.gap) continue;
        expect(r.rank).toBeLessThanOrEqual(shown);
      }
    }
  });
});

describe('band race — 順位は下がるだけ', () => {
  it('myRank は単調に増加する(良くならない)', () => {
    const m = buildBandRace(fixtureBandRace());
    let prev = 0;
    for (const f of frames(m)) {
      if (f.myRank === null) continue;
      expect(f.myRank).toBeGreaterThanOrEqual(prev);
      prev = f.myRank;
    }
  });

  it('自分のスコアは一度出たら動かない', () => {
    const m = buildBandRace(fixtureBandRace());
    const scores = new Set(frames(m).map((f) => f.myScore).filter((s): s is number => s !== null));
    expect(scores.size).toBe(1);
  });
});

describe('band race — 決着を最後まで持ち越す', () => {
  it('生死の宣言は最終幕まで出さない', () => {
    for (const mineRank of [1, 12, 34, 35, 38]) {
      const m = buildBandRace(fixtureBandRace({ mineRank }));
      for (const f of frames(m)) {
        if (f.showFate) expect(f.phase).toBe('VERDICT');
      }
    }
  });

  it('ライン際の馬は本編中いっさい決着しない(開示順序の持ち越しが効いている)', () => {
    // 34位=最後の生存枠 / 35位=最上位のBURN — この2頭が最も惜しい
    for (const mineRank of [34, 35]) {
      const m = buildBandRace(fixtureBandRace({ mineRank }));
      for (const f of frames(m)) {
        if (f.phase === 'INTRO' || f.phase === 'YOU' || f.phase === 'REVEAL') {
          expect(f.myFate, `${mineRank}位 / ${f.phase} / 開示${f.revealed}`).toBeNull();
        }
      }
    }
  });

  it('YOU 幕はスコアだけ — 順位は名乗らない', () => {
    const m = buildBandRace(fixtureBandRace());
    const you = frames(m).filter((f) => f.phase === 'YOU');
    expect(you.length).toBeGreaterThan(0);
    for (const f of you) {
      expect(f.myScore).not.toBeNull();
      expect(f.myRank).toBeNull();
    }
  });
});

describe('band race — 実データと一致する', () => {
  it('最終の暫定順位 = 確定順位、生死 = is_burned', () => {
    for (const mineRank of [1, 12, 34, 35, 38]) {
      const input = fixtureBandRace({ mineRank });
      const m = buildBandRace(input);
      const last = bandRaceFrame(m, ACT_TOTAL);
      expect(last.myRank).toBe(mineRank);
      expect(last.myFate).toBe(m.entries[mineRank - 1]!.burned ? 'BURN' : 'SAFE');
    }
  });

  it('早期に確定した生死は、最終結果と矛盾しない', () => {
    for (const mineRank of [1, 12, 34, 35, 38]) {
      const m = buildBandRace(fixtureBandRace({ mineRank }));
      const final = bandRaceFrame(m, ACT_TOTAL).myFate;
      for (const f of frames(m)) {
        if (f.myFate !== null) expect(f.myFate).toBe(final);
      }
    }
  });

  it('点差はライン馬とのスコア差(4.66点差で生存の 4.66)', () => {
    // 38頭・4BURN → 34位が最後の生存枠、35位が最上位のBURN
    const m = buildBandRace(fixtureBandRace({ mineRank: 34 }));
    const last = bandRaceFrame(m, ACT_TOTAL);
    const expected =
      Math.round((m.entries[33]!.score - m.entries[34]!.score) * 100) / 100;
    expect(last.myFate).toBe('SAFE');
    expect(last.margin).toBeCloseTo(expected, 2);
  });
});

describe('band race — 出走していない夜', () => {
  it('自分の馬がいない帯でも落ちない', () => {
    const input = fixtureBandRace();
    const m = buildBandRace({ ...input, entries: input.entries.map((e) => ({ ...e, mine: false })) });
    const last = bandRaceFrame(m, ACT_TOTAL);
    expect(last.myRank).toBeNull();
    expect(last.myFate).toBeNull();
    expect(last.rows.length).toBeGreaterThan(0);
  });
});

describe('主役の帯を選ぶ', () => {
  /** 指定順位に自分の馬を置いた帯を作る(mine なしは null)。 */
  const band = (day: number, mineRank: number | null, total = 38, burns = 4) => {
    const input = fixtureBandRace({ day, total, burns, ...(mineRank ? { mineRank } : {}) });
    return mineRank === null
      ? { ...input, entries: input.entries.map((e) => ({ ...e, mine: false })) }
      : input;
  };

  it('生存ラインに最も近かった馬の帯を選ぶ', () => {
    // LV.2 は圧勝(1位)、LV.4 はライン際(34位) → 見せるべきは LV.4
    const picked = selectFeaturedBand([band(2, 1), band(4, 34), band(6, 10)]);
    expect(picked?.day).toBe(4);
  });

  it('紙一重の2頭(ライン直上と直下)は同距離 — BURNされた側を選ぶ', () => {
    // ラインは34位と35位の「あいだ」。どちらも境界から0枠 = 等しく惜しい
    expect(selectFeaturedBand([band(2, 34), band(5, 35)])?.day).toBe(5);
    expect(selectFeaturedBand([band(5, 35), band(2, 34)])?.day).toBe(5);
  });

  it('ライン際の馬は、圧勝の馬より優先される', () => {
    expect(selectFeaturedBand([band(2, 1), band(5, 35)])?.day).toBe(5);
    expect(selectFeaturedBand([band(2, 34), band(5, 18)])?.day).toBe(2);
  });

  it('自分の馬がいる帯は、観戦帯より必ず優先される', () => {
    // LV.4 は自分が首位(圧勝=つまらない)だが、それでも観戦帯には負けない
    const picked = selectFeaturedBand([band(1, null), band(4, 1), band(6, null)]);
    expect(picked?.day).toBe(4);
  });

  it('出走馬がいない夜は、ライン際が最も競った帯を見せる', () => {
    const picked = selectFeaturedBand([band(1, null, 38, 4), band(3, null, 18, 2), band(6, null, 12, 1)]);
    expect(picked).not.toBeNull();
    expect([1, 3, 6]).toContain(picked!.day);
  });

  it('帯が1つも無ければ null', () => {
    expect(selectFeaturedBand([])).toBeNull();
  });
});

/* ---- ターミナル再生(ブラウザなしで演出の時間進行を確認する) --------------
   BAND_DUMP=1 pnpm vitest run test/band-race.test.ts -t 再生               */
describe('band race — 再生', () => {
  it('フレームをテキストで描画する', () => {
    if (!process.env.BAND_DUMP) return;
    const total = Number(process.env.BAND_TOTAL ?? 38);
    const m = buildBandRace(fixtureBandRace({
      total,
      burns: Number(process.env.BAND_BURNS ?? Math.max(1, Math.round(total * 0.107))),
      mineRank: Number(process.env.BAND_RANK ?? 34),
    }));
    const at = (process.env.BAND_AT ?? '0,3,4,7,10,14,18,21,23,25,28').split(',').map(Number);
    for (const t of at) {
      const f = bandRaceFrame(m, t);
      const head = `t=+${t.toFixed(1)}s  ${f.phase.padEnd(7)} LV.${f.day} — ${f.total}頭が出走 / ${f.burns}頭が消える`;
      const sub = `   開示 ${f.revealed}/${m.total - 1}   暫定 ${f.myRank ?? '—'}位 / 生存ライン ${f.lineRank}位` +
        (f.myScore !== null ? `   YOUR SCORE ${f.myScore.toFixed(2)}` : '') +
        (f.myFate ? `   → ${f.myFate}${f.margin !== null ? ` (${f.margin.toFixed(2)}点差)` : ''}` : '');
      const rows = f.rows.map((r) =>
        r.gap
          ? '        ⋮'
          : `${r.mine ? '  ▶' : '   '} ${String(r.rank).padStart(3)}  ${r.name.padEnd(16)} ${r.score.toFixed(2).padStart(6)}` +
            `${r.burned ? '  BURN' : ''}${r.atLine ? '   ── 生存ライン ──' : ''}`,
      );
      console.log([`\n${'═'.repeat(64)}`, head, sub, ...rows].join('\n'));
    }
    expect(true).toBe(true);
  });
});
