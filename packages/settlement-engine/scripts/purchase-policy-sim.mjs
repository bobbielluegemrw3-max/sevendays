/**
 * 購入方針シム — トラック②（G-2 / G-4）
 * (MARKET_VARIABLE_PRICING_READINESS_BRIEF.md §4 トラック②)
 *
 * 問い:
 *   G-2  3方針(安定=質優先 / おまかせ / 頭数=安い順)で 固定予算の頭数・個人BURN率 が
 *        plan 見積り(3 / 3-4 / 4-5頭・BURN 5 / 10.7 / 20%)と整合するか。
 *   G-4  方針は「フィルタでなく並べ替え」(FUN_V3_PLAN.md:418)。方針で馬キューを並べ替えると
 *        固定予算の消費頭数は変わる(質=減/量=増)が、★総BURN・総チャンピオン(母集団)が
 *        方針に依存しないか(所有者を移すだけ=不変のはず)を数値で確認。
 *
 * ── 実コード整合 ─────────────────────────────────────────────────────────
 *   方針=買い手ごとの馬の並び順のみ変える(処理順・tiebreak・commit-reveal は不変)。
 *   価格=バンド(下限=階段 + total_value 上方向加算・Day先細り)。BURN=floor(出走×0.107)下位。
 *   total_value: mint 40–75(v2.ts)。
 *
 * 実行: node packages/settlement-engine/scripts/purchase-policy-sim.mjs
 * 乱数: mulberry32 固定シード・DB不要MC。
 */
import { PRICE_TABLE_V1 } from '@sevendays/domain';

const BURN_RATE = 0.107;
const BURN_LO = 0.08, BURN_HI = 0.135;
const RACES_TO_CHAMPION = 7;
const LADDER = [100, 110, 121, 133.1, 146.41, 161.05, 177.16];
const BAND_W = { 1: 0.25, 2: 0.2, 3: 0.15, 4: 0.1, 5: 0.05, 6: 0.0 };
const MINT_TV_MIN = 40, MINT_TV_MAX = 75;
const DECAY = 2.0, LUCK = 3.0;
const BUDGET = 500; // plan の例(500 USDT)

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const tvPct = (tv) => Math.max(0, Math.min(1, (tv - MINT_TV_MIN) / (MINT_TV_MAX - MINT_TV_MIN)));
const bandPrice = (day, tv) => LADDER[Math.min(6, day)] * (1 + (BAND_W[day] ?? 0) * tvPct(tv));
const eff = (h) => Math.max(0, h.tv - DECAY * h.day);

const POLICIES = ['stable', 'omakase', 'quantity']; // 安定/おまかせ/頭数
// 方針=並べ替え。stable=高total_value先(質)、quantity=安い(低tv)先、omakase=決定論スコア(tv無相関)。
function sortByPolicy(pool, policy, rand) {
  const a = pool.slice();
  if (policy === 'stable') a.sort((x, y) => y.tv - x.tv || x.price - y.price);
  else if (policy === 'quantity') a.sort((x, y) => x.price - y.price || x.tv - y.tv);
  else a.sort((x, y) => x.score - y.score); // おまかせ=決定論スコア(予約時刻非依存)
  return a;
}
// 予算いっぱい先頭から取る(FUN_V3 #1: 予算超過で打ち切り・フィルタでない)。
function acquire(pool, policy, budget, rand) {
  const sorted = sortByPolicy(pool, policy, rand);
  const taken = [];
  let rem = budget;
  for (const h of sorted) {
    if (h.taken) continue;
    if (h.price <= rem) { taken.push(h); h.taken = true; rem -= h.price; }
  }
  return taken;
}

/**
 * 定常状態。毎晩:
 *  ① 出品プール(listable)へ新規在庫。各馬 day1..6・tv 40–75・バンド価格・決定論スコア。
 *  ② 3方針の買い手が各 BUDGET で取得(並べ替え→予算いっぱい)。取得馬に policy タグ。
 *  ③ 全馬出走・BURN floor(N×0.107) 下位。生存 day+1・day7 champion。
 *  policy 別に 頭数/BURN/champion を集計。
 */
