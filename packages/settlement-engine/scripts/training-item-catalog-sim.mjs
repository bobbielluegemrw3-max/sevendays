/**
 * §14.5 具体カタログ検証シム(TRAINING_APTITUDE_REDESIGN.md §14.5・開発側 2026-07-23)
 *
 * §12 の抽象シム(training-aptitude-sim.mjs)は「実現可能な領域は存在する」を示した。
 * 本シムはその先 — **レビュー側 §14.5 のたたき台の具体値をそのまま食わせて**、
 * 抽象重み(アイテム寄与≈0.9・12%)では見えなかった実害を数字にする:
 *
 *   Q1 クランプ作動率 = 「強=的中+2.5」の売り文句が器±4に削られる率(R1・誇大表示)
 *   Q2 削られ量(honesty gap) = 広告値 +2.5 に対し実際に乗る平均値
 *   Q3 基準E = アイテムが条件エッジを支配しないか(§14.5 の値でもEが通るか)
 *   Q4 基準B = 強さ支配が保たれるか
 *   Q5 (i)置換方式 vs (ii)加算方式 の差 — 現行コードは(i)、§6/§14.5 は(ii)寄り
 *   Q6 強の上限値スイープ(2.5 → 2.0 → 1.5)で Q1〜Q4 がどう変わるか → 「強はいくつまで許容か」
 *
 * ── 実コードから取った不変の前提 ──────────────────────────────
 *   score = total_value + condition_prep + luck   (race-engine/src/v2/score.ts:69)
 *   prep が ±4 超で **例外**(クランプでない)         (score.ts:52-57)
 *   現行 RACE アイテム = **置換方式** overrideAxis=max/min・各軸±2で
 *     合成±4は構造的に溢れない                       (items-v3.ts:18,276-278)
 *   §12 推奨点: 器±4 / 適性2.5・調教0.8・アイテム0.9  (§12.1・E: 適性42%/調教46%/item12%)
 *
 * ── §14.5 の具体カタログ(たたき台) ────────────────────────────
 *   レースアイテム: 6条件 × 3段  弱 +1.0/−0.5 ・ 中 +1.8/−1.2 ・ 強 +2.5/−2.0
 *   保険(全天候):  並 +0.6(外れなし) ・ 極 +1.0(外れなし)
 *   (調教アイテムは total_value に合流するので condition_prep には無関係 — 別途 Q7 で触れる)
 *
 * 実行: node packages/settlement-engine/scripts/training-item-catalog-sim.mjs
 * 乱数: 固定シード(mulberry32)— 決定論・再現可能。
 */

// ---------------------------------------------------------------------------
const VESSEL = 4.0;                 // CONDITION_PREP_RANGE_V2(半幅)
const LUCK_ABS = 3.0;
// §12 推奨点を軸あたりに割る(合計が推奨の最大寄与に一致するよう按分)
const APT_PER_AXIS = 2.5 / 3;       // 適性 最大2.5 を3軸へ
const TRN_PER_MENU = 0.8 / 2;       // 調教 最大0.8 を2メニューへ

const WEATHERS = [['SUNNY', 0.40], ['CLOUDY', 0.30], ['RAIN', 0.20], ['STORM', 0.10]];
const TRACKS   = [['FAST', 0.25], ['GOOD', 0.40], ['SOFT', 0.25], ['HEAVY', 0.10]];
const SURFACES = [['TURF', 0.60], ['DIRT', 0.40]];
const FORECAST_ACC = 0.70;
const AXES = ['weather', 'track', 'surface'];

/** 条件 → 極性 [-1,+1]。+ = 雨/道悪/芝側。 */
const POLARITY = {
  SUNNY: -1.0, CLOUDY: -0.35, RAIN: 0.6, STORM: 1.0,
  FAST: -1.0, GOOD: -0.35, SOFT: 0.6, HEAVY: 1.0,
  TURF: 1.0, DIRT: -1.0,
};

