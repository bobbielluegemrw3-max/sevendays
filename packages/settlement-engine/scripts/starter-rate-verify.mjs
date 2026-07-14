/* スターターレート(Decision 099候補)の採用前検証(オーナー指示: じっくり検証)
 *
 * 検証A: 昇格の崖 — 組織が成長してレートしきい値をまたぐ瞬間に、
 *        週次収入が凹まないか(成長軌道の決定論的期待値カーブ)
 * 検証B: プール安全性 — 現実的なネットワーク全体で、1チャンピオンあたりの
 *        平均支払いが予算(積立5.40/頭 ÷ チャンピオン率45.3% = 11.92)を
 *        超えないか。特に「小規模メンバーが親のチャンピオンは常に高単価」
 *        という長期構造リスクを母集団シミュレーションで測る。
 *
 * 実行: node packages/settlement-engine/scripts/starter-rate-verify.mjs
 */

const BURN = 0.107;
const P_CHAMP = Math.pow(1 - BURN, 7); // 0.4529
const CHAMP_PER_SLOT_WK = (P_CHAMP / 5.113) * 7; // 0.620
const AVG_PRICE = 129.84; // 定常状態の1稼働枠の平均現在価値(PRICE_TABLE加重平均)
const BUDGET_PER_CHAMPION = 5.40 / P_CHAMP; // 11.92 — これを平均支払いが超えたら不採用

const ORG_THRESHOLDS = [0, 0, 10_000, 20_000, 50_000, 250_000, 400_000, 600_000];
const DIRECT_THRESHOLDS = [0, 0, 0, 0, 0, 30_001, 50_001, 70_001];
const DEEP_AMOUNTS = [0, 0, 2, 1, 1, 1, 1, 1]; // T2〜T7(不変)

// 候補レート: 段階表(しきい値リスト)または関数。
const STEP = (steps) => (v) => {
  for (const [below, rate] of steps) if (v < below) return rate;
  return steps[steps.length - 1][1];
};
// C5 なめらか型: 単価×組織規模の積が絶対に減らない境界(双曲線)。
// 組織18,750まで8、その先は 150,000/組織(下限3=組織5万で到達)。
// 性質: T1収入は組織成長で「増えるか一定」— 昇格の崖が数学的に存在しない。
const SMOOTH = (v) => (v < 18_750 ? 8 : Math.max(3, Math.round((150_000 / v) * 100) / 100));

const RATE_TABLES = {
  'C0 現行(T1=3固定)': STEP([[Infinity, 3]]),
  'C1 提案 8/5/3 @2万/5万': STEP([[20_000, 8], [50_000, 5], [Infinity, 3]]),
  'C3 細段 8..3 @1万刻み': STEP([[10_000, 8], [20_000, 7], [30_000, 6], [40_000, 5], [50_000, 4], [Infinity, 3]]),
  'C5 なめらか(収入不減保証)': SMOOTH,
};

function t1Rate(table, orgVolume) {
  return table(orgVolume);
}

function unlockedTiers(orgVolume, directVolume) {
  let u = 1;
  for (let t = 2; t <= 7; t++) {
    if (orgVolume >= ORG_THRESHOLDS[t] && directVolume >= DIRECT_THRESHOLDS[t]) u = t;
    else break;
  }
  return u;
}

function pct(x) { return `${(x * 100).toFixed(1)}%`; }
function usd(x) { return x.toLocaleString('en-US', { maximumFractionDigits: 0 }); }

/* ============================================================
 * 検証A: 昇格の崖(成長軌道)
 * 組織形の3アーキタイプを0→40週成長させ、週次の祝い金収入カーブを描く。
 * 「前週より下がる週」があれば崖 — その位置と深さを記録する。
 * ============================================================ */
console.log('=== 検証A: 昇格の崖(成長する組織の週次収入カーブ・各メンバー3頭) ===');

