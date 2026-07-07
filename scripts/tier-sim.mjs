/**
 * Support Bonus tier-unlock Monte Carlo (Decision 074 follow-up).
 *
 * Question: if the unlock metric changes from DIRECT-referral volume to the
 * WHOLE SUBTREE volume, what thresholds keep the same difficulty as the
 * owner's field-tested direct thresholds [3001,5001,10001,30001,50001,70001]?
 *
 * Method: generate realistic referral trees (heavy-tailed recruiting),
 * assign per-user active-horse volumes, compute per-user metrics:
 *   direct     — sum of direct referrals' own volume (current rule)
 *   subAll     — entire subtree volume (all descendants)
 *   sub7       — subtree volume limited to 7 levels down (= payout depth)
 * Calibrate: for each tier, find the attainment rate (share of recruiting
 * users who reach it) under the DIRECT thresholds, then read the subtree
 * value at the same percentile => equivalent subtree threshold.
 * Also evaluate the "50% leg rule" (no single leg may contribute more than
 * half of the required threshold) attainment at those thresholds, and the
 * expected payout per burn (economics sanity).
 */

// ---------- deterministic RNG (mulberry32) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// offspring distribution (recruits per user) — heavy tail, mean ~1.0
function drawRecruits(r) {
  const u = r();
  if (u < 0.62) return 0;
  if (u < 0.80) return 1;
  if (u < 0.90) return 2;
  if (u < 0.95) return 3 + Math.floor(r() * 3);        // 3-5
  if (u < 0.988) return 6 + Math.floor(r() * 10);      // 6-15
  if (u < 0.998) return 16 + Math.floor(r() * 45);     // 16-60 (leaders)
  return 61 + Math.floor(r() * 340);                   // 61-400 (super leaders)
}

// per-user active horse volume (USDT)
const LADDER = [100, 110, 121, 133.1, 146.41, 161.05, 177.16];
function drawVolume(r) {
  const u = r();
  if (u < 0.35) return 0;                              // inactive / no horses
  let horses;
  if (u < 0.85) horses = 1 + Math.floor(r() * 3);      // 1-3
  else if (u < 0.98) horses = 4 + Math.floor(r() * 7); // 4-10
  else horses = 11 + Math.floor(r() * 40);             // 11-50 (whales)
  let v = 0;
  for (let i = 0; i < horses; i++) v += LADDER[Math.floor(r() * 7)];
  return v;
}

function buildNetwork(n, seed) {
  const r = rng(seed);
  const parent = new Int32Array(n).fill(-1);
  const queue = [];
  const rootCount = Math.max(1, Math.floor(n * 0.02)); // 2% organic roots
  for (let i = 0; i < rootCount && i < n; i++) queue.push(i);
  let next = rootCount;
  let qi = 0;
  while (next < n) {
    const p = qi < queue.length ? queue[qi++] : next - 1; // fallback chain
    const kids = drawRecruits(r);
    for (let k = 0; k < kids && next < n; k++) {
      parent[next] = p;
      queue.push(next);
      next++;
    }
    if (qi >= queue.length && next < n) { queue.push(next); parent[next] = p; next++; }
  }
  const vol = new Float64Array(n);
  for (let i = 0; i < n; i++) vol[i] = drawVolume(r);
  return { parent, vol, n };
}

function computeMetrics({ parent, vol, n }) {
  const direct = new Float64Array(n);
  const subAll = new Float64Array(n);
  const sub7 = new Float64Array(n);
  const depthCount = new Int32Array(n); // direct children
  const legOf = new Int32Array(n).fill(-1); // which direct-child leg (top ancestor below each ancestor) — computed per walk
  for (let i = 0; i < n; i++) {
    if (parent[i] >= 0) {
      direct[parent[i]] += vol[i];
      depthCount[parent[i]]++;
    }
    // walk up, adding vol[i] to every ancestor (subAll), 7 levels for sub7
    let a = parent[i];
    let d = 1;
    let child = i;
    while (a >= 0) {
      subAll[a] += vol[i];
      if (d <= 7) sub7[a] += vol[i];
      child = a;
      a = parent[a];
      d++;
      if (d > 200) break;
    }
  }
  // largest leg per user (by full subtree volume of each direct child)
  // legVol[c] for child c = subAll[c] + vol[c]
  const maxLeg = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    const p = parent[c];
    if (p >= 0) {
      const legVol = subAll[c] + vol[c];
      if (legVol > maxLeg[p]) maxLeg[p] = legVol;
    }
  }
  return { direct, subAll, sub7, maxLeg, depthCount };
}

function quantileOf(sortedArr, q) {
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(q * sortedArr.length)));
  return sortedArr[idx];
}

const DIRECT_THRESHOLDS = [0, 3001, 5001, 10001, 30001, 50001, 70001];
const AMOUNTS = [3, 2, 1, 1, 1, 1, 1];