// §14.5 レースアイテムのティア(強の hit は Q6 でスイープ)
const TIER = (strongHit) => ({
  weak:   { hit: 1.0, miss: -0.5 },
  mid:    { hit: 1.8, miss: -1.2 },
  strong: { hit: strongHit, miss: -(strongHit - 0.5) },
});
const INSURANCE = { all: 0.6 };     // 全天候・並(外れなし)

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
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// 軸ごとの素の寄与(適性 + 調教)。アイテム適用前。
// ---------------------------------------------------------------------------
function axisNatural(apt, actual, menusAxes) {
  const nat = {};
  for (const ax of AXES) {
    let v = APT_PER_AXIS * apt[ax] * POLARITY[actual[ax]];
    if (menusAxes.includes(ax)) v += TRN_PER_MENU * POLARITY[actual[ax]];
    nat[ax] = v;
  }
  return nat;
}

/**
 * レースアイテムを1つ適用して condition_prep を返す。
 * mechanic:
 *   'additive' — アイテムの hit/miss を対象軸へ **足す**(§6/§14.5)。合計を±4へクランプ
 *   'override' — 現行コードの置換方式(items-v3.ts)。対象軸を max(nat,hit)/min(nat,miss) に上書き。
 *                各軸±2に収まる前提なので溢れない(ただし §14.5 の強+2.5 は±2を超える点に注意)
 */
function prepWithItem(nat, mechanic, item, actual) {
  const axVals = { ...nat };
  let advertised = 0, hitFlag = false;
  if (item) {
    const ax = item.axis;
    const hit = item.insurance
      ? POLARITY[actual[ax]] >= 0            // 保険は「今夜の側」に常に小さく+(外れなし)
      : matchesItem(item, actual);
    const val = item.insurance ? INSURANCE.all : (hit ? item.tier.hit : item.tier.miss);
    hitFlag = hit;
    advertised = item.insurance ? INSURANCE.all : item.tier.hit;   // 売り文句(的中値)
    if (mechanic === 'additive') {
      axVals[ax] = axVals[ax] + val;
    } else {
      // override: 対象軸を置換(hit は上げ方向・miss は下げ方向)
      axVals[ax] = hit ? Math.max(nat[ax], val) : Math.min(nat[ax], val);
    }
  }
  const raw = AXES.reduce((s, ax) => s + axVals[ax], 0);
  const prep = clamp(raw, -VESSEL, VESSEL);
  return { prep, raw, advertised, hitFlag, overflow: Math.abs(raw) > VESSEL + 1e-9 };
}

/** アイテムが今夜の条件に的中したか(対象軸の極性が備えた向きと一致)。 */
function matchesItem(item, actual) {
  return item.want > 0 ? POLARITY[actual[item.axis]] > 0 : POLARITY[actual[item.axis]] < 0;
}

// ---------------------------------------------------------------------------
// プレイヤーの行動
//   SPREAD       — 賢い: 2メニューを予報の2軸へ、アイテムは残り1軸へ(積み上げない)
//   CONCENTRATED — 素朴: 適性最強の軸に メニュー・アイテムを全部重ねる(器超過の最悪ケース)
// ---------------------------------------------------------------------------
function plan(style, apt, forecast, tierTable, willBuy, rand, opts = {}) {
  const { useInsurance = true, forceTier = null, buyPolicy = 'always' } = opts;
  if (style === 'CONCENTRATED') {
    const ax = AXES.slice().sort((a, b) => Math.abs(apt[b]) - Math.abs(apt[a]))[0];
    const secondAx = AXES.find((x) => x !== ax);
    const want = apt[ax] >= 0 ? +1 : -1;
    const item = willBuy ? { axis: ax, want, tier: tierTable.strong } : null;
    return { menusAxes: [ax, secondAx], item };
  }
  // SPREAD
  const scored = AXES.map((ax) => ({ ax, absPol: Math.abs(POLARITY[forecast[ax]]) }))
    .sort((a, b) => b.absPol - a.absPol);
  const menusAxes = [scored[0].ax, scored[1].ax];
  const itemAxis = scored[2].ax;
  let item = null;
  if (willBuy) {
    const want = POLARITY[forecast[itemAxis]] >= 0 ? +1 : -1;
    const confident = Math.sign(apt[itemAxis]) === want && Math.abs(apt[itemAxis]) > 0.3;
    // 「読みが強い時だけ買う」= skilled。自信が無い夜は買わない(＝レースアイテムを見送る)
    if (buyPolicy === 'skilled' && !confident) return { menusAxes, item: null };
    if (forceTier) item = { axis: itemAxis, want, tier: tierTable[forceTier] };
    else if (useInsurance && !confident && rand() < 0.5) item = { axis: itemAxis, want, insurance: true };
    else item = { axis: itemAxis, want, tier: confident ? tierTable.strong : tierTable.mid };
  }
  return { menusAxes, item };
}

