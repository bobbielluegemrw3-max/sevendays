// サポートプール モンテカルロシミュレーション(Decision 092候補の破綻検証)
//
// 設計: BURN発生 → +10 USDT をプールへ積立(入口・現行と同じ資金源)
//       チャンピオン誕生(7晩走破)→ プールから上位7ティアへ計10 USDT支払い(出口)
//
// エンジン忠実度:
//   - 夜間BURN数 = floor(rate × 出走頭数)  (floor則・憲法どおり)
//   - rate = 基準率(NORMAL 10.7%) ± 2.7pt の一様対称ジッター(ADR-012)
//     器 [8.0%, 13.5%] — 対称なので平均 = 基準率
//   - BURN対象は年齢(DAY)に無関係にランキング下位 → 年齢比例で無作為配分
//   - 馬は7晩生き残ると DAY7_CLEARED(チャンピオン)
//
// 保守的仮定(実際はこれより安全):
//   - チャンピオン1頭につき満額10を支払う(ティア未解放分もすべて支払われる前提。
//     実際は未達分がプールに残るため出金はこれより少ない)
//   - アイテム代からの拠出(Decision 078)は収入に数えない
//
// 実行: node packages/settlement-engine/scripts/support-pool-sim.mjs
//       (乱数は明示シードのxorshiftで再現可能)

const BASE_RATE = 0.107; // NORMAL
const AMPLITUDE = 0.027;
const ENVELOPE = { min: 0.08, max: 0.135 };
const INFLOW_PER_BURN = 10;
const OUTFLOW_PER_CHAMPION = 10;

// 再現可能な乱数(xorshift128)
function makeRng(seed) {
  let x = 123456789 ^ seed, y = 362436069, z = 521288629, w = 88675123 + seed;
  return () => {
    const t = x ^ ((x << 11) >>> 0);
    x = y; y = z; z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return w / 4294967296;
  };
}

function nightlyRate(rng) {
  const cap = Math.min(AMPLITUDE, ENVELOPE.max - BASE_RATE, BASE_RATE - ENVELOPE.min);
  return BASE_RATE + (2 * rng() - 1) * cap;
}