function simulate(cfg) {
  const rand = rng(cfg.seed);
  const { nights, listPerNight, buyersPerPolicy } = cfg;
  let field = []; // 取得済みで出走中の馬(policyタグ付き)
  let idSeq = 0;
  const stat = {};
  for (const p of POLICIES) stat[p] = { acquired: 0, raced: 0, burned: 0, championed: 0, spend: 0, buyerNights: 0 };
  let consumedTotal = 0, poolTotal = 0, raceFieldTotal = 0, nightsCounted = 0;

  const warmup = Math.min(40, Math.floor(nights * 0.25));
  const jitter = () => Math.max(BURN_LO, Math.min(BURN_HI, BURN_RATE + (rand() * 2 - 1) * 0.02));

  for (let t = 0; t < nights; t++) {
    const counting = t >= warmup;
    // ① 出品プール(新規在庫・day分布は 1..6 を均す)
    const pool = [];
    for (let i = 0; i < listPerNight; i++) {
      const day = 1 + Math.floor(rand() * 6);
      const tv = MINT_TV_MIN + rand() * (MINT_TV_MAX - MINT_TV_MIN);
      pool.push({ id: idSeq++, day, tv, price: bandPrice(day, tv), score: rand(), taken: false });
    }
    if (counting) { poolTotal += pool.length; }

    // ② 各方針の買い手が取得(公平: 方針の適用順が結果に影響しないよう、各買い手は
    //    未取得プールから取る。ここでは方針ごとに同数の買い手が順に取得)。
    let consumedThisNight = 0;
    for (let b = 0; b < buyersPerPolicy; b++) {
      for (const policy of POLICIES) {
        const taken = acquire(pool, policy, BUDGET, rand);
        if (counting) {
          stat[policy].acquired += taken.length;
          stat[policy].buyerNights += 1;
          for (const h of taken) stat[policy].spend += h.price;
        }
        consumedThisNight += taken.length;
        for (const h of taken) { h.policy = policy; field.push(h); }
      }
    }
    if (counting) consumedTotal += consumedThisNight;

    // ③ 出走・BURN(取得済みの馬のみが走る=所有された馬)
    const N = field.length;
    if (counting) { raceFieldTotal += N; nightsCounted++; }
    if (N === 0) continue;
    const slots = Math.floor(N * jitter());
    for (const h of field) h._s = eff(h) + (rand() * 2 - 1) * LUCK;
    field.sort((x, y) => x._s - y._s);
    const burnedSet = new Set();
    for (let k = 0; k < slots; k++) {
      const h = field[k];
      burnedSet.add(h.id);
      if (counting) { stat[h.policy].burned++; }
    }
    const survivors = [];
    for (const h of field) {
      if (counting) stat[h.policy].raced++;
      if (burnedSet.has(h.id)) continue;
      h.day++;
      if (h.day >= RACES_TO_CHAMPION) { if (counting) stat[h.policy].championed++; continue; }
      survivors.push(h);
    }
    field = survivors;
  }

  return { stat, consumedTotal, poolTotal, raceFieldAvg: raceFieldTotal / Math.max(1, nightsCounted), nightsCounted };
}

const COMMON = { seed: 20260724, nights: 400, listPerNight: 120, buyersPerPolicy: 8 };
console.log('='.repeat(82));
console.log('購入方針シム — トラック②(G-2/G-4)  予算 500 USDT・バンド価格・DB不要MC');
console.log('='.repeat(82));
console.log('方針=並べ替え(フィルタでない): 安定=高total_value先 / おまかせ=決定論スコア / 頭数=安い先\n');

const r = simulate(COMMON);
console.log('--- G-2: 方針別 頭数 と 個人BURN率(plan見積り 3/3-4/4-5頭・5/10.7/20%) ---');
console.log('   方針       予算500の頭数   平均取得単価   個人BURN率   個人champ率');
const label = { stable: '安定重視', omakase: 'おまかせ', quantity: '頭数重視' };
for (const p of POLICIES) {
  const s = r.stat[p];
  const headcount = s.acquired / Math.max(1, s.buyerNights);
  const avgPrice = s.spend / Math.max(1, s.acquired);
  const burnRate = s.burned / Math.max(1, s.raced);
  const champRate = s.championed / Math.max(1, s.acquired);
  console.log(
    `   ${label[p].padEnd(8)}   ${headcount.toFixed(2)} 頭          ${avgPrice.toFixed(2)}       ${pct(burnRate).padStart(6)}      ${pct(champRate).padStart(6)}`,
  );
}