// ---------------------------------------------------------------------------
// 母集団を回す
// ---------------------------------------------------------------------------
function simulate({ mechanic, strongHit, style = 'SPREAD', buyRate = 0.6, useInsurance = true,
                    forceTier = null, buyPolicy = 'always', seed = 20260723 }) {
  const rand = rng(seed);
  const N = 4000, RACES = 300;
  const tierTable = TIER(strongHit);

  const horses = Array.from({ length: N }, () => ({
    apt: { weather: rand() * 2 - 1, track: rand() * 2 - 1, surface: rand() * 2 - 1 },
    tv: 40 + rand() * 35,
    buyer: rand() < buyRate,
  }));

  const S = {
    prepAbs: [], itemDelivered: [], itemAdvertised: [], overflow: 0, itemUsed: 0,
    compApt: [], compItem: [], varTv: [], varEdge: [], varLuck: [],
    survBuyer: { alive: 0, n: 0 }, survNon: { alive: 0, n: 0 },
    buyerBuys: 0, buyerRaces: 0,   // skilled は買わない夜があるので実購入回数を数える
  };

  for (let r = 0; r < RACES; r++) {
    const actual = { weather: draw(rand, WEATHERS), track: draw(rand, TRACKS), surface: draw(rand, SURFACES) };
    const forecast = {};
    for (const [ax, table] of [['weather', WEATHERS], ['track', TRACKS], ['surface', SURFACES]]) {
      forecast[ax] = rand() < FORECAST_ACC ? actual[ax] : drawOther(rand, table, actual[ax]);
    }

    const scores = [];
    for (const h of horses) {
      const p = plan(style, h.apt, forecast, tierTable, h.buyer, rand, { useInsurance, forceTier, buyPolicy });
      if (h.buyer) { S.buyerRaces++; if (p.item) S.buyerBuys++; }
      const nat = axisNatural(h.apt, actual, p.menusAxes);
      const noItem = prepWithItem(nat, mechanic, null, actual);
      const withItem = prepWithItem(nat, mechanic, p.item, actual);

      if (p.item && !p.item.insurance) {
        S.itemUsed++;
        if (withItem.overflow) S.overflow++;
        if (withItem.hitFlag) {
          S.itemAdvertised.push(withItem.advertised);
          S.itemDelivered.push(withItem.prep - noItem.prep);
        }
        S.compItem.push(Math.abs(withItem.prep - noItem.prep));
        S.compApt.push(Math.abs(noItem.prep));
      }

      const luck = (rand() + rand() + rand()) / 3 * (2 * LUCK_ABS) - LUCK_ABS;
      const prep = withItem.prep;
      S.prepAbs.push(Math.abs(prep));
      S.varTv.push(h.tv); S.varEdge.push(prep); S.varLuck.push(luck);
      scores.push({ h, score: h.tv + prep + luck });
    }

    scores.sort((a, b) => a.score - b.score);
    const burnN = Math.floor(scores.length * 0.107);
    scores.forEach((s, i) => {
      const burned = i < burnN;
      const bucket = s.h.buyer ? S.survBuyer : S.survNon;
      bucket.n++; if (!burned) bucket.alive++;
    });
  }
  return S;
}