function analyze(n, seeds) {
  // aggregate attainment + calibrated thresholds across seeds
  const agg = { attainDirect: Array(7).fill(0), thrAll: Array(7).fill(0), thr7: Array(7).fill(0), payout: {}, recruiters: 0, runs: 0 };
  for (const seed of seeds) {
    const net = buildNetwork(n, seed);
    const m = computeMetrics(net);
    // consider only users who recruited at least one person (others are all T1 anyway)
    const rec = [];
    for (let i = 0; i < n; i++) if (m.depthCount[i] > 0) rec.push(i);
    const directVals = rec.map((i) => m.direct[i]);
    const subAllVals = rec.map((i) => m.subAll[i]).sort((a, b) => a - b);
    const sub7Vals = rec.map((i) => m.sub7[i]).sort((a, b) => a - b);
    for (let t = 1; t < 7; t++) {
      const attain = directVals.filter((v) => v >= DIRECT_THRESHOLDS[t]).length / rec.length;
      agg.attainDirect[t] += attain;
      // same attainment quantile in subtree metrics
      agg.thrAll[t] += quantileOf(subAllVals, 1 - attain);
      agg.thr7[t] += quantileOf(sub7Vals, 1 - attain);
    }
    agg.recruiters += rec.length / n;
    agg.runs++;
  }
  for (let t = 1; t < 7; t++) {
    agg.attainDirect[t] /= agg.runs;
    agg.thrAll[t] /= agg.runs;
    agg.thr7[t] /= agg.runs;
  }
  agg.recruiters /= agg.runs;
  return agg;
}

function attainWithRule(m, rec, thr, useLegRule) {
  const out = Array(7).fill(0);
  for (const i of rec) {
    const v = m.sub7[i];
    for (let t = 1; t < 7; t++) {
      let ok;
      if (useLegRule) {
        const counted = Math.min(v, v - Math.max(0, m.maxLeg[i] - 0.5 * thr[t]));
        ok = counted >= thr[t];
      } else ok = v >= thr[t];
      if (ok) out[t]++;
    }
  }
  return out.map((c) => c / rec.length);
}

// payout economics: expected paid per burn under a rule
function payoutPerBurn(net, m, unlockOf) {
  const { parent, vol, n } = net;
  // burn victims ~ weighted by volume (more horses => more burns)
  let totalW = 0;
  for (let i = 0; i < n; i++) totalW += vol[i];
  const r = rng(4242);
  let paidSum = 0;
  const SAMPLES = 20000;
  for (let s = 0; s < SAMPLES; s++) {
    // sample victim by volume weight
    let x = r() * totalW;
    let v = 0;
    // (linear scan is slow; sample uniformly among volume>0 users instead — close enough)
    do { v = Math.floor(r() * n); } while (vol[v] === 0);
    let a = parent[v];
    let d = 1;
    while (a >= 0 && d <= 7) {
      if (unlockOf(a) >= d) paidSum += AMOUNTS[d - 1];
      a = parent[a];
      d++;
    }
  }
  return paidSum / SAMPLES;
}

function fmt(x) { return Math.round(x).toLocaleString('en-US'); }

for (const n of [2000, 20000, 100000]) {
  const seeds = [11, 22, 33];
  const a = analyze(n, seeds);
  console.log(`\n===== N=${n.toLocaleString()} (recruiters: ${(a.recruiters * 100).toFixed(1)}% of users) =====`);
  console.log('tier | direct-thr | attain(recruiters) | eq subALL thr | eq sub7 thr | multiplier(sub7/direct)');
  for (let t = 1; t < 7; t++) {
    const mult = a.thr7[t] / DIRECT_THRESHOLDS[t];
    console.log(
      `T${t + 1}   | ${fmt(DIRECT_THRESHOLDS[t]).padStart(7)} | ${(a.attainDirect[t] * 100).toFixed(3).padStart(7)}% | ${fmt(a.thrAll[t]).padStart(10)} | ${fmt(a.thr7[t]).padStart(10)} | x${mult.toFixed(1)}`,
    );
  }
  {
    const net2 = buildNetwork(n, 77);
    const m2 = computeMetrics(net2);
    const rec2 = [];
    for (let i = 0; i < n; i++) if (m2.depthCount[i] > 0) rec2.push(i);
    const plain = attainWithRule(m2, rec2, a.thr7, false);
    const withLeg = attainWithRule(m2, rec2, a.thr7, true);
    console.log('sub7到達率 at calibrated thr (rule無 / 50%legルール): ' +
      [1,2,3,4,5,6].map((t) => `T${t+1} ${(plain[t]*100).toFixed(2)}%/${(withLeg[t]*100).toFixed(2)}%`).join('  '));
  }
  // economics on one representative net
  const net = buildNetwork(n, 99);
  const m = computeMetrics(net);
  const unlockDirect = (i) => { const v = m.direct[i]; let u = 1; for (let t = 1; t < 7; t++) if (v >= DIRECT_THRESHOLDS[t]) u = t + 1; return u; };
  // calibrated (rounded) sub7 thresholds from this run's aggregate
  const thr7 = a.thr7.map((x) => x);
  const unlockSub7 = (i) => { const v = m.sub7[i]; let u = 1; for (let t = 1; t < 7; t++) if (v >= thr7[t]) u = t + 1; return u; };
  const unlockSub7Leg = (i) => {
    const v = m.sub7[i]; let u = 1;
    for (let t = 1; t < 7; t++) {
      // 50% leg rule: max leg may contribute at most half the requirement
      const counted = Math.min(v, v - Math.max(0, m.maxLeg[i] - 0.5 * thr7[t]));
      if (counted >= thr7[t]) u = t + 1;
    }
    return u;
  };
  console.log(`payout/burn (cap 10): direct=${payoutPerBurn(net, m, unlockDirect).toFixed(2)}  sub7=${payoutPerBurn(net, m, unlockSub7).toFixed(2)}  sub7+50%leg=${payoutPerBurn(net, m, unlockSub7Leg).toFixed(2)}`);
}
console.log('\ndone');
