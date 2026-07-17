/**
 * FUN改修 V2 設計モデルシム(FUN_V2_PLAN.md §5.5)
 *
 * まだ実装されていないV2ルール(1日2レースLV制・総合値0-100・調教の上下ロール)の
 * 設計数値を決めるためのモンテカルロモデル。実エンジンは使わない(存在しないルール
 * だから)。既存経済v1.1の器(価格ラダー1.1^k・BURN率8.0〜13.5%・買戻し200・
 * P2P手数料2%)は不変の前提。
 *
 * 答える問い:
 *  Q1 ユニットエコノミクス: 1ライン(ミント→BURN or チャンピオン)あたりの運営損益は
 *     レース回数(1日1回 vs 2回)で変わるか(結論の予想: 変わらない — 変わるのは速度)
 *  Q2 人口動態: 出走頭数を一定に保つのに必要な1日あたりミント数(1回制 vs 2回制)
 *  Q3 総合値と腕前: 調教レンジ設計で「50→89に化ける」曲線と、戦略差(適当/攻略/完璧)
 *     がチャンピオン率にどれだけ効くか。安全圏バッジの誠実性(SAFE帯のBURN率)
 *
 * 実行: node packages/settlement-engine/scripts/fun-v2-model-sim.mjs
 * 乱数: 固定シード(mulberry32)— 再現可能。
 */

// ---------------------------------------------------------------------------
const seedRandom = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let rnd = seedRandom(20260717);
const uni = (min, max) => min + rnd() * (max - min);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---- 経済の器(不変・v1.1) ------------------------------------------------
const PRICE = [100, 110, 121, 133.1, 146.41, 161.05, 177.16]; // LV0..6
const MINT_SPEND = 102;          // 100 + ミント手数料2
const CHAMPION_BUYBACK = 200;    // LV7走破
const P2P_FEE = 0.02;            // 売り手2%
const BURN_MIN = 0.08, BURN_MAX = 0.135; // 率の器(ADR-012ジッター)
const RACES_TO_CHAMPION = 7;     // LV1..7 = 7レース(ケイデンス非依存)
const SUPPORT_PER_CHAMPION = 12; // 祝い金の概算(T1..T7、スターターレート込み保守値)

// ---- Q1: ユニットエコノミクス ---------------------------------------------
function q1(lines = 200_000, resalesPerLife = 1.0) {
  let operator = 0, champions = 0, burnedAt = new Array(8).fill(0);
  for (let i = 0; i < lines; i++) {
    operator += MINT_SPEND;
    let lv = 0, alive = true;
    while (alive && lv < RACES_TO_CHAMPION) {
      const b = uni(BURN_MIN, BURN_MAX);
      if (rnd() < b) { alive = false; burnedAt[lv]++; break; }
      lv++;
    }
    // P2P再販(ライン中に平均 resalesPerLife 回・価格は生存LVの中央値近辺)
    const resales = rnd() < resalesPerLife % 1 ? Math.ceil(resalesPerLife) : Math.floor(resalesPerLife);
    for (let s = 0; s < resales; s++) operator += PRICE[Math.min(6, Math.max(1, Math.floor(uni(1, lv + 1))))] * P2P_FEE;
    if (alive) { champions++; operator -= CHAMPION_BUYBACK + SUPPORT_PER_CHAMPION; }
  }
  return {
    championRate: champions / lines,
    operatorPerLine: operator / lines,
    operatorPctOfMint: (operator / lines / MINT_SPEND) * 100,
    burnedAt,
  };
}