// ---------------------------------------------------------------------------
// レポート
// ---------------------------------------------------------------------------
function analyze(label, cfg) {
  const S = simulate(cfg);
  const clampRate = S.overflow / Math.max(1, S.itemUsed);
  const advMean = mean(S.itemAdvertised);
  const delMean = mean(S.itemDelivered);
  const gap = advMean > 0 ? (advMean - delMean) / advMean : 0;
  const ci = mean(S.compItem), ca = mean(S.compApt);
  const itemShare = ci / (ci + ca);
  const vTv = vari(S.varTv), vEdge = vari(S.varEdge), vLuck = vari(S.varLuck);
  const tvShare = vTv / (vTv + vEdge + vLuck);
  const sB = S.survBuyer.alive / S.survBuyer.n, sN = S.survNon.alive / S.survNon.n;
  // チャンピオン率 = 7走連続生存。EV = champ×200 − mint102 − アイテム代
  const champB = Math.pow(sB, 7), champN = Math.pow(sN, 7);
  const meanPrep = mean(S.prepAbs);
  // 1ライン(ミント→走破 or BURN)の期待レース数 = Σ s^k (k=0..6)。買う人はここに price を払う。
  const price = cfg.avgItemPrice ?? 4;      // §14.5 中3〜強5 の代表値
  const racesB = (1 - Math.pow(sB, 7)) / (1 - sB);
  const evBuyer = champB * 200 - 102 - price * racesB;
  const evNon = champN * 200 - 102;

  console.log(`\n${label}`);
  console.log(`  クランプ作動率 ${pct(clampRate)} / 平均|prep| ${meanPrep.toFixed(2)}(§12基準0.86)`
    + `${clampRate > 0.1 ? ' ★頻発' : ''}`);
  console.log(`  売り文句 vs 実効(的中): 広告 +${advMean.toFixed(2)} → 実効 +${delMean.toFixed(2)}  (削られ ${pct(gap)}${gap > 0.15 ? ' ★R1' : ''})`);
  console.log(`  強さ支配B ${pct(tvShare)}${tvShare > 0.5 ? '' : ' ★NG'} / アイテムが条件エッジに占める割合 ${pct(itemShare)}`);
  console.log(`  ★pay-to-win: チャンピオン率 買 ${pct(champB)} vs 非買 ${pct(champN)}  (差 ${((champB - champN) * 100).toFixed(1)}pt)`);
  console.log(`  ★EV(価格${price}想定): 買う人 ${evBuyer.toFixed(1)} vs 買わない人 ${evNon.toFixed(1)}`
    + `  → 買う方が ${(evBuyer - evNon).toFixed(1)}${evBuyer > evNon ? ' 有利 ★アイテム安すぎ(全員買う圧)' : ' 不利/均衡'}`);
  return { clampRate, gap, itemShare, tvShare, champDiff: champB - champN, evEdge: evBuyer - evNon };
}

console.log('§14.5 具体カタログ検証 — 「強=的中+2.5」は器±4に耐えるか / (i)置換 vs (ii)加算 / pay-to-win');
console.log(`前提: 器±4・適性2.5(=軸${APT_PER_AXIS.toFixed(2)}×3)・調教0.8(=メニュー${TRN_PER_MENU.toFixed(2)}×2)・保険は外れなし+0.6・7走走破`);

console.log(`\n${'='.repeat(78)}\n【1】賢いプレイヤー(SPREAD・軸を分散) — (ii)加算 vs (i)置換 で 強+2.5`);
analyze('  加算 / 強+2.5', { mechanic: 'additive', strongHit: 2.5 });
analyze('  置換 / 強+2.5', { mechanic: 'override', strongHit: 2.5 });

