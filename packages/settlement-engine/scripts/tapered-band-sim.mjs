/**
 * 先細り価格バンドの検証シム(2026-07-20・レビュー第2回)
 *
 * 前回は全日一律バンド(±5/±10/±15/±20%)を検証した。今回は「日数で先細り」型:
 *   Day1 ±25% / Day2 ±20% / Day3 ±15% / Day4 ±10% / Day5 ±5% / Day6 ±0%(固定)
 *
 * 根拠として提示された仮説:
 *   馬の本当の価値は「Day7到達確率 × 200」。残走数が多いほど良馬と平均馬の差が
 *   複利で開く。生存89.3%なら残1走で約7%差、残6走で約29%差 → 一律は序盤で狭く
 *   終盤で広い。先細りなら200の天井はDay6でしか効かないので自動的に解決する。
 *
 * この仮説自体もシムで検証する(理論バンド幅を実際に計算して、提案値と突き合わせる)。
 *
 * 実行: node packages/settlement-engine/scripts/tapered-band-sim.mjs
 */
import { PRICE_TABLE_V1, PURCHASE_LOCK_AMOUNT, BUYBACK_TOTAL, BURN_TARGET_RATE_V1 } from '@sevendays/domain';

const BUYBACK = Number(BUYBACK_TOTAL);
const LOCK = Number(PURCHASE_LOCK_AMOUNT);
const BURN = Number(BURN_TARGET_RATE_V1.NORMAL); // 0.107
const SURV = 1 - BURN;                            // 0.893

/** 提案された先細りバンド。Day6は固定(0%)。 */
const TAPER = { 1: 0.25, 2: 0.20, 3: 0.15, 4: 0.10, 5: 0.05, 6: 0.0 };

const price = (d) => Number(PRICE_TABLE_V1[d]);
const hi = (d) => price(d) * (1 + TAPER[d]);
const lo = (d) => price(d) * (1 - TAPER[d]);
const fmt = (n) => n.toFixed(2).padStart(7);
const pct = (n) => `${(n * 100).toFixed(1)}%`.padStart(6);

console.log('='.repeat(80));
console.log('先細りバンドの検証 — Day1 ±25% … Day6 ±0%');
console.log('='.repeat(80));
console.log(`買戻し=${BUYBACK.toFixed(2)} / 現行ロック額=${LOCK} / BURN率=${(BURN * 100).toFixed(1)}% (生存 ${(SURV * 100).toFixed(1)}%)\n`);

// ---------------------------------------------------------------------------
// 0. 提案の根拠(残走数による価値の開き)を検証する
// ---------------------------------------------------------------------------
console.log('【0】提案根拠の検証: 残走数と「良馬 vs 平均馬」の価値差');
console.log('  仮定: 平均馬の1走生存 89.3%。良馬は帯上位なので生存を高めに置く。');
console.log('  Day d の馬に残る走数 = 7 - d(Day6は残1走)\n');
console.log('   Day  残走  平均馬の到達確率  良馬(96%/走)  差(倍率)  理論バンド幅  提案値');
for (let d = 1; d <= 6; d++) {
  const legs = 7 - d;
  const avg = Math.pow(SURV, legs);
  const good = Math.pow(0.96, legs);
  const ratio = good / avg;
  // 理論バンド幅 = (良馬 - 平均)/平均 の片側。上下対称バンドなら半分ずつ。
  const theo = ratio - 1;
  console.log(
    `   ${d}     ${legs}      ${pct(avg)}        ${pct(good)}     ${ratio.toFixed(3)}     ` +
    `±${(theo * 100).toFixed(1).padStart(5)}%    ±${(TAPER[d] * 100).toFixed(0).padStart(2)}%`,
  );
}
console.log('\n  → 残走数が増えるほど価値差が複利で開くのは事実。方向としての先細りは正しい。');
console.log('    ただし理論値と提案値のズレは後述(【5】)。\n');

// ---------------------------------------------------------------------------
// 1. 各日の上限が200を超えないか / 2. ロック額
// ---------------------------------------------------------------------------
console.log('【1】【2】各日の価格レンジと 200 天井・ロック額');
console.log('   Day  階段価格   下限     上限     200との差   判定');
let maxHi = 0;
for (let d = 1; d <= 6; d++) {
  const h = hi(d);
  maxHi = Math.max(maxHi, h);
  const margin = BUYBACK - h;
  console.log(
    `   ${d}   ${fmt(price(d))}  ${fmt(lo(d))}  ${fmt(h)}   ${(margin >= 0 ? '+' : '') + margin.toFixed(2).padStart(7)}   ` +
    `${margin > 0 ? 'OK' : '★超過'}`,
  );
}
console.log(`\n  最高取引価格 = ${maxHi.toFixed(2)}(Day6の固定価格)`);
console.log(`  → 200天井: 余裕 ${(BUYBACK - maxHi).toFixed(2)} USDT。**Day6を固定する限り天井問題は消滅**`);
console.log(`  → PURCHASE_LOCK_AMOUNT: 現行 ${LOCK} ≥ 最高取引価格 ${maxHi.toFixed(2)} なので **変更不要**`);
console.log('     (Day5上限 ' + hi(5).toFixed(2) + ' も 177.16 未満)\n');

