/* プレイヤー期待値シミュレーション(オーナー依頼 2026-07-14)
 *
 * 問い: 「1,000 USDT(馬10頭)を買って毎日レースし続けると期待値はマイナス。
 *        組織からのチャンピオン祝い金(Decision 092)で期待値はどこまで上がるか」
 *
 * モデル(v1.1経済+Decision 092/077の確定値):
 *   - ミント: 102 USDT/頭(100+手数料2)。Day7走破(7晩生存)で200 USDT買戻し
 *   - 毎晩のBURN確率 r = 0.107(NORMAL。感度分析で8.0%/13.5%も実行)
 *   - 祝い金: 組織の配下でチャンピオン誕生ごとに上位へ T1=3/T2=2/T3〜T7=各1
 *   - ティア解放(組織=配下7段のACTIVE馬現在価値):
 *       T1=無条件 T2=1万 T3=2万 T4=5万 T5=25万(+直接3万超) T6=40万(+5万超) T7=60万(+7万超)
 *   - プールは支払い可能と仮定(SUPPORT_POOL_SIMULATION.mdで不足ほぼゼロを実証済み)
 *
 * 簡略化(注記): floor則・ジッターの日次変動は平均率で近似(馬ごと独立Bernoulli)。
 * 解決した枠は翌日即再購入(スロット常時稼働)。手動/スマート出品による中途売却なし
 * (=ホールド戦略)。アイテム購入なし。直接紹介ボリュームはT1メンバー保有分で近似。
 *
 * 実行: node packages/settlement-engine/scripts/player-ev-sim.mjs
 */

const MINT_COST = 102;
const CHAMPION_PAYOUT = 200;
const NIGHTS_TO_CHAMPION = 7;
const PRICE_TABLE = [100, 110, 121, 133.1, 146.41, 161.05, 177.16]; // day0..6
const TIER_AMOUNTS = [0, 3, 2, 1, 1, 1, 1, 1]; // index=tier distance
const ORG_THRESHOLDS = [0, 0, 10_000, 20_000, 50_000, 250_000, 400_000, 600_000];
const DIRECT_THRESHOLDS = [0, 0, 0, 0, 0, 30_001, 50_001, 70_001];

// 再現性のためのシード付きRNG(mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n試行・確率pの二項サンプル(大きいnは正規近似) */
function binom(rand, n, p) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n > 64) {
    const mu = n * p;
    const sd = Math.sqrt(n * p * (1 - p));
    const u1 = Math.max(rand(), 1e-12);
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand());
    return Math.min(n, Math.max(0, Math.round(mu + sd * z)));
  }
  let k = 0;
  for (let i = 0; i < n; i++) if (rand() < p) k++;
  return k;
}

/** ティアごとのメンバー数と1人あたり稼働馬数から1試行(dayNum日)を回す。
 *  payoutModel: 'celebration092'(現行: チャンピオン時に3/2/1) |
 *               'burn074'(旧: BURN時に3/2/1) |
 *               'burn021'(旧々: BURN時に直接紹介者へ10 USDT・1段のみ) */