// ---- Q2: 人口動態(定常状態に必要なミント/日) ------------------------------
function q2(fieldTarget = 1000, racesPerDay = 2, days = 400) {
  // 年齢構造モデル: cohort[lv] = そのLVで次のレースを待つ頭数
  let cohort = new Array(RACES_TO_CHAMPION).fill(0);
  cohort[0] = fieldTarget;
  let mintsPerDayNeeded = 0, samples = 0;
  for (let d = 0; d < days; d++) {
    let mintedToday = 0;
    for (let r = 0; r < racesPerDay; r++) {
      const field = cohort.reduce((a, b) => a + b, 0);
      const b = (BURN_MIN + BURN_MAX) / 2;
      const next = new Array(RACES_TO_CHAMPION).fill(0);
      for (let lv = 0; lv < RACES_TO_CHAMPION; lv++) {
        const survivors = cohort[lv] * (1 - b);
        if (lv + 1 < RACES_TO_CHAMPION) next[lv + 1] += survivors;
        // lv+1 === 7 はチャンピオン退場
      }
      // 定常維持: 目標頭数まで LV0 を補充(=そのレースの新規ミント)
      const fieldAfter = next.reduce((a, b) => a + b, 0);
      const mint = Math.max(0, fieldTarget - fieldAfter);
      next[0] += mint;
      mintedToday += mint;
      cohort = next;
      void field;
    }
    if (d > 50) { mintsPerDayNeeded += mintedToday; samples++; } // 定常後のみ集計
  }
  return { mintsPerDay: mintsPerDayNeeded / samples };
}

// ---- Q3: 総合値と腕前(調教レンジの設計) -----------------------------------
// 調教ロールの設計パラメータ(この値そのものが設計のアウトプット)
const TRAIN = {
  // 無料調教: 公開レンジ。隠れた好みに合うと上振れ・外すと下振れ
  free: {
    random:   () => uni(-4, +5),                       // 適当に選ぶ(好み無視・期待値+0.5)
    informed: () => (rnd() < 0.6 ? uni(+3, +8) : uni(-4, +2)),  // コミュニティ攻略(6割正解)
    perfect:  () => (rnd() < 0.9 ? uni(+5, +9) : uni(-2, +3)),  // ほぼ完璧(9割正解)
  },
  // 有料アイテム: 予報(的中70%)を読む読めるリスク。使用率はユーザー次第
  item: { hit: () => uni(+4, +8), miss: () => uni(-7, -3), forecastAcc: 0.7 },
  // 毎レースの自然減衰(インフレ防止・「維持にも手入れが要る」)
  decayPerRace: 2.0,
  // ソフトキャップ: 85超は上昇分を半減(90台を「特別」に保つ)
  softCap: 85, softCapFactor: 0.5,
};

function applyGain(v, gain) {
  if (gain <= 0) return v + gain;
  if (v >= TRAIN.softCap) return v + gain * TRAIN.softCapFactor;
  const headroom = TRAIN.softCap - v;
  return gain <= headroom ? v + gain : TRAIN.softCap + (gain - headroom) * TRAIN.softCapFactor;
}

