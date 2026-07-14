import { describe, expect, it } from 'vitest';
import { EMPTY_COUNTS, FIXTURE_COUNTS, logWindow } from '../lib/daily-derby';

/**
 * ログ濁流の「件数だけ実数」結線(2026-07-14 初ライブの指摘③)。
 * 行はダミー生成のままでも、流れる行数は当夜の実件数を超えない。
 */
describe('logWindow count caps', () => {
  it('counts未指定(プレビュー)は従来どおりレート上限まで流れる', () => {
    const lines = logWindow(96, 200);
    expect(lines.length).toBeGreaterThan(100);
  });

  it('全件ゼロの夜はセクションヘッダーとNO EVENTSだけになる', () => {
    const lines = logWindow(96, 200, undefined, EMPTY_COUNTS);
    const nonHeader = lines.filter((l) => l.tone !== 'header' && l.tone !== 'end');
    expect(nonHeader).toHaveLength(0);
    expect(lines.filter((l) => l.text.includes('NO EVENTS')).length).toBeGreaterThanOrEqual(9);
  });

  it('各セクションの行数は実件数でキャップされる(9頭ミント・P2Pゼロの初夜)', () => {
    const counts = { ...EMPTY_COUNTS, mints: 9, assignments: 9 };
    const lines = logWindow(96, 400, undefined, counts);
    const mintLines = lines.filter((l) => l.tone === 'mint');
    const matchLines = lines.filter((l) => l.tone === 'match');
    const burnLines = lines.filter((l) => l.tone === 'burn');
    expect(mintLines.length).toBeLessThanOrEqual(9);
    expect(matchLines.length).toBeLessThanOrEqual(9);
    expect(burnLines).toHaveLength(0);
  });

  it('大きい実件数(通常夜)ではレートが上限になる(挙動不変)', () => {
    const withCounts = logWindow(96, 400, undefined, FIXTURE_COUNTS);
    const without = logWindow(96, 400);
    expect(withCounts.map((l) => l.id)).toEqual(without.map((l) => l.id));
  });
});