function simulate({ rand, days, playerSlots, tiers, burnRate, payoutModel = 'celebration092' }) {
  // プレイヤー自身の馬: 日齢別の頭数(常時 playerSlots 稼働)
  let own = [playerSlots, 0, 0, 0, 0, 0, 0];
  // 組織: tier d ごとに [メンバー数 m, 1人あたり馬数 h] → 馬プール(日齢別)
  const org = tiers.map(([m, h]) => {
    const slots = m * h;
    return { slots, ages: [slots, 0, 0, 0, 0, 0, 0] };
  });

  let ownPnl = -playerSlots * MINT_COST; // 初期購入
  let celebIncome = 0;
  let ownChampions = 0;

  for (let day = 0; day < days; day++) {
    // --- 組織ボリューム(配下7段のACTIVE馬現在価値)とティア解放判定 ---
    let orgVolume = 0;
    let directVolume = 0;
    org.forEach((pool, i) => {
      let v = 0;
      for (let a = 0; a < 7; a++) v += pool.ages[a] * PRICE_TABLE[a];
      orgVolume += v;
      if (i === 0) directVolume = v; // T1メンバー保有分で直接条件を近似
    });
    let unlocked = 1;
    for (let t = 2; t <= 7; t++) {
      if (orgVolume >= ORG_THRESHOLDS[t] && directVolume >= DIRECT_THRESHOLDS[t]) unlocked = t;
      else break; // 連続解放(飛ばない)
    }

    // --- 今夜のレース: プレイヤー自身 ---
    const nextOwn = [0, 0, 0, 0, 0, 0, 0];
    let resolvedOwn = 0;
    for (let a = 0; a < 7; a++) {
      const n = own[a];
      if (n === 0) continue;
      const burned = binom(rand, n, burnRate);
      const survived = n - burned;
      resolvedOwn += burned;
      if (a === 6) {
        ownPnl += survived * CHAMPION_PAYOUT;
        ownChampions += survived;
        resolvedOwn += survived; // 枠が空く
      } else {
        nextOwn[a + 1] = survived;
      }
    }
    nextOwn[0] += resolvedOwn; // 翌日再購入(即時近似)
    ownPnl -= resolvedOwn * MINT_COST;
    own = nextOwn;

    // --- 今夜のレース: 組織メンバー(ティアごと) ---
    org.forEach((pool, i) => {
      const d = i + 1; // ティア距離
      const next = [0, 0, 0, 0, 0, 0, 0];
      let resolved = 0;
      for (let a = 0; a < 7; a++) {
        const n = pool.ages[a];
        if (n === 0) continue;
        const burned = binom(rand, n, burnRate);
        const survived = n - burned;
        resolved += burned;
        // 支払いモデル別の収入
        if (payoutModel === 'burn021') {
          if (d === 1) celebIncome += burned * 10; // 直接紹介者へ10 USDT/BURN
        } else if (payoutModel === 'burn074') {
          if (d <= unlocked) celebIncome += burned * TIER_AMOUNTS[d];
        }
        if (a === 6) {
          if (payoutModel === 'celebration092' && d <= unlocked) {
            celebIncome += survived * TIER_AMOUNTS[d];
          }
          resolved += survived;
        } else {
          next[a + 1] = survived;
        }
      }
      next[0] += resolved;
      pool.ages = next;
    });
  }

  // 期末評価: 走行中の自馬は「期待将来キャッシュ」= 200×(1-r)^(残り晩数) で
  // マーク(ゼロ計上だと常設厩舎が全損扱いになり損益が過大にマイナスになる)。
  let terminal = 0;
  for (let a = 0; a < 7; a++) {
    terminal += own[a] * CHAMPION_PAYOUT * Math.pow(1 - burnRate, NIGHTS_TO_CHAMPION - a);
  }
  ownPnl += terminal;

  return { ownPnl, celebIncome, ownChampions, total: ownPnl + celebIncome };
}

function pct(x) { return `${(x * 100).toFixed(1)}%`; }
function usd(x) { return x.toLocaleString('en-US', { maximumFractionDigits: 0 }); }

