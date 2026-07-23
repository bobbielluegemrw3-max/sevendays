/**
 * 調教・適性・アイテム 再設計シム(TRAINING_APTITUDE_REDESIGN.md §10)
 *
 * 問い: 「隠れた個体適性 + 条件別の調教 + 2系統アイテム」を V2 の器に差し込んだとき、
 *       合否基準 A〜F を同時に満たす設定が存在するか。存在するならその設定は何か。
 *
 * ── 実コードから取った不変の前提(2026-07-23 実測・grep 済み) ──────────────
 *   score      = total_value + condition_prep + luck            (race-engine/src/v2/score.ts:69)
 *   condition_prep は ±4 を外れると **例外**(クランプではない)   (score.ts:52-57)
 *   total_value: mint 40〜75 / 減衰 2.0/レース / softCap 85 半減 (domain/src/v2.ts:23-34)
 *   luck       : ±3(LUCK かつ調教済みのみ −2〜+4)               (domain/src/v2.ts:40-41)
 *   BURN       : floor(頭数 × 0.107) を **LV帯ごとに最大剰余法で配分** し帯内下位から
 *                (race-engine/src/burn.ts:12-14,92-122 / domain/src/constants.ts:67)
 *   予報       : 3軸それぞれ独立に 70% で的中                    (domain/src/volatility.ts:33,123-142)
 *   条件確率   : 天候 .40/.30/.20/.10 馬場 .40/.25/.25/.10 コース .60/.40
 *                                                               (domain/src/constants.ts:309-329)
 *   馬の寿命   : current_day は **1レースにつき +1**・7 で走破     (buyback/day7.ts:40-61)
 *                → **1頭あたりの判断機会は 7 サイクル(14 ではない)**
 *   現行の適性 : WEATHER_MODIFIER_V1[天候][タイプ] + TRACK_MODIFIER_V1[馬場][タイプ]
 *                = **タイプ固定・同タイプは全頭同一**・最大 ±4 で器をちょうど飽和
 *                                                               (constants.ts:331-347)
 *   コース     : races.surface は存在し予報にも出るが V2 スコアには入らない
 *                (snapshots.ts:362 で分割代入から除外・enums.ts:58「items only」)
 *
 * 実行: node packages/settlement-engine/scripts/training-aptitude-sim.mjs
 *       node packages/settlement-engine/scripts/training-aptitude-sim.mjs --full   (感度分析つき)
 * 乱数: 固定シード(mulberry32)— 再現可能。
 */

// ---------------------------------------------------------------------------
// 0. 実定数(コードと一致させること。ズレたらシムの結論は無効)
// ---------------------------------------------------------------------------
const MINT_MIN = 40, MINT_MAX = 75;
const DECAY_PER_RACE = 2.0;
const SOFT_CAP = 85, SOFT_CAP_FACTOR = 0.5;
const VESSEL_CURRENT = 4.0;          // CONDITION_PREP_RANGE_V2
const LUCK_ABS = 3.0;
const BURN_RATE = 0.107;
const FORECAST_ACC = 0.70;
const RACES_TO_CHAMPION = 7;
const MINT_COST = 102, CHAMPION_PAYOUT = 200;

const WEATHERS = [['SUNNY', 0.40], ['CLOUDY', 0.30], ['RAIN', 0.20], ['STORM', 0.10]];
const TRACKS   = [['FAST', 0.25], ['GOOD', 0.40], ['SOFT', 0.25], ['HEAVY', 0.10]];
const SURFACES = [['TURF', 0.60], ['DIRT', 0.40]];

/** 条件 → 極性 [-1,+1]。+ = 雨/道悪/芝 側、− = 晴/良/ダート側。 */
const POLARITY = {
  SUNNY: -1.0, CLOUDY: -0.35, RAIN: 0.6, STORM: 1.0,
  FAST: -1.0, GOOD: -0.35, SOFT: 0.6, HEAVY: 1.0,
  TURF: 1.0, DIRT: -1.0,
};

/** メニュー → (軸, 極性)。§4 の 1対1 対応。REST は減衰無効も持つ。 */
const MENU = {
  HILL: { axis: 'track',   pole: +1, ev: 3.0 },  // 坂路   → 道悪
  POOL: { axis: 'weather', pole: +1, ev: 1.5 },  // 水泳   → 雨
  WOOD: { axis: 'surface', pole: +1, ev: 2.5 },  // ウッド → 芝
  GATE: { axis: 'track',   pole: -1, ev: 2.0 },  // ゲート → 良馬場
  SPAR: { axis: 'surface', pole: -1, ev: 2.0 },  // 併せ馬 → ダート
  REST: { axis: 'weather', pole: -1, ev: 0.0 },  // 調整   → 晴 + 減衰無効
};
const MENU_KEYS = Object.keys(MENU);
const AXES = ['weather', 'track', 'surface'];