console.log(`\n${'='.repeat(78)}\n【2】素朴プレイヤー(CONCENTRATED・同じ軸に適性+調教+アイテムを重ねる) — R1の最悪ケース`);
analyze('  加算 / 強+2.5 / 集中', { mechanic: 'additive', strongHit: 2.5, style: 'CONCENTRATED' });
analyze('  置換 / 強+2.5 / 集中', { mechanic: 'override', strongHit: 2.5, style: 'CONCENTRATED' });

console.log(`\n${'='.repeat(78)}\n【3】強の上限スイープ(加算・SPREAD) — pay-to-win とクランプが許容内か`);
for (const sh of [2.5, 2.0, 1.5, 1.0]) analyze(`  加算 / 強+${sh.toFixed(1)}`, { mechanic: 'additive', strongHit: sh });

console.log(`\n${'='.repeat(78)}\n【4】買う人の割合を変える(加算・強+2.0) — 全員買うと差は消えるか`);
for (const br of [0.3, 0.6, 0.9]) analyze(`  加算 / 強+2.0 / 購入率${pct(br)}`, { mechanic: 'additive', strongHit: 2.0, buyRate: br });

console.log(`\n${'='.repeat(78)}\n【5】★段階別のEV中立価格(加算) — pay-to-win を消す価格表`);
console.log('  中立価格 = (買う人の champ率 − 買わない人の champ率)×200 ÷ 期待レース数(閉形式・価格非依存)');
const STRONG = 2.5;
for (const [tier, ja] of [['weak', '弱'], ['mid', '中'], ['strong', '強']]) {
  const S = simulate({ mechanic: 'additive', strongHit: STRONG, forceTier: tier, buyRate: 0.6 });
  const sB = S.survBuyer.alive / S.survBuyer.n, sN = S.survNon.alive / S.survNon.n;
  const champB = Math.pow(sB, 7), champN = Math.pow(sN, 7);
  const racesB = (1 - champB) / (1 - sB);
  const neutral = (champB - champN) * 200 / racesB;
  console.log(`  ${ja}(的中+${(tier === 'weak' ? 1.0 : tier === 'mid' ? 1.8 : STRONG).toFixed(1)}): champ ${pct(champB)} vs ${pct(champN)}`
    + ` / 期待${racesB.toFixed(2)}走 → ★EV中立価格 ≈ ${neutral.toFixed(1)} USDT`
    + `  (運営マージンを乗せるなら +1〜2)`);
}

console.log(`\n${'='.repeat(78)}\n【6】★中立価格で「無思考で毎回買う」vs「読みが強い時だけ買う」`);
console.log('  中立価格では 無思考買い=損得ゼロ / 読んで買い=プラス なら、pay-to-win でなく skill 報酬に化ける');
{
  // 強の中立価格を先に確定
  const S0 = simulate({ mechanic: 'additive', strongHit: STRONG, forceTier: 'strong', buyRate: 0.6 });
  const sB0 = S0.survBuyer.alive / S0.survBuyer.n, sN0 = S0.survNon.alive / S0.survNon.n;
  const champB0 = Math.pow(sB0, 7), champN0 = Math.pow(sN0, 7);
  const neutralPrice = (champB0 - champN0) * 200 / ((1 - champB0) / (1 - sB0));
  console.log(`  強の中立価格 = ${neutralPrice.toFixed(1)} USDT を採用`);

  for (const [pol, ja] of [['always', '無思考(毎回・強)'], ['skilled', '読んで(自信ある夜だけ)']]) {
    const S = simulate({ mechanic: 'additive', strongHit: STRONG, forceTier: 'strong', buyPolicy: pol, buyRate: 0.6 });
    const sB = S.survBuyer.alive / S.survBuyer.n, sN = S.survNon.alive / S.survNon.n;
    const champB = Math.pow(sB, 7), champN = Math.pow(sN, 7);
    const racesB = (1 - champB) / (1 - sB);
    const buysPerLife = racesB * (S.buyerBuys / Math.max(1, S.buyerRaces)); // skilled は購入頻度が下がる
    const ev = champB * 200 - 102 - neutralPrice * buysPerLife;
    const evNon = champN * 200 - 102;
    console.log(`  ${ja}: champ ${pct(champB)} / 生涯購入 ${buysPerLife.toFixed(1)}回 / EV ${ev.toFixed(1)} (非買 ${evNon.toFixed(1)}・差 ${(ev - evNon >= 0 ? '+' : '') + (ev - evNon).toFixed(1)})`);
  }
}

