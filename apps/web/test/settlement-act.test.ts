import { describe, expect, it } from 'vitest';
import {
  PULSE_SECONDS,
  SETTLEMENT_TOTAL,
  fixtureSettlement,
  hasHarvest,
  settlementFrame,
  settlementLength,
  type SettlementInput,
} from '../lib/settlement-act';

/* SETTLEMENT 幕(施策G 後半)の不変条件。
   この幕の存在理由は「作り物で尺を埋めるのをやめる」ことにある。
   したがって ①自分の活動が無い夜は畳む ②出す数字は実データだけ、が芯。 */

const quietNight = (): SettlementInput => ({ ...fixtureSettlement(), rows: [] });

describe('settlement — 作り物で尺を埋めない', () => {
  it('自分の精算が無い夜は PULSE の3秒で終わる', () => {
    const input = quietNight();
    expect(hasHarvest(input)).toBe(false);
    expect(settlementLength(input)).toBe(PULSE_SECONDS);
  });

  it('自分の精算がある夜だけフル尺になる', () => {
    expect(settlementLength(fixtureSettlement())).toBe(SETTLEMENT_TOTAL);
  });

  it('活動が無ければ HARVEST 幕には入らない', () => {
    const input = quietNight();
    for (let t = 0; t <= SETTLEMENT_TOTAL; t += 0.5) {
      const f = settlementFrame(input, t);
      expect(f.phase).toBe('PULSE');
      expect(f.revealed).toHaveLength(0);
      expect(f.showClosing).toBe(false);
    }
  });
});

describe('settlement — 出ていった馬 → 入ってきた馬', () => {
  it('売却が先、購入が後に開示される', () => {
    const f = settlementFrame(fixtureSettlement(), SETTLEMENT_TOTAL);
    expect(f.revealed.map((r) => r.kind)).toEqual(['out', 'in', 'in']);
  });

  it('開示は増えるだけで、取り消されない', () => {
    const input = fixtureSettlement();
    let prev = 0;
    for (let t = 0; t <= SETTLEMENT_TOTAL; t += 0.25) {
      const n = settlementFrame(input, t).revealed.length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(input.rows.length);
  });

  it('締めの1行は最後にだけ出る', () => {
    const input = fixtureSettlement();
    expect(settlementFrame(input, 0).showClosing).toBe(false);
    expect(settlementFrame(input, SETTLEMENT_TOTAL).showClosing).toBe(true);
  });
});

describe('settlement — 数字は実データだけ', () => {
  it('収支 = 売却の手取り合計 − 購入の支払合計', () => {
    // 手取り 173.62 − (102.00 + 133.10) = −61.48
    const f = settlementFrame(fixtureSettlement(), SETTLEMENT_TOTAL);
    expect(f.netTotal).toBeCloseTo(-61.48, 2);
  });

  it('手取りが不明な売却が混ざったら収支は出さない(推定値を出さない)', () => {
    const base = fixtureSettlement();
    const input: SettlementInput = {
      ...base,
      rows: base.rows.map((r) => (r.kind === 'out' ? { ...r, net: null } : r)),
    };
    expect(settlementFrame(input, SETTLEMENT_TOTAL).netTotal).toBeNull();
  });

  it('厩舎の頭数は 出ていった/入ってきた の実数で増減する', () => {
    // 8頭 − 売却1 + 購入2 = 9頭
    const f = settlementFrame(fixtureSettlement(), SETTLEMENT_TOTAL);
    expect(f.stableBefore).toBe(8);
    expect(f.stableAfter).toBe(9);
  });

  it('精算前の頭数が不明なら締めの頭数は出さない', () => {
    const input: SettlementInput = { ...fixtureSettlement(), stableBefore: null };
    const f = settlementFrame(input, SETTLEMENT_TOTAL);
    expect(f.stableBefore).toBeNull();
    expect(f.stableAfter).toBeNull();
  });
});