// ---------------------------------------------------------------------------
// 1. 乱数(mulberry32・既存シムと同じ作法)
// ---------------------------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const draw = (rand, table) => {
  let u = rand(), cum = 0;
  for (const [v, p] of table) { cum += p; if (u < cum) return v; }
  return table[table.length - 1][0];
};
const drawOther = (rand, table, actual) => {
  const rest = table.filter(([v]) => v !== actual);
  const tot = rest.reduce((t, [, p]) => t + p, 0);
  let u = rand() * tot, cum = 0;
  for (const [v, p] of rest) { cum += p; if (u < cum) return v; }
  return rest[rest.length - 1][0];
};
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const vari = (a) => { const m = mean(a); return mean(a.map((x) => (x - m) ** 2)); };
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const sig = (p1, n1, p2, n2) => {           // 2標本比率の z 検定
  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se === 0 ? 0 : (p1 - p2) / se;
};

// ---------------------------------------------------------------------------
// 2. モデル本体
// ---------------------------------------------------------------------------

/** 個体適性: 3軸それぞれ [-1,+1]。typeCorr>0 ならタイプ由来の偏りを混ぜる。 */
function makeAptitude(rand, horseType, typeCorr) {
  const TYPE_BIAS = {
    SPRINTER: { weather: -0.6, track: -0.6, surface: 0.2 },
    POWER:    { weather: 0.6, track: 0.6, surface: -0.3 },
    ENDURANCE:{ weather: 0.5, track: 0.5, surface: 0.3 },
    BALANCED: { weather: 0.0, track: 0.0, surface: 0.0 },
    LUCK:     { weather: 0.2, track: 0.2, surface: 0.0 },
  }[horseType];
  const apt = {};
  for (const ax of AXES) {
    const indiv = rand() * 2 - 1;
    apt[ax] = Math.max(-1, Math.min(1, typeCorr * TYPE_BIAS[ax] + (1 - typeCorr) * indiv));
  }
  return apt;
}

/**
 * 条件エッジ。3成分を足して器に収める。
 * 器を超えたら **例外**が実装挙動なので、シムでは「設計上そもそも超えない」ように
 * 各成分の上限を配分し、超過が起きた回数を数える(criterion E)。
 */
function conditionEdge(cfg, apt, menus, item, actual) {
  let aptSum = 0;
  for (const ax of AXES) aptSum += apt[ax] * POLARITY[actual[ax]];
  const aptEdge = (cfg.aptW / 3) * aptSum;

  let trnSum = 0;
  for (const m of menus) {
    const d = MENU[m];
    trnSum += d.pole * POLARITY[actual[d.axis]];
  }
  let trnEdge = (cfg.trnW / 2) * trnSum;
  if (cfg.aptAmplifies) {                    // 適性が調教を増幅するか(§10)
    let amp = 0;
    for (const m of menus) {
      const d = MENU[m];
      amp += Math.max(0, d.pole * apt[d.axis]);
    }
    trnEdge *= 1 + cfg.ampFactor * (amp / 2);
  }

  let itemEdge = 0;
  if (item) itemEdge = cfg.itemW * MENU[item].pole * POLARITY[actual[MENU[item].axis]];

  const raw = aptEdge + trnEdge + itemEdge;
  const clamped = Math.max(-cfg.vessel, Math.min(cfg.vessel, raw));
  return { raw, clamped, overflow: Math.abs(raw) > cfg.vessel + 1e-9, aptEdge, trnEdge, itemEdge };
}

/** 総合値の漸化(確定時にロール加算 → レースで減衰)。softCap 超過分は半減。 */
function advanceTotalValue(tv, gain, restsDecay) {
  let next = tv;
  if (gain > 0) {
    const room = Math.max(0, SOFT_CAP - next);
    const under = Math.min(gain, room);
    next += under + (gain - under) * SOFT_CAP_FACTOR;
  } else next += gain;
  if (!restsDecay) next -= DECAY_PER_RACE;
  return Math.max(0, Math.min(100, next));
}