function runScenario(name, { tiers, playerSlots = 10, days = 84, trials = 4000, burnRate = 0.107, seed = 7 }) {
  const rand = rng(seed);
  const totals = [];
  let sumOwn = 0, sumCeleb = 0;
  for (let t = 0; t < trials; t++) {
    const r = simulate({ rand, days, playerSlots, tiers, burnRate });
    totals.push(r.total);
    sumOwn += r.ownPnl;
    sumCeleb += r.celebIncome;
  }
  totals.sort((a, b) => a - b);
  const mean = totals.reduce((s, x) => s + x, 0) / trials;
  const pPos = totals.filter((x) => x >= 0).length / trials;
  const p10 = totals[Math.floor(trials * 0.1)];
  const p50 = totals[Math.floor(trials * 0.5)];
  const p90 = totals[Math.floor(trials * 0.9)];
  const weeks = days / 7;
  console.log(
    `${name.padEnd(34)} 自己損益/週 ${usd(sumOwn / trials / weeks).padStart(6)} | 祝い金/週 ${usd(sumCeleb / trials / weeks).padStart(6)} | ` +
    `12週合計 平均 ${usd(mean).padStart(8)} (P10 ${usd(p10)}, 中央 ${usd(p50)}, P90 ${usd(p90)}) | P(プラス) ${pct(pPos)}`,
  );
  return { mean, pPos };
}

// ---- 0. 単発コホート(馬10頭を1回買って走らせ切るだけ)の解析値 ----
{
  const r = 0.107;
  const pChamp = Math.pow(1 - r, NIGHTS_TO_CHAMPION);
  const cost = 10 * MINT_COST;
  // 二項分布の厳密計算
  let ev = 0, pPos = 0;
  const C = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); return c; };
  for (let k = 0; k <= 10; k++) {
    const p = C(10, k) * Math.pow(pChamp, k) * Math.pow(1 - pChamp, 10 - k);
    ev += p * (k * CHAMPION_PAYOUT - cost);
    if (k * CHAMPION_PAYOUT - cost >= 0) pPos += p;
  }
  console.log('=== 単発コホート(10頭・1,020 USDT・組織なし)の厳密値 ===');
  console.log(
    `チャンピオン率/頭 ${pct(pChamp)} | 期待損益 ${ev.toFixed(1)} USDT (${pct(ev / cost)}) | プラスで終わる確率 ${pct(pPos)}(6頭以上走破が必要)`,
  );
  console.log('');
}

// ---- 1. 継続プレイ+組織シナリオ(12週間) ----
console.log('=== 継続プレイ12週間(自分は常時10頭稼働・組織は常時稼働・BURN10.7%) ===');
console.log('tiers表記: [T1メンバー数×1人あたり馬数, T2…]');
runScenario('S0 組織なし', { tiers: [] });
runScenario('S1 直紹介4人×3頭', { tiers: [[4, 3]] });
runScenario('S2 直紹介12人×3頭', { tiers: [[12, 3]] });
runScenario('S3 直紹介24人×3頭', { tiers: [[24, 3]] });
runScenario('S4 直紹介24人×10頭', { tiers: [[24, 10]] });
runScenario('S5 24人が各2人紹介(深さ3・各3頭)', { tiers: [[24, 3], [48, 3], [96, 3]] });
runScenario('S6 フル組織(深さ7・計363人・各3頭)', {
  tiers: [[24, 3], [48, 3], [96, 3], [60, 3], [60, 3], [40, 3], [35, 3]],
});

console.log('');
console.log('=== 感度分析: S3(直紹介24人×3頭)のBURN率依存 ===');
runScenario('S3 @ BURN 8.0%(荒れ相場の下限)', { tiers: [[24, 3]], burnRate: 0.08 });
runScenario('S3 @ BURN 10.7%(NORMAL)', { tiers: [[24, 3]], burnRate: 0.107 });
runScenario('S3 @ BURN 13.5%(荒れ相場の上限)', { tiers: [[24, 3]], burnRate: 0.135 });

// ---- 2. 構成探索(フロンティア): P(12週でプラス)だけを圧縮出力 ----
function quickP({ tiers, trials = 2000, payoutModel = 'celebration092' }) {
  const rand = rng(11);
  let pos = 0;
  const totals = [];
  for (let t = 0; t < trials; t++) {
    const r = simulate({ rand, days: 84, playerSlots: 10, tiers, burnRate: 0.107, payoutModel });
    totals.push(r.total);
    if (r.total >= 0) pos++;
  }
  const mean = totals.reduce((s, x) => s + x, 0) / trials;
  return { p: pos / trials, mean };
}