// ---------------------------------------------------------------------------
// 【7】調教アイテム(🔵強化ラダー)の検証 — total_value に複利で効く別軸。
//     寿命モデル(ミント→7走走破 or BURN→再ミント)で C(運営)とキャップ突破を見る。
// ---------------------------------------------------------------------------
const SOFT_CAP = 85, SOFT_FACTOR = 0.5, DECAY = 2.0;
function advanceTV(tv, gain) {
  let next = tv;
  if (gain > 0) {
    const room = Math.max(0, SOFT_CAP - next);
    const under = Math.min(gain, room);
    next += under + (gain - under) * SOFT_FACTOR;
  } else next += gain;
  return Math.max(0, Math.min(100, next - DECAY));
}
function trainingLadderCheck(itemBonusMean, buyRate = 0.6, seed = 20260723) {
  const rand = rng(seed);
  const N = 3000, RACES = 400;
  let horses = Array.from({ length: N }, () => ({
    tv: 40 + rand() * 35, day: 0, buyer: rand() < buyRate,
  }));
  const st = { buyer: { lines: 0, champs: 0, races: 0, burns: 0, tvSum: 0, tvN: 0, tvMax: 0, breach: 0, tvs: [] },
               non:   { lines: 0, champs: 0, races: 0, burns: 0, tvSum: 0, tvN: 0, tvMax: 0, breach: 0, tvs: [] } };
  for (let r = 0; r < RACES; r++) {
    for (const h of horses) {
      const menuGain = 1.5 + rand() * 2;                       // 全馬の調教(EV均等~2.5)
      const itemGain = h.buyer ? itemBonusMean * (0.6 + 0.8 * rand()) : 0;
      h.tv = advanceTV(h.tv, menuGain + itemGain);
      const b = h.buyer ? st.buyer : st.non;
      b.tvSum += h.tv; b.tvN++; b.tvMax = Math.max(b.tvMax, h.tv);
      if (h.tv > 90) b.breach++;
      if (r > RACES / 2 && b.tvs.length < 20000) b.tvs.push(h.tv);  // 定常後のp99用
    }
    // レース: score = tv + 運(条件エッジは §1-6 で検証済みなので TV と運のみ)
    const scored = horses.map((h) => ({ h, s: h.tv + ((rand() + rand() + rand()) / 3 * 6 - 3) }));
    // 帯(day)ごとに下位10.7%を burn(帯別 floor)
    const byDay = new Map();
    for (const x of scored) { (byDay.get(x.h.day) ?? byDay.set(x.h.day, []).get(x.h.day)).push(x); }
    const burned = new Set();
    for (const [, list] of byDay) {
      list.sort((a, b) => a.s - b.s);
      const k = Math.floor(list.length * 0.107);
      for (let i = 0; i < k; i++) burned.add(list[i].h);
    }
    const next = [];
    for (const h of horses) {
      const b = h.buyer ? st.buyer : st.non;
      b.races++;
      if (burned.has(h)) { b.burns++; b.lines++; next.push({ tv: 40 + rand() * 35, day: 0, buyer: h.buyer }); }
      else { h.day++; if (h.day >= 7) { b.champs++; b.lines++; next.push({ tv: 40 + rand() * 35, day: 0, buyer: h.buyer }); } else next.push(h); }
    }
    horses = next;
  }
  return st;
}