function q3(horses = 100_000, strategy = 'random', useItems = false, mintRange = [40, 75]) {
  // 分布はまず母集団を作り、レースごとに「相対」でBURN(下位10.75%±)させる
  let field = [];
  for (let i = 0; i < horses; i++) field.push({ v: uni(mintRange[0], mintRange[1]), lv: 0, alive: true, s: strategy });
  const bandStats = { SAFE: { n: 0, burned: 0 }, MID: { n: 0, burned: 0 }, RISK: { n: 0, burned: 0 } };
  let burned = 0;
  for (let race = 0; race < RACES_TO_CHAMPION; race++) {
    const alive = field.filter((h) => h.alive);
    // 調教ロール(戦略ごと)+アイテム+減衰
    for (const h of alive) {
      h.v = applyGain(h.v, TRAIN.free[h.s]());
      h.v -= TRAIN.decayPerRace;
      const wantsItem = useItems === true || (useItems === 'byStrategy' && h.items);
      if (wantsItem) {
        const hit = rnd() < TRAIN.item.forecastAcc;
        h.v = applyGain(h.v, hit ? TRAIN.item.hit() : 0) + (hit ? 0 : TRAIN.item.miss());
      }
      h.v = Math.max(0, Math.min(100, h.v));
    }
    // 安全圏バンド(表示と同じ定義: 上位40%=SAFE/下位25%=RISK)
    const sorted = alive.slice().sort((a, b) => b.v - a.v);
    const safeCut = Math.ceil(sorted.length * 0.4);
    const riskCut = sorted.length - Math.ceil(sorted.length * 0.25);
    sorted.forEach((h, idx) => { h.band = idx < safeCut ? 'SAFE' : idx >= riskCut ? 'RISK' : 'MID'; });
    // スコア=総合値+当日条件(±4)+運(±3)。下位 floor(n×率) がBURN
    const b = uni(BURN_MIN, BURN_MAX);
    const scored = alive.map((h) => ({ h, score: h.v + uni(-4, 4) + uni(-3, 3) }));
    scored.sort((a, b2) => a.score - b2.score);
    const slots = Math.floor(alive.length * b);
    for (let k = 0; k < scored.length; k++) {
      const { h } = scored[k];
      bandStats[h.band].n++;
      if (k < slots) { h.alive = false; burned++; bandStats[h.band].burned++; }
      else h.lv++;
    }
  }
  const champs = field.filter((h) => h.alive);
  const values = champs.map((h) => h.v).sort((a, b) => a - b);
  const pct = (p) => values[Math.floor(values.length * p)] ?? 0;
  return {
    championRate: champs.length / horses,
    finalValueP50: pct(0.5), finalValueP90: pct(0.9),
    reach85: champs.filter((h) => h.v >= 85).length / horses,
    bandBurnPct: Object.fromEntries(
      Object.entries(bandStats).map(([k, s]) => [k, s.n ? ((s.burned / s.n) * 100).toFixed(2) + '%' : '-']),
    ),
  };
}

// ---------------------------------------------------------------------------
const f2 = (n) => Number(n).toFixed(2);
console.log('=== FUN V2 モデルシム(FUN_V2_PLAN §5.5) ===\n');

console.log('--- Q1 ユニットエコノミクス(1ライン=ミント→結末) ---');
for (const resale of [0.5, 1.0, 1.5]) {
  rnd = seedRandom(11 + resale * 10);
  const r = q1(200_000, resale);
  console.log(
    `再販${resale}回/生涯: チャンピオン率=${(r.championRate * 100).toFixed(1)}% ` +
    `運営損益/ライン=${f2(r.operatorPerLine)}$ (ミント比${f2(r.operatorPctOfMint)}%)`,
  );
}
console.log('※レース回数(1日1回/2回)はラインの数学に影響しない — 変わるのは完走までの日数(7日→3.5日)と回転速度\n');

console.log('--- Q2 定常人口に必要なミント/日(出走1,000頭を維持) ---');
for (const rpd of [1, 2]) {
  rnd = seedRandom(22 + rpd);
  const r = q2(1000, rpd);
  console.log(`1日${rpd}レース: 必要ミント ≈ ${f2(r.mintsPerDay)}頭/日`);
}
console.log('');

console.log('--- Q3 総合値と腕前(ミント幅40-75・7レース・減衰1.5/レース) ---');
for (const [label, strategy, items] of [
  ['適当(攻略なし・アイテムなし)', 'random', false],
  ['攻略済み(正解率6割・アイテムなし)', 'informed', false],
  ['攻略済み+アイテム(予報70%)', 'informed', true],
  ['ほぼ完璧+アイテム', 'perfect', true],
]) {
  rnd = seedRandom(33);
  const r = q3(100_000, strategy, items);
  console.log(
    `${label}: チャンピオン率=${(r.championRate * 100).toFixed(1)}% ` +
    `完走時総合値 P50=${f2(r.finalValueP50)} P90=${f2(r.finalValueP90)} ` +
    `85+到達=${(r.reach85 * 100).toFixed(1)}%`,
  );
  console.log(`  安全圏の誠実性(レースごとのBURN率): SAFE=${r.bandBurnPct.SAFE} MID=${r.bandBurnPct.MID} RISK=${r.bandBurnPct.RISK}`);
}
console.log('\n※Q3の調教レンジ定数(TRAIN)がそのまま設計値の叩き台。数値はFUN_V2_PLAN §5.5に記録する。');


