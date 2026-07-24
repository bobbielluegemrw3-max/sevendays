/**
 * 変動価格（価格バンド）の経済中立性シム — トラック①（G-1）
 * (MARKET_VARIABLE_PRICING_READINESS_BRIEF.md §4 トラック①)
 *
 * 問い: バンド価格（下限=階段 + total_value に応じ上方向のみ加算・Day先細り）を載せても
 *       プレイヤーEV(−11.2%)・BURN(10.7%)・チャンピオン(45.3%)・ソルベンシーが保たれるか。
 *
 * ── 分析の核（レビュー側の中立性仮説を数値で確認する）──────────────────────
 *   集計プレイヤーEV/mint = (champions×200 − mints×102 − Σfees)/mints
 *     · champions と mints は「母集団中立」で価格に非依存(floor(出走×0.107)・所有者不在)
 *     · P2P は買い手が price を払い売り手が price−fee を受け取る＝プレイヤー間ゼロサム
 *     · バンドが動かすのは fee のベース(2%×売値)だけ → EV は微小に下がり運営は微増
 *   ソルベンシー: buyback 積立 93.60/mint − 負債 200×champions/mint も価格非依存。
 *   ★よってバンドは EV/ソルベンシー中立の見込み。ラダーと数値比較して確認する。
 *
 * ── 実コード整合(2026-07-24 grep) ────────────────────────────────────────
 *   バンド設計 = FUN_V3_PLAN.md §4 施策A(下限=階段・Day先細り・Day6固定)
 *     Day1 +25% / 2 +20% / 3 +15% / 4 +10% / 5 +5% / 6 +0% ・上限 ≤177.16<200
 *   価格ラダー PRICE_TABLE_V1 / 手数料 P2P_FEE_RATE=0.02 / BURN 0.107 / 買戻し200 / mint102
 *   total_value: mint 40–75(v2.ts) — 相対位置 tvPct=(tv−40)/(75−40) を上方向加算に使う
 *
 * 実行: node packages/settlement-engine/scripts/price-band-economy-sim.mjs
 * 乱数: mulberry32 固定シード・DB不要MC。
 */
import { PRICE_TABLE_V1 } from '@sevendays/domain';

const BURN_RATE = 0.107;
const BURN_LO = 0.08, BURN_HI = 0.135;
const RACES_TO_CHAMPION = 7;
const MINT_COST = 102, CHAMPION_PAYOUT = 200;
const BUYBACK_RESERVE_PER_MINT = 93.6;
const P2P_FEE_RATE = 0.02;
const LADDER = [100, 110, 121, 133.1, 146.41, 161.05, 177.16];
const BAND_W = { 1: 0.25, 2: 0.2, 3: 0.15, 4: 0.1, 5: 0.05, 6: 0.0 };
const MINT_TV_MIN = 40, MINT_TV_MAX = 75;
const DECAY = 2.0, LUCK = 3.0;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const usd = (x) => x.toFixed(2);
const tvPct = (tv) => Math.max(0, Math.min(1, (tv - MINT_TV_MIN) / (MINT_TV_MAX - MINT_TV_MIN)));
// バンド価格: 下限=階段, total_value の相対位置ぶんだけ上方向に加算(Day6は固定)。上限≤177.16。
const bandPrice = (day, tv) => {
  const floorP = LADDER[Math.min(6, day)];
  const w = BAND_W[day] ?? 0;
  return floorP * (1 + w * tvPct(tv));
};
const ladderPrice = (day) => LADDER[Math.min(6, day)];

/**
 * 定常状態の夜次シミュレーション。pricing = 'ladder' | 'band'。
 * churn = 各生存馬が「その夜 P2P で売買される」確率(=手数料が発生する取引の頻度)。
 *   手数料は売値の 2%。バンドは売値ベースを上げるので手数料シンクが増える。
 */
function simulate(cfg) {
  const rand = rng(cfg.seed);
  const { pricing, churn, M, nights } = cfg;
  const price = pricing === 'band' ? bandPrice : (day) => ladderPrice(day);
  let field = [];
  let idSeq = 0;
  const mk = () => ({ id: idSeq++, tv: MINT_TV_MIN + rand() * (MINT_TV_MAX - MINT_TV_MIN), day: 0 });
  const eff = (h) => Math.max(0, h.tv - DECAY * h.day);

  let mints = 0, burned = 0, championed = 0, raced = 0;
  let feeSink = 0;      // 運営へ(2%×売値)。プレイヤー総体から抜ける唯一の価格依存項。
  let saleVolume = 0;   // Σ売値(参考)
  let saleCount = 0;
  const warmup = Math.min(60, Math.floor(nights * 0.25));
  const jitter = () => Math.max(BURN_LO, Math.min(BURN_HI, BURN_RATE + (rand() * 2 - 1) * 0.02));

  for (let t = 0; t < nights; t++) {
    const counting = t >= warmup;
    for (let i = 0; i < M; i++) field.push(mk());
    if (counting) mints += M;

    // P2P 取引(手数料発生)。churn ぶんの生存馬が当夜売買される想定。
    // 売値 = pricing に応じた現在の価格(day, tv)。手数料 2% が運営シンク。
    for (const h of field) {
      if (h.day >= 1 && h.day <= 6 && rand() < churn) {
        const p = price(h.day, h.tv);
        if (counting) { feeSink += p * P2P_FEE_RATE; saleVolume += p; saleCount++; }
      }
    }

    // 出走・BURN(floor(N×率)・実効スコア下位)。価格に非依存。
    const N = field.length;
    if (N === 0) continue;
    const slots = Math.floor(N * jitter());
    for (const h of field) h._s = eff(h) + (rand() * 2 - 1) * LUCK;
    field.sort((a, b) => a._s - b._s);
    if (counting) raced += N;
    const burnedSet = new Set();
    for (let k = 0; k < slots; k++) { burnedSet.add(field[k].id); if (counting) burned++; }
    const survivors = [];
    for (const h of field) {
      if (burnedSet.has(h.id)) continue;
      h.day++;
      if (h.day >= RACES_TO_CHAMPION) { if (counting) championed++; continue; }
      survivors.push(h);
    }
    field = survivors;
  }

  const buybackMarginPerMint = BUYBACK_RESERVE_PER_MINT - (championed * CHAMPION_PAYOUT) / Math.max(1, mints);
  const burnRate = raced > 0 ? burned / raced : 0;
  const champRate = mints > 0 ? championed / mints : 0;
  // 集計EV/mint = (champions×200 − feeSink)/mints − 102。P2P移転はゼロサムで相殺。
  const evPerMint = (championed * CHAMPION_PAYOUT - feeSink) / Math.max(1, mints) - MINT_COST;
  return {
    pricing, churn, mints, raced, burned, championed, burnRate, champRate,
    feeSink, feePerMint: feeSink / Math.max(1, mints),
    avgSale: saleCount > 0 ? saleVolume / saleCount : 0,
    buybackMarginPerMint, evPerMint, evPct: evPerMint / MINT_COST,
  };
}