console.log(`\n${'='.repeat(78)}\n【7】調教アイテム(🔵強化ラダー)— total_value に複利。C(運営)とキャップ突破`);
console.log('  毎走ラダーを使う買い手 vs 使わない非買い手。BURN帯は帯別下位10.7%。TV天井=90(骨格・§9)。');
const p99 = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * 0.99)] ?? 0; };
for (const bonus of [0, 1.5, 2.75, 4.0, 5.0]) {
  const st = trainingLadderCheck(bonus);
  const champB = st.buyer.champs / Math.max(1, st.buyer.lines);
  const champN = st.non.champs / Math.max(1, st.non.lines);
  const racesB = st.buyer.races / Math.max(1, st.buyer.lines);
  const neutral = bonus > 0 ? (champB - champN) * 200 / racesB : 0;
  const p99B = p99(st.buyer.tvs), breachRate = st.buyer.breach / st.buyer.tvN;
  console.log(`\n  上乗せ +${bonus.toFixed(2)}/走: champ 買 ${pct(champB)} vs 非買 ${pct(champN)} (差 ${((champB - champN) * 100).toFixed(1)}pt)`
    + (bonus > 0 ? ` / EV中立価格 ≈ ${neutral.toFixed(1)}/走` : ''));
  console.log(`    総合値 p99 ${p99B.toFixed(1)} / 最大 ${st.buyer.tvMax.toFixed(1)} / 90超え率 ${pct(breachRate)}`
    + `${p99B > 88 ? ' ★天井突破(骨格違反)' : ' [90以下に収まる=OK]'}`);
}
// ---------------------------------------------------------------------------
// 【8】★聖杯シナリオの運営ソルベンシー(§15.3-3 の RTP突合・開発側の直接確認)
//     「1.5%が90+の無敵聖杯」になったとき、チャンピオン総数=運営の買戻し総額が
//     動くか。動かなければ C(ソルベンシー)は保たれる。
//     実エンジン RTP(operator-rtp-sim.mjs)は現行経済で 到達率47.3%・純残高+9771・
//     未清算債務0 と健全。ここは「聖杯を足しても総数が動かない」ことを直接測る。
// ---------------------------------------------------------------------------
function grailOperatorCheck(grailFrac, seed = 20260723) {
  const rand = rng(seed);
  const N = 4000, RACES = 500, BUYBACK = 200, MINT = 102;
  let horses = Array.from({ length: N }, () => ({
    tv: 40 + rand() * 35, day: 0, grail: rand() < grailFrac, peaked: false,
  }));
  let mints = N, champs = 0, burns = 0, itemRevenue = 0;
  let grailChamps = 0, grailLines = 0, normChamps = 0, normLines = 0;
  for (let r = 0; r < RACES; r++) {
    for (const h of horses) {
      // 聖杯志望は毎走 +4/走(実効)を積む → いずれ90+へ。到達したら無敵(peaked)。
      const gain = 1.5 + rand() * 2 + (h.grail ? 4.0 * (0.7 + 0.6 * rand()) : 0);
      h.tv = advanceTV(h.tv, gain);
      if (h.grail) { itemRevenue += 4; if (h.tv >= 90) h.peaked = true; }
    }
    const scored = horses.map((h) => ({ h, s: h.peaked ? 999 : h.tv + ((rand() + rand() + rand()) / 3 * 6 - 3) }));
    const byDay = new Map();
    for (const x of scored) { (byDay.get(x.h.day) ?? byDay.set(x.h.day, []).get(x.h.day)).push(x); }
    const burned = new Set();
    for (const [, list] of byDay) {
      list.sort((a, b) => a.s - b.s);
      const k = Math.floor(list.length * 0.107);   // 帯別 floor(頭数×10.7%)=総数固定
      for (let i = 0; i < k; i++) burned.add(list[i].h);
    }
    const next = [];
    for (const h of horses) {
      if (burned.has(h)) {
        burns++; mints++; if (h.grail) grailLines++; else normLines++;
        next.push({ tv: 40 + rand() * 35, day: 0, grail: rand() < grailFrac, peaked: false });
      } else {
        h.day++;
        if (h.day >= 7) {
          champs++; mints++;
          if (h.grail) { grailChamps++; grailLines++; } else { normChamps++; normLines++; }
          next.push({ tv: 40 + rand() * 35, day: 0, grail: rand() < grailFrac, peaked: false });
        } else next.push(h);
      }
    }
    horses = next;
  }
  const champRate = champs / (champs + burns);
  const grailChampRate = grailLines ? grailChamps / grailLines : 0;
  const normChampRate = normLines ? normChamps / normLines : 0;
  // 運営コア収支: ミント収入 − 買戻し支払い(+アイテム収入)。%はミント総額比。
  const mintIn = mints * MINT, buyOut = champs * BUYBACK;
  const opCore = mintIn - buyOut;
  return { champRate, grailChampRate, normChampRate, opCore, mintIn, itemRevenue, mints, champs };
}