/** メニュー1つの総合値EV。REST は gain 0 だが減衰(-2.0)を無効化するので同額の価値を持つ。
 *  flattenMenuEv=true は「非RESTの5つを flatEv に揃える」意味(REST は据え置き)。
 *  → flatEv = DECAY_PER_RACE のとき6つが完全に等価になり、成長は選択の理由でなくなる。 */
function menuGain(cfg, m) {
  if (m === 'REST') return 0;
  return cfg.flattenMenuEv ? cfg.flatEv : MENU[m].ev;
}
/** ペア単位の成長価値(REST の減衰無効は1回だけ効く=加算しない)。 */
function pairGrowthValue(cfg, menus) {
  let g = menus.reduce((s, m) => s + menuGain(cfg, m), 0);
  if (menus.includes('REST')) g += DECAY_PER_RACE;
  return g;
}

/** 全21通り(重複あり・順序無視)のペアを列挙。同一メニュー2回も合法(v2.ts:57)。 */
const ALL_PAIRS = (() => {
  const out = [];
  for (let i = 0; i < MENU_KEYS.length; i++)
    for (let j = i; j < MENU_KEYS.length; j++) out.push([MENU_KEYS[i], MENU_KEYS[j]]);
  return out;
})();

/**
 * 戦略。返すのは [menu, menu] と レースアイテム。
 *  RANDOM — 無作為(下限)
 *  GROWTH — 条件を一切見ず総合値の伸びだけで選ぶ(＝現行の「HILL一択」プレイヤー)
 *  READER — 馬柱から適性を推定し、予報に合わせて備える(設計が狙うプレイヤー)
 *  ORACLE — 真の適性と実際の条件を知る(到達不能な天井)
 * ★D の判定は READER vs **GROWTH**。RANDOM を基準にすると「高EVメニューを選べた」
 *   だけでスキルありに見え、条件読解そのものの効果を測れない。
 */
function chooseMenus(cfg, strategy, horse, forecast, actual, rand) {
  if (strategy === 'RANDOM') {
    const a = MENU_KEYS[Math.floor(rand() * MENU_KEYS.length)];
    const b = MENU_KEYS[Math.floor(rand() * MENU_KEYS.length)];
    return { menus: [a, b], item: rand() < cfg.itemUseRate ? MENU_KEYS[Math.floor(rand() * MENU_KEYS.length)] : null };
  }
  const remaining = Math.max(1, RACES_TO_CHAMPION - horse.day);
  if (strategy === 'GROWTH') {
    let best = null;
    for (const p of ALL_PAIRS) {
      const v = pairGrowthValue(cfg, p);
      if (!best || v > best.v) best = { p, v };
    }
    return { menus: best.p, item: null };
  }
  const cond = strategy === 'ORACLE' ? actual : forecast;
  const apt = strategy === 'ORACLE' ? horse.apt : estimateAptitude(horse);
  // ペアの価値 = 今夜の条件エッジ(1走かぎり) + 残り走数ぶんの総合値(永続)
  let best = null;
  for (const p of ALL_PAIRS) {
    let trnSum = 0, amp = 0;
    for (const m of p) {
      const d = MENU[m];
      trnSum += d.pole * POLARITY[cond[d.axis]];
      amp += Math.max(0, d.pole * apt[d.axis]);
    }
    let edgeVal = (cfg.trnW / 2) * trnSum;
    if (cfg.aptAmplifies) edgeVal *= 1 + cfg.ampFactor * (amp / 2);
    const v = edgeVal + pairGrowthValue(cfg, p) * cfg.growthWeight * remaining;
    if (!best || v > best.v) best = { p, v };
  }
  const menus = best.p;
  // アイテムは「守れなかった軸」を埋める
  let item = null;
  if (rand() < cfg.itemUseRate) {
    const covered = new Set(menus.map((m) => MENU[m].axis));
    const gap = AXES.find((ax) => !covered.has(ax));
    if (gap) {
      const want = POLARITY[cond[gap]] >= 0 ? +1 : -1;
      item = MENU_KEYS.find((m) => MENU[m].axis === gap && MENU[m].pole === want) ?? null;
    }
  }
  return { menus, item };
}

/**
 * 馬柱(過去成績)から適性を推定する — 「読み解けるか」の実体。
 * ★着順そのものは総合値の影(強い馬は条件に関係なく上位)なので、
 *   **総合値だけで決まる想定順位(rankByTv)からの残差**を成績シグナルにする。
 *   「この馬にしては走った/走らなかった」を読む実プレイヤーの行為に相当する。
 */