const GROWTH = {
  'フラット型(直紹介が増え続ける)': { leaderPerWk: 1.5, cap: 80, memberRecruit: 0.005 },
  'バランス型(直紹介+下も育つ)': { leaderPerWk: 1.0, cap: 30, memberRecruit: 0.03 },
  '深さ型(直紹介少・下が育つ)': { leaderPerWk: 0.15, cap: 6, memberRecruit: 0.09 },
};

for (const [gName, g] of Object.entries(GROWTH)) {
  console.log(`\n-- ${gName} --`);
  for (const [tName, table] of Object.entries(RATE_TABLES)) {
    // ティア別メンバー数の決定論的成長
    const m = [0, 0, 0, 0, 0, 0, 0, 0];
    let worstDip = 0; // 最大の週次下落率
    let dipAtVol = 0;
    let prevIncome = 0;
    let final = 0;
    for (let wk = 1; wk <= 40; wk++) {
      m[1] = Math.min(g.cap, m[1] + g.leaderPerWk);
      for (let d = 6; d >= 1; d--) m[d + 1] += m[d] * g.memberRecruit * 7;
      const slots = m.map((x) => x * 3);
      const orgVol = slots.slice(1, 8).reduce((s, x) => s + x, 0) * AVG_PRICE;
      const directVol = slots[1] * AVG_PRICE;
      const u = unlockedTiers(orgVol, directVol);
      const rate1 = t1Rate(table, orgVol);
      let income = 0;
      for (let d = 1; d <= 7; d++) {
        if (d > u) continue;
        const amt = d === 1 ? rate1 : DEEP_AMOUNTS[d];
        income += amt * slots[d] * CHAMP_PER_SLOT_WK;
      }
      if (prevIncome > 0 && income < prevIncome) {
        const dip = (prevIncome - income) / prevIncome;
        if (dip > worstDip) { worstDip = dip; dipAtVol = orgVol; }
      }
      prevIncome = income;
      final = income;
    }
    const dipTxt = worstDip > 0.001
      ? `最大の凹み ${pct(worstDip)}(組織 ${usd(dipAtVol)} 時点)`
      : '凹みなし(単調増加)';
    console.log(`  ${tName.padEnd(28)} 40週後の収入 ${usd(final).padStart(5)}/週 | ${dipTxt}`);
  }
}

/* ============================================================
 * 検証B: プール安全性(母集団シミュレーション)
 * 現実的な配置ツリーの母集団を生成し、チャンピオン1頭あたりの
 * 平均支払い(UNCLAIMED滞留を除く実支払い)を測る。
 * ============================================================ */
console.log('\n=== 検証B: プール安全性 — 平均支払い/チャンピオン(予算 11.92) ===');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 母集団を生成: 配置ツリー+保有枠。leaderBias=リーダー系に付く確率。 */
function buildPopulation(rand, { n, leaderFrac, leaderBias, orphanFrac, leaderSlots, memberSlotsMean }) {
  const parent = new Array(n).fill(-1); // -1 = 運営ルート直下(実プレイヤー祖先なし)
  const isLeader = new Array(n).fill(false);
  const slots = new Array(n).fill(0);
  const leaders = [];
  for (let i = 0; i < n; i++) {
    isLeader[i] = rand() < leaderFrac;
    if (isLeader[i]) leaders.push(i);
    slots[i] = isLeader[i]
      ? leaderSlots
      : Math.max(1, Math.round(-Math.log(1 - rand()) * memberSlotsMean)); // 指数分布
    if (i === 0) continue;
    if (rand() < orphanFrac || leaders.length === 0) {
      parent[i] = -1; // 運営直下
    } else if (rand() < leaderBias) {
      // リーダーの組織のどこかに配置(リーダー本人 or その配下からランダム)
      const L = leaders[Math.floor(rand() * leaders.length)];
      // リーダー配下を辿って浅めに配置(幾何分布で深さ選択)
      let node = L;
      while (rand() < 0.55) {
        const kids = [];
        for (let j = 0; j < i; j++) if (parent[j] === node) kids.push(j);
        if (kids.length === 0) break;
        node = kids[Math.floor(rand() * kids.length)];
      }
      parent[i] = node;
    } else {
      parent[i] = Math.floor(rand() * i); // 既存の誰かの直下
    }
  }
  return { parent, slots, n };
}