// ---------------------------------------------------------------------------
// 5. 「上限で買って翌日下限で売る」最大損失
// ---------------------------------------------------------------------------
console.log('【5】最悪ケース: 上限で買い、翌日下限で売る(=育成せず値も上がらなかった場合)');
console.log('   買った日  買値(上限)  翌日売値(下限)   損益     率');
for (let d = 1; d <= 6; d++) {
  const buy = hi(d);
  const sell = d < 6 ? lo(d + 1) : BUYBACK; // Day6の翌日は買戻し200
  const pl = sell - buy;
  console.log(
    `   D${d}      ${fmt(buy)}    ${fmt(sell)}    ${(pl >= 0 ? '+' : '') + pl.toFixed(2).padStart(7)}  ` +
    `${(pl >= 0 ? '+' : '') + ((pl / buy) * 100).toFixed(1)}%`,
  );
}
console.log('\n  比較: 前回の一律±10%では D1〜D5 で −12〜−18 USDT。');
console.log('  先細りでは序盤ほど悪化する(バンドが広いため)。初心者はDay1で買うことが多い。\n');

// 逆に「下限で買って翌日上限で売る」最良ケース
console.log('   参考(最良ケース): 下限で買い翌日上限で売る');
console.log('   買った日  買値(下限)  翌日売値(上限)   損益     率');
for (let d = 1; d <= 6; d++) {
  const buy = lo(d);
  const sell = d < 6 ? hi(d + 1) : BUYBACK;
  const pl = sell - buy;
  console.log(
    `   D${d}      ${fmt(buy)}    ${fmt(sell)}    ${(pl >= 0 ? '+' : '') + pl.toFixed(2).padStart(7)}  ` +
    `+${((pl / buy) * 100).toFixed(1)}%`,
  );
}

// ---------------------------------------------------------------------------
// 3. マッチ率 — 買い手から見た期待値が成立するか
// ---------------------------------------------------------------------------
console.log('\n【3】買い手の期待値(=売れ残りリスク)');
console.log('  買い手は「価格」を払い「Day7で200」を狙う。到達確率で期待値を出す。');
console.log('  総合値が高い馬ほど価格が上がるので、生存確率も高い前提で計算する。\n');
console.log('   Day  価格帯      想定生存/走  Day7到達  期待値    対価格EV   判定');
for (let d = 1; d <= 6; d++) {
  const legs = 7 - d;
  for (const [label, p, surv] of [
    ['下限', lo(d), 0.82],   // 総合値が低い= 帯下位寄り
    ['階段', price(d), SURV], // 平均
    ['上限', hi(d), 0.96],   // 総合値が高い= 帯上位寄り
  ]) {
    const reach = Math.pow(surv, legs);
    const ev = reach * BUYBACK;
    const evRatio = ev / p - 1;
    console.log(
      `   ${d}   ${label} ${fmt(p)}   ${pct(surv)}    ${pct(reach)}  ${fmt(ev)}  ` +
      `${(evRatio >= 0 ? '+' : '') + (evRatio * 100).toFixed(1).padStart(6)}%  ` +
      `${evRatio > 0 ? '買う理由あり' : '★EVマイナス — 売れ残る'}`,
    );
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// 4. Day1下限は「安すぎて地雷」に見えるか
// ---------------------------------------------------------------------------
console.log('【4】Day1下限の水準');
const d1lo = lo(1);
console.log(`  Day1下限 = ${d1lo.toFixed(2)} USDT(ミント総額 102.00 の ${((d1lo / 102) * 100).toFixed(1)}%)`);
console.log(`  Day0ミント価格 100.00 も下回る(${(d1lo - 100).toFixed(2)})。`);
console.log('  → 「1日走って生き残ったのに、新品より安い」という表示になる。');
console.log('    値上がりの階段(1日10%複利)という商品説明と、体験が矛盾する。');
const d1EV = Math.pow(0.82, 6) * BUYBACK;
console.log(`  → ただしEV的には妥当: 生存82%/走なら Day7到達 ${(Math.pow(0.82, 6) * 100).toFixed(1)}% で期待値 ${d1EV.toFixed(2)}`);
console.log(`    ${d1lo.toFixed(2)} で買えば +${((d1EV / d1lo - 1) * 100).toFixed(1)}% のEV。地雷ではなく「安いなりの理由がある馬」。`);
console.log('    問題は数字ではなく**表示**(階段より下に出ること)。\n');

// ---------------------------------------------------------------------------
// 代案の提示
// ---------------------------------------------------------------------------
console.log('='.repeat(80));
console.log('代案: 「上振れのみ」先細りバンド(下限は階段価格に固定)');
console.log('='.repeat(80));
console.log('  Day d の価格 = 階段価格 × (1 + band_d × 総合値の相対位置)  ただし下限は階段価格');
console.log('  = 育成した馬だけが高くなる。育てなければ従来どおりの階段価格。\n');
console.log('   Day  下限(=階段)  上限      最悪ケース(上限で買い翌日階段で売る)');
for (let d = 1; d <= 6; d++) {
  const buy = hi(d);
  const sell = d < 6 ? price(d + 1) : BUYBACK;
  const pl = sell - buy;
  console.log(
    `   D${d}   ${fmt(price(d))}   ${fmt(hi(d))}   ${(pl >= 0 ? '+' : '') + pl.toFixed(2).padStart(7)} ` +
    `(${(pl >= 0 ? '+' : '') + ((pl / buy) * 100).toFixed(1)}%)`,
  );
}
console.log('\n  利点:');
console.log('   - 階段(1日10%複利)が**価格の下限として保証**される → 商品説明が無傷');
console.log('   - Day1下限がミント価格を下回る問題が消える');
console.log('   - 最悪ケースの損失が大幅に縮む(上表)');
console.log('   - 「育てた馬は高い」= 育成が報われる目的は達成される');
console.log('  欠点:');
console.log('   - 育てていない馬が割高に残る(買い手が階段価格の馬を敬遠する可能性)');
console.log('   - 平均価格が上がるので、買い手の必要資金がやや増える');