console.log('');
console.log('=== 構成探索A: フラット組織(直紹介のみ・T1収入のみ) — P(12週でプラス) ===');
console.log('行=直紹介人数 / 列=1人あたり稼働馬数');
{
  const Ds = [8, 12, 16, 20, 24, 28, 32, 40, 48, 64];
  const Hs = [1, 2, 3, 5, 10];
  console.log('        ' + Hs.map((h) => `${h}頭`.padStart(8)).join(''));
  for (const d of Ds) {
    const cells = Hs.map((h) => pct(quickP({ tiers: [[d, h]] }).p).padStart(8));
    console.log(`${String(d).padStart(3)}人  ${cells.join('')}`);
  }
}

console.log('');
console.log('=== 構成探索B: 深さのある組織(枝分かれ2倍・各3頭) — P(12週でプラス) ===');
{
  const shapes = [
    ['直8→16→32(深さ3・56人)', [[8, 3], [16, 3], [32, 3]]],
    ['直12→24→48(深さ3・84人)', [[12, 3], [24, 3], [48, 3]]],
    ['直16→32→64(深さ3・112人)', [[16, 3], [32, 3], [64, 3]]],
    ['直24→48→96(深さ3・168人)', [[24, 3], [48, 3], [96, 3]]],
    ['直8を深さ5まで2倍(248人)', [[8, 3], [16, 3], [32, 3], [64, 3], [128, 3]]],
    ['直12を深さ5まで2倍(372人)', [[12, 3], [24, 3], [48, 3], [96, 3], [192, 3]]],
  ];
  for (const [name, tiers] of shapes) {
    const { p, mean } = quickP({ tiers });
    console.log(`${name.padEnd(30)} P(プラス) ${pct(p).padStart(6)} | 12週平均 ${usd(mean).padStart(7)} USDT`);
  }
}

console.log('');
console.log('=== 構成探索D: 支払いモデルの変遷比較(直紹介24人の組織・12週) ===');
console.log('021=BURN時に直接紹介者へ10 USDT(1段) / 074=BURN時に7ティア3/2/1 / 092=チャンピオン時に7ティア3/2/1(現行)');
{
  const shapes = [
    ['直紹介24人×各1頭', [[24, 1]]],
    ['直紹介24人×各2頭', [[24, 2]]],
    ['直紹介24人×各3頭', [[24, 3]]],
    ['直紹介24人×各10頭', [[24, 10]]],
  ];
  for (const [name, tiers] of shapes) {
    const o21 = quickP({ tiers, payoutModel: 'burn021' });
    const o74 = quickP({ tiers, payoutModel: 'burn074' });
    const o92 = quickP({ tiers, payoutModel: 'celebration092' });
    console.log(
      `${name.padEnd(16)} 021: P ${pct(o21.p).padStart(6)} (平均 ${usd(o21.mean).padStart(7)}) | ` +
      `074: P ${pct(o74.p).padStart(6)} (平均 ${usd(o74.mean).padStart(7)}) | ` +
      `092: P ${pct(o92.p).padStart(6)} (平均 ${usd(o92.mean).padStart(7)})`,
    );
  }
}

console.log('');
console.log('=== 構成探索C: 稼働率50%(半分が休眠)の現実チェック ===');
{
  const shapes = [
    ['直24人×3頭 → 実質12人×3頭', [[12, 3]]],
    ['直24人×10頭 → 実質12人×10頭', [[12, 10]]],
    ['直24→48→96(各3頭) → 実質半分', [[12, 3], [24, 3], [48, 3]]],
  ];
  for (const [name, tiers] of shapes) {
    const { p, mean } = quickP({ tiers });
    console.log(`${name.padEnd(32)} P(プラス) ${pct(p).padStart(6)} | 12週平均 ${usd(mean).padStart(7)} USDT`);
  }
}