/** 1トライアル: 日次ミント計画 mintsPerNight(night) に沿って nights 晩回す。 */
function simulate(rng, nights, mintsPerNight) {
  // ages[k] = 今夜が k 晩目のレースになる馬の頭数 (k=1..7)
  const ages = [0, 0, 0, 0, 0, 0, 0, 0]; // index 1..7
  let pool = 0;
  let minPool = 0;
  let burnsTotal = 0, champsTotal = 0, minted = 0;
  let shortfallNights = 0; // その夜の支払いが残高を超えた夜の数(Rule A: 立て替え計上)

  for (let night = 1; night <= nights; night++) {
    // 今夜Day0ミント(今夜は走らず、明日から1晩目)
    const mints = mintsPerNight(night, rng);
    minted += mints;

    // 今夜の出走
    const n = ages.reduce((a, b) => a + b, 0);
    if (n > 0) {
      const rate = nightlyRate(rng);
      let burns = Math.floor(n * rate);
      burnsTotal += burns;
      pool += burns * INFLOW_PER_BURN;

      // BURNを年齢グループへ無作為配分(重み=頭数の超幾何的抽出)
      const burned = [0, 0, 0, 0, 0, 0, 0, 0];
      let remaining = n;
      for (let k = 1; k <= 7 && burns > 0; k++) {
        // 逐次二項近似の代わりに正確な逐次超幾何抽出
        let take = 0;
        for (let i = 0; i < ages[k]; i++) {
          if (burns - take <= 0) break;
          // 残りburnsを残り頭数から引く確率
          if (rng() < (burns - take) / (remaining - i)) take++;
        }
        burned[k] = take;
        burns -= take;
        remaining -= ages[k];
      }

      // 7晩目を生き残った馬 = チャンピオン
      const champions = ages[7] - burned[7];
      champsTotal += champions;
      const payout = champions * OUTFLOW_PER_CHAMPION;
      if (payout > pool) shortfallNights++;
      pool -= payout; // Rule A: 満額支払い(不足は負残高=必要シード額の計測)
      if (pool < minPool) minPool = pool;

      // 加齢
      for (let k = 7; k >= 2; k--) ages[k] = ages[k - 1] - burned[k - 1];
      ages[1] = 0;
    }
    ages[1] += mints;
  }
  return { pool, minPool, burnsTotal, champsTotal, minted, shortfallNights };
}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function runScenario(name, trials, nights, mintsFn) {
  const finals = [], mins = [], shorts = [];
  let burns = 0, champs = 0, minted = 0;
  for (let t = 0; t < trials; t++) {
    const rng = makeRng(t * 7919 + 17);
    const r = simulate(rng, nights, mintsFn);
    finals.push(r.pool);
    mins.push(r.minPool);
    shorts.push(r.shortfallNights);
    burns += r.burnsTotal; champs += r.champsTotal; minted += r.minted;
  }
  const shortTrials = shorts.filter((s) => s > 0).length;
  console.log(`\n== ${name} (${trials}トライアル × ${nights}晩) ==`);
  console.log(`  平均ミント/トライアル: ${(minted / trials).toFixed(0)}頭  BURN率実測: ${(burns / minted * 100).toFixed(1)}%  チャンピオン率実測: ${(champs / minted * 100).toFixed(1)}%`);
  console.log(`  最終プール残高   中央値 ${pct(finals, 0.5).toFixed(0)}  5%点 ${pct(finals, 0.05).toFixed(0)}  最悪 ${Math.min(...finals).toFixed(0)}`);
  console.log(`  期間中最低残高   中央値 ${pct(mins, 0.5).toFixed(0)}  5%点 ${pct(mins, 0.05).toFixed(0)}  最悪 ${Math.min(...mins).toFixed(0)}`);
  console.log(`  不足発生: ${shortTrials}/${trials}トライアル (${(shortTrials / trials * 100).toFixed(2)}%)  ※最悪の「期間中最低残高」の絶対値 = 事前に入れておけば絶対に不足しないシード額`);
  return { worstMin: Math.min(...mins), shortRate: shortTrials / trials };
}

const T = 20000;

// 1. 超小規模(いまのテストネット): 3ユーザーが計5頭/晩ペース → floor則でBURN 0が頻発する危険ゾーン
runScenario('S1: 超小規模テスト(5頭/晩 × 90晩)', T, 90, () => 5);

// 2. 極小コホート1回きり: 13頭買って終わり(明日の実テストそのもの)
runScenario('S2: 単発13頭のみ(30晩)', T, 30, (n) => (n === 1 ? 13 : 0));

// 3. ローンチ小規模: 30頭/晩 × 180晩
runScenario('S3: ローンチ小(30頭/晩 × 180晩)', T, 180, () => 30);

// 4. 中規模: 100頭/晩 × 365晩
runScenario('S4: 中規模(100頭/晩 × 365晩)', Math.min(T, 5000), 365, () => 100);

// 5. 需要急停止: 100頭/晩 × 60晩 → 以後0(旧経済を殺したシナリオ)
runScenario('S5: 需要急停止(100頭/晩×60晩→0、計120晩)', T, 120, (n) => (n <= 60 ? 100 : 0));

// 6. 大規模: 1000頭/晩 × 365晩
runScenario('S6: 大規模(1000頭/晩 × 365晩)', 2000, 365, () => 1000);

// 7. ランダム需要(毎晩0〜60頭の一様乱数・180晩)
runScenario('S7: 不安定需要(0〜60頭/晩一様 × 180晩)', T, 180, (n, rng) => Math.floor(rng() * 61));

console.log('\n(参考)理論値: 馬1頭あたり 入金 10×P(burn)≈5.47 / 出金 10×P(champ)≈4.53 → 期待純増 ≈ +0.94 USDT/頭');