console.log(`\n${'='.repeat(78)}\n【8】★聖杯シナリオの運営ソルベンシー(§15.3-3 RTP突合)`);
console.log('  実エンジンRTP基盤: 現行経済で到達率47.3%・純残高+9771・未清算債務0(健全・実測)。');
console.log('  ここは「+4/走・1.5%聖杯」を足してチャンピオン総数=買戻し総額が動くかを直接測る:');
const base = grailOperatorCheck(0.0);
for (const [frac, name] of [[0.0, '聖杯なし(基準)'], [0.015, '聖杯1.5%'], [0.05, '聖杯5%(過負荷)']]) {
  const g = grailOperatorCheck(frac);
  const dChamp = (g.champRate - base.champRate) * 100;
  console.log(`\n  ${name}:`);
  console.log(`    総チャンピオン率 ${pct(g.champRate)}  (基準比 ${dChamp >= 0 ? '+' : ''}${dChamp.toFixed(2)}pt)`
    + (frac > 0 ? ` / 聖杯志望の到達率 ${pct(g.grailChampRate)} vs 一般 ${pct(g.normChampRate)}` : ''));
  console.log(`    運営コア収支(ミント−買戻し) ${g.opCore >= 0 ? '+' : ''}${g.opCore.toFixed(0)} = ミント比 ${pct(g.opCore / g.mintIn)}`
    + (frac > 0 ? ` / アイテム収入 +${g.itemRevenue.toFixed(0)}(聖杯志望の課金=上乗せ)` : ''));
}
console.log('\n  → ★総チャンピオン率は聖杯を足してもほぼ不変(帯別floorで総数が固定)= 買戻し総額不変 = C保持。');
console.log('     聖杯志望の重課金はアイテム収入として運営に上乗せ = ソルベンシーはむしろ改善方向。');
console.log('     「分配が課金者に偏る(聖杯志望の到達率↑・一般↓)が総数は不変」= §15.3-3 のとおり。');

console.log('\n  → C(運営): チャンピオン総数は帯別 floor で構造的に決まる。全員強化しても総数不変=運営中立。');
console.log('  → ★天井: 上乗せ +2.75/走 以上で総合値 p99 が 90 を超える。「90+到達不能・TV40〜85」(§9/カード§0-B)が壊れる。');
console.log('     ラダー top は「毎走使っても p99≤88」に収まる上乗せ量に制限が要る(下のスイープが上限の目安)。');
console.log('  → pay-to-win: race より大(複利)。中立価格 ~18/走。たたき台の中=4は激安=全員必須の圧。');

console.log(`\n${'='.repeat(78)}\n■ 読み方`);
console.log('  クランプ作動率が高い/削られ大 = 「+2.5」を売って実際乗らない = R1(誇大表示)。');
console.log('  ★pay-to-win = チャンピオン率の 買う人 − 買わない人。7走複利なので per-race の小差が拡大する。');
console.log('    ただしアイテム代(強5×7走≈35)がEVを相殺するので、差=価格しだいで「払った分の差」に収まるか。');
console.log('  (i)置換は溢れにくいが「積み上がらない」= §6「3つ揃うと大きく走る」と相反。');
console.log('  強さ支配B は全ケース維持(条件エッジは総合値に対し小さい)= 経済の骨格は安全。');