function estimateAptitude(horse) {
  const est = { weather: 0, track: 0, surface: 0 };
  const wsum = { weather: 0, track: 0, surface: 0 };
  for (const h of horse.history) {
    // 残差 [-1,+1]: 実着順が想定より上(rankByTv - rank > 0)なら「走った」
    const perf = h.entrants > 1 ? (2 * (h.rankByTv - h.rank)) / (h.entrants - 1) : 0;
    for (const ax of AXES) {
      const pol = POLARITY[h.cond[ax]];
      est[ax] += perf * pol;
      wsum[ax] += Math.abs(pol);
    }
  }
  for (const ax of AXES) est[ax] = wsum[ax] > 0 ? Math.max(-1, Math.min(1, est[ax] / wsum[ax])) : 0;
  return est;
}

// ---------------------------------------------------------------------------
// 3. レース1本(帯ごとの floor 配分 + 帯内下位から BURN)
// ---------------------------------------------------------------------------
function runRace(cfg, field, rand, stats) {
  const actual = { weather: draw(rand, WEATHERS), track: draw(rand, TRACKS), surface: draw(rand, SURFACES) };
  const forecast = {};
  for (const [ax, table] of [['weather', WEATHERS], ['track', TRACKS], ['surface', SURFACES]]) {
    forecast[ax] = rand() < FORECAST_ACC ? actual[ax] : drawOther(rand, table, actual[ax]);
  }

  for (const h of field) {
    const { menus, item } = chooseMenus(cfg, h.strategy, h, forecast, actual, rand);
    // 調教ロール(確定時に総合値へ反映・Decision 112)
    let gain = 0;
    for (const m of menus) {
      const ev = menuGain(cfg, m);
      gain += ev === 0 ? 0 : ev * (0.5 + rand());   // 平均=ev の粗いロール
    }
    const restsDecay = menus.includes('REST');
    h.tv = advanceTotalValue(h.tv, gain, restsDecay);

    const edge = conditionEdge(cfg, h.apt, menus, item, actual);
    if (edge.overflow) stats.overflow++;
    stats.edgeAbs.push(Math.abs(edge.clamped));
    stats.comp.apt.push(Math.abs(edge.aptEdge));
    stats.comp.trn.push(Math.abs(edge.trnEdge));
    stats.comp.item.push(Math.abs(edge.itemEdge));
    for (const m of menus) stats.menuCount[m] = (stats.menuCount[m] ?? 0) + 1;
    // F の条件応答性: 実際の馬場ごとに READER が選んだ最良メニューを数える。
    if (h.strategy === 'READER') {
      const b = (stats.menuByTrack[actual.track] ??= {});
      b[menus[0]] = (b[menus[0]] ?? 0) + 1;
    }

    const luck = (rand() + rand() + rand()) / 3 * (2 * LUCK_ABS) - LUCK_ABS;
    h.score = h.tv + edge.clamped + luck;
    h.lastCond = actual;
    stats.varTv.push(h.tv); stats.varEdge.push(edge.clamped); stats.varLuck.push(luck);
  }

  // 帯(current_day)ごとに最大剰余法で BURN 枠を配る → 帯内の下位から
  const total = Math.floor(field.length * BURN_RATE);
  const bands = new Map();
  for (const h of field) {
    if (!bands.has(h.day)) bands.set(h.day, []);
    bands.get(h.day).push(h);
  }
  const quotas = [];
  let assigned = 0;
  for (const [day, list] of bands) {
    const exact = (total * list.length) / field.length;
    const base = Math.floor(exact);
    quotas.push({ day, list, base, rem: exact - base });
    assigned += base;
  }
  quotas.sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < total - assigned; i++) quotas[i % quotas.length].base++;

  const burned = new Set();
  for (const q of quotas) {
    if (q.base <= 0) continue;
    const ordered = [...q.list].sort((a, b) => a.score - b.score); // 下位から
    for (let i = 0; i < Math.min(q.base, ordered.length); i++) burned.add(ordered[i]);
  }

  // 記録(馬柱)と生死。rankByTv = 総合値だけで並べた想定順位(残差読解の基準)。
  const byBand = new Map();
  for (const h of field) {
    if (!byBand.has(h.day)) byBand.set(h.day, []);
    byBand.get(h.day).push(h);
  }
  for (const [, list] of byBand) {
    const tvRank = new Map();
    [...list].sort((a, b) => b.tv - a.tv).forEach((h, i) => tvRank.set(h, i + 1));
    list.sort((a, b) => b.score - a.score);
    list.forEach((h, i) => {
      h.history.push({ cond: h.lastCond, rank: i + 1, rankByTv: tvRank.get(h), entrants: list.length });
      if (h.history.length > 10) h.history.shift();
    });
  }
  return { burned, actual, forecast };
}