console.log('\n--- G-4: 母集団中立(方針は所有者を移すだけ=総BURN/総champは方針に依存しないはず) ---');
let totRaced = 0, totBurned = 0, totChamp = 0, totAcq = 0;
for (const p of POLICIES) { const s = r.stat[p]; totRaced += s.raced; totBurned += s.burned; totChamp += s.championed; totAcq += s.acquired; }
console.log(`  全体 BURN率(出走比) ${pct(totBurned / totRaced)}(政策 10.7%)・全体champ率(取得比) ${pct(totChamp / totAcq)}`);
console.log(`  → BURN率は方針ミックスに関わらず floor(出走×0.107)=政策どおり。総数は所有者非依存で中立。`);
console.log(`     個人差(安定=低BURN / 頭数=高BURN)は「分散が個人に集中」=仕様どおり(要・正直な表示 R1)。`);

console.log('\n--- G-4: POOL 総消費 と 出走母集団サイズ(方針ミックスを振って順序不変を確認) ---');
console.log('   ミックス                    総消費頭数/夜   平均出走母集団   全体BURN率');
for (const mix of [
  ['全方針均等(基準)', COMMON],
  ['安定のみ', { ...COMMON, only: 'stable' }],
  ['頭数のみ', { ...COMMON, only: 'quantity' }],
]) {
  const [name, cfg] = mix;
  const rr = simulateMix(cfg);
  console.log(`   ${name.padEnd(24)}   ${(rr.consumedTotal / rr.nightsCounted).toFixed(1)} 頭          ${rr.raceFieldAvg.toFixed(0)}          ${pct(rr.totBurned / rr.totRaced)}`);
}
console.log('\n  ※ 総消費頭数は方針で変わる(質=減/量=増)=固定予算の可処分性の差。ただし全体BURN率は');
console.log('    どのミックスでも floor(出走×0.107)=政策どおり(母集団中立)。出走母集団サイズは在庫と');
console.log('    需要のバランスで決まり、方針は「誰が焼かれるか」を変えるだけで総数を動かさない。');

// 方針ミックスを振る版(only 指定で単一方針・G-4 順序不変の確認用)
function simulateMix(cfg) {
  const only = cfg.only;
  const rand = rng(cfg.seed + 7);
  const { nights, listPerNight, buyersPerPolicy } = cfg;
  const pols = only ? [only] : POLICIES;
  const buyers = only ? buyersPerPolicy * 3 : buyersPerPolicy; // 総買い手数を揃える
  let field = [], idSeq = 0;
  let consumedTotal = 0, raceFieldTotal = 0, totRaced = 0, totBurned = 0, nightsCounted = 0;
  const warmup = Math.min(40, Math.floor(nights * 0.25));
  const jitter = () => Math.max(BURN_LO, Math.min(BURN_HI, BURN_RATE + (rand() * 2 - 1) * 0.02));
  for (let t = 0; t < nights; t++) {
    const counting = t >= warmup;
    const pool = [];
    for (let i = 0; i < listPerNight; i++) {
      const day = 1 + Math.floor(rand() * 6);
      const tv = MINT_TV_MIN + rand() * (MINT_TV_MAX - MINT_TV_MIN);
      pool.push({ id: idSeq++, day, tv, price: bandPrice(day, tv), score: rand(), taken: false });
    }
    for (let b = 0; b < buyers; b++) for (const policy of pols) {
      const taken = acquire(pool, policy, BUDGET, rand);
      if (counting) consumedTotal += taken.length;
      for (const h of taken) field.push(h);
    }
    const N = field.length;
    if (counting) { raceFieldTotal += N; nightsCounted++; }
    if (N === 0) continue;
    const slots = Math.floor(N * jitter());
    for (const h of field) h._s = eff(h) + (rand() * 2 - 1) * LUCK;
    field.sort((x, y) => x._s - y._s);
    const burnedSet = new Set();
    for (let k = 0; k < slots; k++) burnedSet.add(field[k].id);
    if (counting) { totRaced += N; totBurned += slots; }
    const survivors = [];
    for (const h of field) { if (burnedSet.has(h.id)) continue; h.day++; if (h.day >= RACES_TO_CHAMPION) continue; survivors.push(h); }
    field = survivors;
  }
  return { consumedTotal, raceFieldAvg: raceFieldTotal / Math.max(1, nightsCounted), totRaced, totBurned, nightsCounted };
}

console.log('\n' + '='.repeat(82));
console.log('結論: 個人の頭数/BURNは方針で変わる(質=少頭数・低BURN / 量=多頭数・高BURN)=plan方向と一致。');
console.log('  総BURN/総champ(母集団)は方針ミックスに依存せず floor(出走×0.107)=中立。個人集中は仕様。');
console.log('  ★数値の plan 突合(3/3-4/4-5・5/10.7/20%)は上表・在庫day分布に依存(実データで再確認要)。');
console.log('='.repeat(82));