function judge(r) {
  const out = [];
  out.push({ id: 'A', name: 'BURN率 10.7%', pass: Math.abs(r.burnRate - BURN_RATE) < 0.004, v: pct(r.burnRate) });
  out.push({ id: 'champ', name: 'チャンピオン率', pass: Math.abs(r.champRate - 0.453) < 0.02, v: pct(r.champRate) });
  out.push({ id: 'C', name: 'EV −11.2%±3pp', pass: Math.abs(r.evPct + 0.112) < 0.03, v: `${usd(r.evPerMint)}(${pct(r.evPct)})` });
  out.push({ id: 'solv', name: 'ソルベンシー余剰>0', pass: r.buybackMarginPerMint > 0, v: `${usd(r.buybackMarginPerMint)}/mint` });
  return out;
}

const COMMON = { seed: 20260724, M: 400, nights: 400 };
console.log('='.repeat(80));
console.log('変動価格(価格バンド)の経済中立性シム — トラック①(G-1)  DB不要MC・固定シード');
console.log('='.repeat(80));
console.log('バンド: 下限=階段 + total_value 上方向加算(Day1+25%…Day6+0%)・上限≤177.16<200\n');

// バンド上限が 200 を超えないことの確認(価格の幾何・既存sim再確認)
console.log('--- バンド上限 vs 買戻し200(全 total_value=最大での上限) ---');
for (let d = 1; d <= 6; d++) {
  const hi = bandPrice(d, MINT_TV_MAX);
  console.log(`  Day${d}: 下限 ${usd(ladderPrice(d))} → 上限 ${usd(hi)}  (200余裕 ${usd(200 - hi)}) ${hi <= 177.16 + 1e-9 ? 'OK' : '★超過'}`);
}

console.log('\n--- ラダー vs バンド の経済比較(churn=P2P取引頻度をスイープ) ---');
for (const churn of [0.1, 0.3, 0.6]) {
  console.log(`\n### churn=${pct(churn)}(各生存馬が当夜P2P売買される確率)`);
  const results = {};
  for (const pricing of ['ladder', 'band']) {
    const r = simulate({ ...COMMON, pricing, churn });
    results[pricing] = r;
    const v = judge(r);
    console.log(`  [${pricing.padEnd(6)}] BURN ${pct(r.burnRate)} | champ ${pct(r.champRate)} | EV ${usd(r.evPerMint)}(${pct(r.evPct)}) `
      + `| 余剰 ${usd(r.buybackMarginPerMint)}/mint | fee ${usd(r.feePerMint)}/mint | 平均売値 ${usd(r.avgSale)}`);
    console.log(`           ${v.map((x) => `${x.pass ? 'PASS' : 'FAIL'} ${x.id}`).join(' / ')}`);
  }
  const dEv = results.band.evPerMint - results.ladder.evPerMint;
  const dFee = results.band.feePerMint - results.ladder.feePerMint;
  const dMargin = results.band.buybackMarginPerMint - results.ladder.buybackMarginPerMint;
  console.log(`  → バンド−ラダー: ΔEV ${usd(dEv)}/mint(${pct(dEv / MINT_COST)}) ・ Δfee(運営) +${usd(dFee)}/mint ・ Δ余剰 ${usd(dMargin)}/mint`);
  console.log(`     中立性: champ/BURN/余剰は同一(価格非依存)。EV差は fee 微増のみ(=運営が得る再分配)。`);
}

console.log('\n' + '='.repeat(80));
console.log('結論(数値で確認): バンド価格は BURN/champ/ソルベンシーを一切動かさない(価格非依存)。');
console.log('  プレイヤー集計EVの差はP2P手数料ベース微増ぶんのみ(<1pp・運営ソルベンシーはプラス)。');
console.log('  ＝レビュー側の「P2P再分配で中立」仮説を支持。★ただし本simは母集団MC(実バッチは');
console.log('  operator-rtp-sim に変動価格を結線して別途確認・購入方針は トラック②/G4は トラック③)。');
console.log('='.repeat(80));