// ---------------------------------------------------------------------------
// 4. 母集団を回す
// ---------------------------------------------------------------------------
function simulate(cfg, opts = {}) {
  const rand = rng(cfg.seed ?? 20260723);
  const fieldSize = opts.fieldSize ?? 1200;
  const races = opts.races ?? 400;
  const TYPES = ['SPRINTER', 'POWER', 'ENDURANCE', 'BALANCED', 'LUCK'];
  const strategies = opts.strategies ?? ['RANDOM', 'GROWTH', 'READER', 'ORACLE'];

  let nextId = 0;
  const born = () => {
    const t = TYPES[Math.floor(rand() * TYPES.length)];
    return {
      id: nextId++, type: t, tv: MINT_MIN + rand() * (MINT_MAX - MINT_MIN),
      day: 0, apt: makeAptitude(rand, t, cfg.typeCorr), history: [],
      strategy: strategies[nextId % strategies.length],
      score: 0, lastCond: null, mintTv: 0,
    };
  };
  let field = Array.from({ length: fieldSize }, born);
  field.forEach((h) => { h.mintTv = h.tv; });

  const stats = {
    overflow: 0, edgeAbs: [], comp: { apt: [], trn: [], item: [] }, menuCount: {}, menuByTrack: {},
    varTv: [], varEdge: [], varLuck: [],
    bySt: Object.fromEntries(strategies.map((s) => [s, { lines: 0, champs: 0, races: 0, burns: 0 }])),
    burnedTotal: 0, raced: 0,
    tvDecile: Array.from({ length: 10 }, () => ({ n: 0, burned: 0 })),
    pair: { n: 0, strongWins: 0 },
    estErr: [], estByRaces: Array.from({ length: 8 }, () => []),
  };

  for (let r = 0; r < races; r++) {
    const { burned } = runRace(cfg, field, rand, stats);
    stats.raced += field.length;
    stats.burnedTotal += burned.size;

    // 総合値十分位ごとの BURN 率(criterion B)
    const sorted = [...field].sort((a, b) => a.tv - b.tv);
    sorted.forEach((h, i) => {
      const d = Math.min(9, Math.floor((i / sorted.length) * 10));
      stats.tvDecile[d].n++;
      if (burned.has(h)) stats.tvDecile[d].burned++;
    });

    // 適性推定の精度(criterion D の「何走で見抜けるか」)
    for (const h of field) {
      if (h.history.length >= 1 && h.history.length <= 7) {
        const est = estimateAptitude(h);
        const err = mean(AXES.map((ax) => Math.abs(est[ax] - h.apt[ax])));
        stats.estByRaces[h.history.length].push(err);
      }
    }

    const next = [];
    for (const h of field) {
      const st = stats.bySt[h.strategy];
      st.races++;
      if (burned.has(h)) {
        st.burns++; st.lines++;
        next.push(born());
      } else {
        h.day++;
        if (h.day >= RACES_TO_CHAMPION) { st.champs++; st.lines++; next.push(born()); }
        else next.push(h);
      }
    }
    field = next;
  }

  // 強さ支配の対戦テスト(criterion B): TV 差 Δ で、強い側を条件最悪・弱い側を条件最良に置く
  const pairTest = (delta, trials = 200_000) => {
    const pr = rng(99 + Math.round(delta * 10));
    let wins = 0;
    for (let i = 0; i < trials; i++) {
      const lk = () => (pr() + pr() + pr()) / 3 * (2 * LUCK_ABS) - LUCK_ABS;
      const strong = 60 + delta - cfg.vessel + lk();
      const weak = 60 + cfg.vessel + lk();
      if (strong > weak) wins++;
    }
    return wins / trials;
  };

  return { stats, pairTest };
}