// ---- Q4: 混合母集団(同じ夜に上手い人と適当な人が混ざる現実) ----------------
function q4(horses = 120_000) {
  const mix = [
    { s: 'random', items: false, share: 0.55, label: '適当' },
    { s: 'informed', items: false, share: 0.25, label: '攻略(無課金)' },
    { s: 'informed', items: true, share: 0.15, label: '攻略+アイテム' },
    { s: 'perfect', items: true, share: 0.05, label: '完璧+アイテム' },
  ];
  let field = [];
  for (const m of mix) {
    const n = Math.round(horses * m.share);
    for (let i = 0; i < n; i++) field.push({ v: uni(40, 75), lv: 0, alive: true, s: m.s, items: m.items, label: m.label });
  }
  for (let race = 0; race < RACES_TO_CHAMPION; race++) {
    const alive = field.filter((h) => h.alive);
    for (const h of alive) {
      h.v = applyGain(h.v, TRAIN.free[h.s]());
      h.v -= TRAIN.decayPerRace;
      if (h.items) {
        const hit = rnd() < TRAIN.item.forecastAcc;
        h.v = applyGain(h.v, hit ? TRAIN.item.hit() : 0) + (hit ? 0 : TRAIN.item.miss());
      }
      h.v = Math.max(0, Math.min(100, h.v));
    }
    const b = uni(BURN_MIN, BURN_MAX);
    const scored = alive.map((h) => ({ h, score: h.v + uni(-4, 4) + uni(-3, 3) }));
    scored.sort((a, b2) => a.score - b2.score);
    const slots = Math.floor(alive.length * b);
    scored.forEach(({ h }, k) => { if (k < slots) h.alive = false; else h.lv++; });
  }
  const byLabel = {};
  for (const m of mix) byLabel[m.label] = { n: 0, champ: 0, v: [] };
  for (const h of field) {
    const st = byLabel[h.label];
    st.n++;
    if (h.alive) { st.champ++; st.v.push(h.v); }
  }
  console.log('--- Q4 混合母集団(適当55%/攻略25%/攻略+item15%/完璧+item5%) ---');
  for (const [label, st] of Object.entries(byLabel)) {
    st.v.sort((a, b) => a - b);
    const p50 = st.v[Math.floor(st.v.length * 0.5)] ?? 0;
    console.log(
      `${label}: チャンピオン率=${((st.champ / st.n) * 100).toFixed(1)}% 完走時総合値P50=${p50.toFixed(1)} ` +
      `85+到達=${((st.v.filter((x) => x >= 85).length / st.n) * 100).toFixed(1)}%`,
    );
  }
}
rnd = seedRandom(44);
q4();
console.log('');

// ---- Q5 「50の馬を89に化けさせる」物語の実現性 ------------------------------
function q5(runs = 50_000) {
  let reach85 = 0, champAnd85 = 0;
  for (let i = 0; i < runs; i++) {
    let v = 50, alive = true;
    for (let race = 0; race < RACES_TO_CHAMPION; race++) {
      v = applyGain(v, TRAIN.free.perfect());
      v -= TRAIN.decayPerRace;
      const hit = rnd() < TRAIN.item.forecastAcc;
      v = applyGain(v, hit ? TRAIN.item.hit() : 0) + (hit ? 0 : TRAIN.item.miss());
      v = Math.max(0, Math.min(100, v));
      // 混合母集団では完璧プレイの per-race burn ≈ 4%(Q4結果に整合する概算)
      if (rnd() < 0.04) { alive = false; break; }
    }
    if (v >= 85) { reach85++; if (alive) champAnd85++; }
  }
  console.log('--- Q5 50スタート×完璧プレイの「化ける」物語 ---');
  console.log(`85+到達(生死問わず)=${((reach85 / runs) * 100).toFixed(1)}% / 85+かつチャンピオン=${((champAnd85 / runs) * 100).toFixed(1)}%`);
}
rnd = seedRandom(55);
q5();