/** 各ユーザーの組織ボリューム(配下7段)と直接ボリュームを1パスで集計 */
function volumes(pop) {
  const orgVol = new Array(pop.n).fill(0);
  const directVol = new Array(pop.n).fill(0);
  for (let i = 0; i < pop.n; i++) {
    const v = pop.slots[i] * AVG_PRICE;
    let p = pop.parent[i];
    let d = 1;
    while (p >= 0 && d <= 7) {
      orgVol[p] += v;
      if (d === 1) directVol[p] += v;
      p = pop.parent[p];
      d += 1;
    }
  }
  return { orgVol, directVol };
}

/** チャンピオン1頭あたりの平均支払い(枠数加重)。運営直下(-1)より上は不在扱い。 */
function avgPayoutPerChampion(pop, table) {
  const { orgVol, directVol } = volumes(pop);
  let totalWeight = 0;
  let totalPaid = 0;
  let totalT1 = 0;
  for (let i = 0; i < pop.n; i++) {
    const w = pop.slots[i]; // チャンピオン発生確率∝稼働枠
    let paid = 0;
    let p = pop.parent[i];
    let d = 1;
    while (p >= 0 && d <= 7) {
      const u = unlockedTiers(orgVol[p], directVol[p]);
      if (d <= u) {
        const amt = d === 1 ? t1Rate(table, orgVol[p]) : DEEP_AMOUNTS[d];
        paid += amt;
        if (d === 1) totalT1 += amt * w;
      }
      p = pop.parent[p];
      d += 1;
    }
    totalPaid += paid * w;
    totalWeight += w;
  }
  return { avg: totalPaid / totalWeight, avgT1: totalT1 / totalWeight };
}

const POPULATIONS = {
  'ローンチ期(500人・孤児4割)': { n: 500, leaderFrac: 0.02, leaderBias: 0.5, orphanFrac: 0.4, leaderSlots: 10, memberSlotsMean: 2 },
  '成長期(5,000人・組織化進む)': { n: 5000, leaderFrac: 0.02, leaderBias: 0.65, orphanFrac: 0.2, leaderSlots: 10, memberSlotsMean: 2.5 },
  '成熟期(20,000人・深い組織)': { n: 20000, leaderFrac: 0.015, leaderBias: 0.75, orphanFrac: 0.1, leaderSlots: 15, memberSlotsMean: 3 },
};

for (const [pName, params] of Object.entries(POPULATIONS)) {
  const rand = rng(99);
  const pop = buildPopulation(rand, params);
  console.log(`\n-- ${pName} --`);
  for (const [tName, table] of Object.entries(RATE_TABLES)) {
    const { avg, avgT1 } = avgPayoutPerChampion(pop, table);
    const perMint = avg * P_CHAMP;
    const verdict = perMint <= 5.4 ? 'OK' : perMint <= 5.4 * 1.05 ? '△(アイテム代収入が頼り)' : '✗ 予算超過';
    console.log(
      `  ${tName.padEnd(28)} 平均支払い/頭 ${avg.toFixed(2).padStart(5)}(うちT1 ${avgT1.toFixed(2)}) | ミント換算 ${perMint.toFixed(2)} vs 積立5.40 → ${verdict}`,
    );
  }
}

console.log('\n注: 運営ルート直下(孤児)の祖先チェーンは「不在」として支払いゼロ換算。');
console.log('    実際はDecision 090で運営チェーンが受け取る=プールから出るが運営に戻る。');
console.log('    ここでは保守側(プール外流出のみ)と楽観側の中間ではなく、実プレイヤーへの');
console.log('    流出のみを予算と比較している(運営チェーン分は実質的な滞留)。');