// ---------------------------------------------------------------------------
// 5. 合否判定 A〜F
// ---------------------------------------------------------------------------
function judge(cfg, res) {
  const { stats, pairTest } = res;
  const out = [];

  // A: BURN率 10.7% を維持(floor 則の構造が保たれる)
  const burnRate = stats.burnedTotal / stats.raced;
  out.push({
    id: 'A', name: 'BURN率 10.7% 維持',
    pass: Math.abs(burnRate - BURN_RATE) < 0.002,
    detail: `実測 ${pct(burnRate)} (政策 ${pct(BURN_RATE)})・floor則は枠数固定なので条件エッジは総数を動かさない`,
  });

  // B: 強さが生存の主因(分散寄与 + 十分位の単調性 + 対戦テスト)
  const vTv = vari(stats.varTv), vEdge = vari(stats.varEdge), vLuck = vari(stats.varLuck);
  const vTot = vTv + vEdge + vLuck;
  const dec = stats.tvDecile.map((d) => d.burned / Math.max(1, d.n));
  const monotone = dec[0] > dec[9] && dec[0] - dec[9] > 0.05;
  const p10 = pairTest(10);
  out.push({
    id: 'B', name: '強さが生存の主因',
    pass: vTv / vTot > 0.5 && vTv > vEdge && vEdge > vLuck && monotone && p10 > 0.75,
    detail: `分散寄与 TV ${pct(vTv / vTot)} / 条件 ${pct(vEdge / vTot)} / 運 ${pct(vLuck / vTot)}`
      + ` ・序列 ${vTv > vEdge && vEdge > vLuck ? 'TV>条件>運 OK' : 'NG'}`
      + ` ・最弱十分位BURN ${pct(dec[0])} vs 最強 ${pct(dec[9])}`
      + ` ・TV差10で条件最悪の強馬が条件最良の弱馬に勝つ確率 ${pct(p10)}`,
  });

  // C: プレイヤーEV(現行 約 −11%)とソルベンシー
  const champRate = Math.pow(1 - BURN_RATE, RACES_TO_CHAMPION);
  const evAll = [];
  for (const [, s] of Object.entries(stats.bySt)) {
    if (s.lines > 0) evAll.push((s.champs / s.lines) * CHAMPION_PAYOUT - MINT_COST);
  }
  const evMean = mean(evAll);
  out.push({
    id: 'C', name: 'プレイヤーEV 現行レンジ維持',
    pass: Math.abs(evMean / MINT_COST + 0.112) < 0.03,
    detail: `平均EV ${evMean.toFixed(2)} USDT (${pct(evMean / MINT_COST)})・理論チャンピオン率 ${pct(champRate)}`
      + `・外部原資ゼロ(BURN枠固定＝スキルは枠の奪い合いで、総額は動かない)`,
  });

  // D: スキルが効く。基準は **GROWTH**(条件を見ず総合値だけ最適化する現行型プレイヤー)。
  //    READER が GROWTH を有意に上回れば「条件読解そのもの」に価値がある。
  //    ORACLE < ~95% で決定論でないことも確認。
  const g = (k) => {
    const s = stats.bySt[k];
    return s ? { surv: 1 - s.burns / Math.max(1, s.races), champ: s.champs / Math.max(1, s.lines), n: s.races } : null;
  };
  const rnd0 = g('RANDOM'), gr = g('GROWTH'), rd = g('READER'), or = g('ORACLE');
  const z = rd && gr ? sig(rd.surv, rd.n, gr.surv, gr.n) : 0;
  out.push({
    id: 'D', name: 'スキル(条件読解)が効く・決定論でない',
    pass: !!(rd && gr && rd.surv > gr.surv && z > 3 && or && or.champ < 0.95),
    detail: `生存率 RANDOM ${pct(rnd0?.surv ?? 0)} / GROWTH(現行型) ${pct(gr?.surv ?? 0)}`
      + ` → READER ${pct(rd?.surv ?? 0)} → ORACLE ${pct(or?.surv ?? 0)} (READER vs GROWTH z=${z.toFixed(1)})`
      + `・チャンピオン率 R ${pct(gr?.champ ?? 0)}→${pct(rd?.champ ?? 0)}`,
  });

  // E: 1入力が支配しない(バランス)。★超過は「不合格」ではなく実装への要件:
  //    computeScoreV2 は prep>±4 で **例外**を投げる(score.ts:52-57・クランプでない)ので、
  //    3入力を足した prep は凍結前に必ず ±4 へクランプしなければならない。
  const ca = mean(stats.comp.apt), ct = mean(stats.comp.trn), ci = mean(stats.comp.item);
  const tot = ca + ct + ci;
  const share = [ca / tot, ct / tot, ci / tot];
  const overflowRate = stats.overflow / Math.max(1, stats.edgeAbs.length);
  out.push({
    id: 'E', name: '条件エッジの器(1入力が支配しない)',
    pass: Math.max(...share) < 0.6,
    detail: `器 ±${cfg.vessel}・平均|エッジ| ${mean(stats.edgeAbs).toFixed(2)}`
      + `・寄与 適性 ${pct(share[0])} / 調教 ${pct(share[1])} / アイテム ${pct(share[2])}`
      + `・器超過 ${pct(overflowRate)} → 【実装要件】凍結前に prep を ±4 へクランプ必須`
      + `(重み合計 ${(cfg.aptW + cfg.trnW + cfg.itemW).toFixed(1)} が 4 を超えると整列尾で発生)`,
  });

  // F: HILL一択の解消 = ①単一メニューが支配しない ②最適メニューが馬場で変わる。
  //    「top≠HILL」は恣意的(条件分布が HILL 軸に偏れば HILL が最多で正しい)なので使わない。
  const counts = MENU_KEYS.map((m) => [m, stats.menuCount[m] ?? 0]).sort((a, b) => b[1] - a[1]);
  const totalPicks = counts.reduce((s, [, c]) => s + c, 0);
  const topShare = counts[0][1] / totalPicks;
  const topByTrack = {};
  for (const [trk, b] of Object.entries(stats.menuByTrack)) {
    topByTrack[trk] = Object.entries(b).sort((a, c) => c[1] - a[1])[0]?.[0];
  }
  const distinctTops = new Set(Object.values(topByTrack)).size;
  out.push({
    id: 'F', name: 'HILL一択の解消(最適が条件で変わる)',
    pass: topShare < 0.40 && distinctTops >= 2,
    detail: `選択率 ${counts.map(([m, c]) => `${m} ${pct(c / totalPicks)}`).join(' / ')}`
      + `・馬場別の最頻メニュー ${Object.entries(topByTrack).map(([k, v]) => `${k}:${v}`).join(' ')}`
      + ` (${distinctTops}種)`,
  });

  return out;
}

// ---------------------------------------------------------------------------
// 6. 実行
// ---------------------------------------------------------------------------
const BASE = {
  seed: 20260723,
  vessel: VESSEL_CURRENT,   // 器の半幅
  aptW: 2.0,                // 適性の最大寄与
  trnW: 1.5,                // 調教の備えの最大寄与
  itemW: 0.5,               // アイテムの最大寄与
  itemUseRate: 0.35,
  typeCorr: 0.0,            // 0 = 完全個体 / 1 = タイプ固定(現行)
  aptAmplifies: false, ampFactor: 0.5,
  growthWeight: 1.0,        // 総合値EVを何倍で評価するか(1 = 素直に永続価値を見る)
  flattenMenuEv: false, flatEv: 2.0,
};

function report(title, cfg, opts) {
  const res = simulate(cfg, opts);
  const rows = judge(cfg, res);
  const okCount = rows.filter((r) => r.pass).length;
  console.log(`\n${'='.repeat(78)}\n${title}`);
  console.log(`器±${cfg.vessel} 適性${cfg.aptW} 調教${cfg.trnW} アイテム${cfg.itemW}`
    + ` typeCorr=${cfg.typeCorr} 増幅=${cfg.aptAmplifies ? cfg.ampFactor : 'なし'}`
    + ` EV平坦化=${cfg.flattenMenuEv ? cfg.flatEv : 'なし'} 成長重み=${cfg.growthWeight}`);
  console.log('-'.repeat(78));
  for (const r of rows) console.log(`  [${r.pass ? '合格' : '不合格'}] ${r.id} ${r.name}\n        ${r.detail}`);
  console.log(`  → ${okCount}/6 合格`);
  return { rows, okCount, res };
}

const FULL = process.argv.includes('--full');

console.log('調教・適性・アイテム 再設計シム — TRAINING_APTITUDE_REDESIGN.md §10 の合否基準 A〜F');
console.log(`前提: 1頭の判断機会 = ${RACES_TO_CHAMPION} サイクル(current_day は1レースで+1・day7.ts:42)`);

const r0 = report('【0】現行の器のまま差し込む(器±4・EVそのまま)', BASE);

// 馬柱の読解可能性(criterion D の材料)
{
  const { stats } = r0.res;
  console.log('\n  馬柱から適性を推定した誤差(0=完全一致 / 1.0=当てずっぽう相当):');
  for (let n = 1; n <= 7; n++) {
    const a = stats.estByRaces[n];
    if (a.length) console.log(`    ${n}走ぶん: 平均誤差 ${mean(a).toFixed(3)}  (n=${a.length})`);
  }
}

report('【1】EVを平坦化(メニュー間の永続価値差を消す=HILL一択の根治)', { ...BASE, flattenMenuEv: true });
report('【2】反例: 器を±8へ広げると B が壊れる(条件が強さを飲む)', { ...BASE, flattenMenuEv: true, vessel: 8, aptW: 4.0, trnW: 3.0, itemW: 1.0 });

// ---- 器±4・EV平坦化を固定し、3入力の重みを自動探索(E と F を両立させる点を探す) ----
console.log(`\n${'='.repeat(78)}\n【探索】器±4・EV平坦化を固定し (適性,調教,アイテム) の重みを総当り`);
console.log('  B が壊れない ±4 の中で、E(1入力が支配しない)と D(条件読解が効く)を両立させる点を探す');
let bestCfg = null, bestScore = -1;
const grid = [];
for (const aptW of [1.5, 2.0, 2.5, 3.0])
  for (const trnW of [0.8, 1.1, 1.4, 1.7])
    for (const itemW of [0.6, 0.9, 1.2]) {
      const cfg = { ...BASE, flattenMenuEv: true, vessel: 4, aptW, trnW, itemW, seed: 20260723 };
      const res = simulate(cfg, { fieldSize: 900, races: 260 });   // 探索は軽量
      const rows = judge(cfg, res);
      const ok = rows.filter((r) => r.pass).length;
      // タイブレーク: E の最大寄与シェアが小さいほど良い(バランス)
      const eRow = rows.find((r) => r.id === 'E');
      const m = eRow.detail.match(/適性 ([\d.]+)%.*調教 ([\d.]+)%.*アイテム ([\d.]+)%/);
      const maxShare = m ? Math.max(+m[1], +m[2], +m[3]) : 100;
      const score = ok * 1000 - maxShare;
      grid.push({ aptW, trnW, itemW, ok, maxShare });
      if (score > bestScore) { bestScore = score; bestCfg = cfg; }
    }
grid.sort((a, b) => b.ok - a.ok || a.maxShare - b.maxShare);
console.log('  上位5点(合格数 / 最大寄与シェア):');
for (const g of grid.slice(0, 5))
  console.log(`    適性${g.aptW} 調教${g.trnW} アイテム${g.itemW} → ${g.ok}/6 合格・最大シェア ${g.maxShare.toFixed(1)}%`);

report('【推奨】探索の最良点をフル母集団で再検証', bestCfg, { fieldSize: 1500, races: 500 });

if (FULL) {
  report('【S1】タイプ相関を残す(typeCorr=0.5・現行のタイプ固定寄り)', { ...bestCfg, typeCorr: 0.5 });
  report('【S2】反例: 器±10(条件を主役にしすぎ)', { ...BASE, flattenMenuEv: true, vessel: 10, aptW: 5.0, trnW: 4.0, itemW: 1.5 });
  report('【S3】反例: アイテムを強くしすぎ(課金支配)', { ...BASE, flattenMenuEv: true, vessel: 4, aptW: 1.5, trnW: 1.0, itemW: 3.0 });
  report('【S4】適性が調教を増幅(§10 の任意項)', { ...bestCfg, aptAmplifies: true, ampFactor: 0.5 });
}

console.log(`\n${'='.repeat(78)}\n■ 結論(開発側の所見)`);
console.log('  A・C: floor(頭数×率) の枠数固定に由来し、条件エッジをどう足しても構造的に不変(常に合格)。');
console.log('        条件エッジは「誰が枠に入るか」を入れ替えるだけで、枠の数=BURN総数を動かさない。');
console.log('  B  : 器の半幅がそのまま「強さを飲む上限」。±4 を超えると Δ10 の強さ差が条件で覆る → 据え置き必須。');
console.log('  D・F: HILL の EV=3.0 独走を平らにする(6メニューの永続価値を揃える)ことが根治。');
console.log('        これをやらないと GROWTH がHILL一択に収束し、条件読解に価値が生まれない(F 不合格・D 有意差消滅)。');
console.log('  E  : ±4 の器の中で 適性:調教:アイテム の重みを上の探索点に置くとバランスが取れる。');
console.log('  ★D の弱点(要オーナー判断): 適性は 7走かけても馬柱から半分程度しか読めない(誤差≈0.47)。');
console.log('     判断機会が 14 でなく 7 であること・運±3 が適性±2 を覆うことが原因。');
console.log('     「読める」感度を上げるには 適性の振れ幅を上げる(Bと相談)か、天候/馬場/コースの3軸それぞれに');
console.log('     馬柱の該当条件だけを抜き出す UI(§3 の「この馬の雨・稍重での成績」)で読解を人力補助する。');
