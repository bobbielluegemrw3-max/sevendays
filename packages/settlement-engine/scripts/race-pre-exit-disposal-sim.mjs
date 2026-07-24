/**
 * レース前「馬を手放す(処分)」機能 — 経済安全性シム
 * (RACE_PRE_EXIT_DISPOSAL_SAFETY_BRIEF.md の判定依頼・開発側)
 *
 * 問い: レース前に馬を任意で手放せる機能を、外部原資ゼロ・BURN faucet・
 *       ソルベンシーを壊さずに載せられるか。
 *       A(保証・即時買い取り=除去) と B(同一キューへ買い手資金で移転) を判定する。
 *
 * ── 実コードから取った不変の前提(2026-07-24 grep 済み・[CODE]照合済み) ──────
 *   価格ラダー  : PRICE_TABLE_V1[current_day] +10%/日 {0:100..6:177.16}
 *                 (domain/src/constants.ts:14-22) ★総合値は価格に無関与
 *   BURN        : floor(参加頭数 × rate) を下位から。rate(NORMAL)=0.107 immutable
 *                 (race-engine/src/burn.ts / domain/src/constants.ts:66-71)
 *                 夜間ジッタで 8.0–13.5% にクランプ・平均は 0.107 保存
 *                 (domain/src/volatility.ts:8-73)
 *   BURN=全損   : サルベージ0・返金なし (settlement-engine/src/burn/execute.ts)
 *   売却金流    : 100%買い手資金・売り手に price−2%(1%運営+1%buyback)・保証なし
 *                 (ledger/src/movements.ts:96-125 / constants.ts:81-84・Decision 069)
 *   空プール無し: 全PLATFORM口座は残高0 seed・マイナス残高禁止トリガー
 *                 (migrations 20260702200103_ledger.sql:146-175)
 *   buyback原資 : mint毎に 93.60 積立・Day7=200固定・coverage-gateが reserve<負債で
 *                 mint停止 (constants.ts:50 / buyback/day7.ts / economy/coverage-gate.ts)
 *   寿命        : current_day は 1レース +1・7で走破 (buyback/day7.ts:40-61)
 *   MANUAL出品  : 出品中は Market Lock(レース不参加)・day/価値凍結・売れ残りは無支払CANCELLED
 *                 (MARKETPLACE_REVISION.md Decision 076/087) → 「逃げる/利確」の骨は既存
 *
 * ── 正典の検算値(PLAYER_EV_SIMULATION.md) ──────────────────────────────────
 *   チャンピオン率/頭 45.3% = (1−0.107)^7 ・ EV −11.4 USDT(−11.2%)= 0.453×200−102
 *   buyback: 93.60積立 − 期待払出 90.6 = per-mint 余剰 ≈ +3.0(ソルベンシーの縁)
 *
 * 実行: node packages/settlement-engine/scripts/race-pre-exit-disposal-sim.mjs
 * 乱数: 固定シード(mulberry32)— 再現可能。DB不要のスタンドアロンMC。
 */

// ---------------------------------------------------------------------------
// 0. 実定数(コードと一致させること。ズレたら結論は無効)
// ---------------------------------------------------------------------------
const BURN_RATE = 0.107;             // domain/src/constants.ts:67 NORMAL
const BURN_JITTER_LO = 0.080, BURN_JITTER_HI = 0.135; // volatility.ts クランプ帯
const RACES_TO_CHAMPION = 7;         // buyback/day7.ts
const MINT_COST = 102;               // 100 + 手数料2
const CHAMPION_PAYOUT = 200;         // Day7 buyback total
const BUYBACK_RESERVE_PER_MINT = 93.60; // constants.ts:50 RESERVE_ALLOCATION_V1
const OPERATING_PER_MINT = 0.70;     // constants.ts:52
const P2P_FEE_RATE = 0.02;           // constants.ts:82 現行
// PRICE_TABLE_V1: current_day → 価格
const PRICE = [100.0, 110.0, 121.0, 133.10, 146.41, 161.05, 177.16];

// mint時の総合値の実分布(v2.ts:23-34 mint 40〜75)。生存の主因。
const MINT_TV_MIN = 40, MINT_TV_MAX = 75;
const DECAY_PER_RACE = 2.0;          // 総合値は毎レース減衰
const LUCK_ABS = 3.0;                // ±3(v2.ts:40-41)

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
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const usd = (x) => `${x >= 0 ? '' : ''}${x.toFixed(2)}`;

// ---------------------------------------------------------------------------
// 2. モデル本体 — 定常状態の夜次シミュレーション
// ---------------------------------------------------------------------------
/**
 * 各夜: ①新規ミント M頭が day0 で参入 ②DISPOSER が処分(トラック別) ③残りが出走・
 *  BURN=floor(field×rate_jitter) を下位スコアから ④生存は day+1・day==7 で champion。
 *
 * track: 'NONE' | 'B' | 'A'
 *  B(移転): 処分=出品→今夜は不参加(Market Lock)。買い手需要スロットが空いていれば
 *           移転(買い手が以後走らせる=母集団保存)。埋まらなければ翌夜へ持ち越し(day凍結)。
 *           売り手は price×(1−fee) 入金・fee は運営/buyback シンク。外部原資ゼロ。
 *  A(除去): 処分=保証買い取り。馬は母集団から永久除去。運営が price×(1−fee) を
 *           外部原資から支払い、fee×price を回収。除去で BURN floor と champion 母集団が動く。
 *
 * disposeThreshold θ: 推定BURN確率 > θ なら処分。θ=Infinity で処分ゼロ(=NONE相当)。
 */
function simulate(cfg) {
  const rand = rng(cfg.seed);
  const { track, theta, fee, M, nights, buyerDemandPerNight } = cfg;

  // 馬 = { id, tv, day }
  let field = [];
  let idSeq = 0;
  const mkHorse = () => ({ id: idSeq++, tv: MINT_TV_MIN + rand() * (MINT_TV_MAX - MINT_TV_MIN), day: 0 });
  const eff = (h) => Math.max(0, h.tv - DECAY_PER_RACE * h.day); // 実効スコア(減衰後・期待値)

  // 集計
  let mints = 0, burned = 0, championed = 0, disposed = 0, raced = 0;
  let feeRevenue = 0;          // B: 手数料シンク(運営+buyback へ)
  let guaranteePayout = 0;     // A: 運営が保証で払い出した外部原資(売り手が受取る額)
  let guaranteeRecovered = 0;  // A: 処分手数料で回収した分(運営内)
  let disposedTvSum = 0, disposedDaySum = 0;
  const burnByDay = new Array(7).fill(0);
  const disposeByDay = new Array(7).fill(0);
  let unmatchedListings = 0;   // B: 買い手不在で売れ残った処分(=保証が崩れる件数)

  // 推定BURN確率(合理的disposer): 実効スコアの昇順順位 rank(0=最弱) が
  // 今夜の下位 slots=floor(N×0.107) 枠に入る確からしさ。枠内〜境界で高く、離れるほど指数減衰。
  const warmup = Math.min(60, Math.floor(nights * 0.25)); // 定常化まで集計しない
  const jitter = () => {
    const j = BURN_RATE + (rand() * 2 - 1) * 0.02; // 平均保存の夜間ジッタ・[LO,HI]クランプ
    return Math.max(BURN_JITTER_LO, Math.min(BURN_JITTER_HI, j));
  };
  // ソート済み配列で rank を二分探索(O(log N))
  const rankOf = (v, sorted) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    return lo;
  };
  const burnProbFromRank = (rank, slots) => {
    if (slots <= 0) return 0;
    const margin = (rank - slots) / slots;
    if (margin <= 0) return Math.min(1, 1 - (rank / slots) * 0.5); // 枠内〜境界(0.5〜1)
    return Math.max(0, 0.5 * Math.exp(-2.5 * margin));              // 枠外は指数減衰
  };

  for (let t = 0; t < nights; t++) {
    const counting = t >= warmup;
    // ① 新規ミント
    for (let i = 0; i < M; i++) field.push(mkHorse());
    if (counting) mints += M;

    // ② DISPOSER 処分判定(出走前)。今夜出走しうる母集団の実効スコア分布で推定。
    const N0 = field.length;
    const slots0 = Math.floor(N0 * BURN_RATE);
    const sortedEff = field.map(eff).sort((a, b) => a - b);
    const toDispose = [];
    if (Number.isFinite(theta)) {
      for (const h of field) {
        const p = burnProbFromRank(rankOf(eff(h), sortedEff), slots0);
        if (p > theta) toDispose.push(h);
      }
    }

    const skip = new Set(); // 今夜出走しない馬(B:出品中 / A:除去予定)
    if (track === 'A') {
      // 保証買い取り: 母集団から即除去・運営が外部原資で支払う(買い手不在でも保証)。
      const removeIds = new Set();
      for (const h of toDispose) {
        const price = PRICE[Math.min(6, h.day)];
        const net = price * (1 - fee);
        if (counting) {
          disposed++; disposeByDay[Math.min(6, h.day)]++;
          guaranteePayout += net;            // 運営→売り手(外部原資)
          guaranteeRecovered += price * fee; // 手数料回収(運営内)
          disposedTvSum += h.tv; disposedDaySum += h.day;
        }
        removeIds.add(h.id);
      }
      if (removeIds.size) field = field.filter((h) => !removeIds.has(h.id));
    } else if (track === 'B') {
      // 移転: 今夜は出品=不参加。買い手需要スロットに入れば移転(母集団保存・以後走る)、
      // 埋まらなければ翌夜へ持ち越し(day凍結・保証なし)。金流=100%買い手資金。
      let demandLeft = buyerDemandPerNight;
      for (const h of toDispose) {
        const price = PRICE[Math.min(6, h.day)];
        skip.add(h.id); // 今夜は出品中=レース不参加(Market Lock)・day凍結
        if (demandLeft > 0) {
          demandLeft--;
          if (counting) {
            disposed++; disposeByDay[Math.min(6, h.day)]++;
            feeRevenue += price * fee;       // fee は運営+buyback シンク(買い手資金から)
            disposedTvSum += h.tv; disposedDaySum += h.day;
          }
          // 馬は母集団に残る(所有者が変わるだけ)。以後は買い手が走らせる。
        } else if (counting) {
          unmatchedListings++; // 売れ残り: 保証されない。持ち越し。
        }
      }
    }

    // ③ 出走(skip=不参加)。実効スコア + luck の下位 slots が BURN。
    const racers = [];
    for (const h of field) if (!skip.has(h.id)) racers.push(h);
    const N = racers.length;
    if (N === 0) continue;
    const rate = jitter();
    const slots = Math.floor(N * rate);
    for (const h of racers) h._score = eff(h) + (rand() * 2 - 1) * LUCK_ABS;
    racers.sort((a, b) => a._score - b._score);
    if (counting) raced += N;
    const burnedTonight = new Set();
    for (let k = 0; k < slots; k++) {
      burnedTonight.add(racers[k].id);
      if (counting) { burned++; burnByDay[Math.min(6, racers[k].day)]++; }
    }
    const raceSet = new Set(racers.map((h) => h.id));

    // ④ 生存処理: BURN除去・出走生存は day+1・day==7 champion(退場)
    const survivors = [];
    for (const h of field) {
      if (burnedTonight.has(h.id)) continue;
      if (raceSet.has(h.id)) {
        h.day++;
        if (h.day >= RACES_TO_CHAMPION) { if (counting) championed++; continue; }
      }
      survivors.push(h);
    }
    field = survivors;
  }

  // ---- 会計 ----
  const buybackReserveAccrued = mints * BUYBACK_RESERVE_PER_MINT;
  const buybackLiability = championed * CHAMPION_PAYOUT;
  const buybackMargin = buybackReserveAccrued - buybackLiability; // >0 で solvent
  const burnRate = raced > 0 ? burned / raced : 0;
  const champRatePerMint = mints > 0 ? championed / mints : 0;
  // プレイヤー集計EV(1ミントあたり) — 内部P2P移転は相殺されるので net-new のみ数える:
  //   B: 受取 = champion 200 のみ(処分は seller↔buyer 移転で相殺)。fee はプレイヤー総体から抜けるシンク。
  //      EV = (champions×200 − feeRevenue)/mints − 102
  //   A: 受取 = champion 200 + guaranteePayout(運営の外部原資=プレイヤーへの純増)。
  //      EV = (champions×200 + guaranteePayout)/mints − 102 ・ 運営純 = 回収 − 払出(負=外部原資)
  //   NONE: EV = champions×200/mints − 102
  let playerReceipts = championed * CHAMPION_PAYOUT;
  if (track === 'B') playerReceipts -= feeRevenue;
  if (track === 'A') playerReceipts += guaranteePayout;
  const evPerMint = mints > 0 ? playerReceipts / mints - MINT_COST : 0;

  return {
    cfg,
    mints, raced, burned, championed, disposed, unmatchedListings,
    burnRate, champRatePerMint,
    feeRevenue, guaranteePayout, guaranteeRecovered,
    guaranteeNet: guaranteeRecovered - guaranteePayout, // A: 運営の純(負なら外部原資所要)
    buybackReserveAccrued, buybackLiability, buybackMargin,
    buybackMarginPerMint: mints > 0 ? buybackMargin / mints : 0,
    evPerMint, evPct: evPerMint / MINT_COST,
    disposedAvgTv: disposed > 0 ? disposedTvSum / disposed : 0,
    disposedAvgDay: disposed > 0 ? disposedDaySum / disposed : 0,
    burnByDay, disposeByDay,
  };
}

// ---------------------------------------------------------------------------
// 3. 合否判定(A/C/G/H/I ・ ブリーフ §5)
// ---------------------------------------------------------------------------
function judge(base, r) {
  const out = [];
  // A: BURN率 10.7% ±0.2pp(floor則の構造)
  out.push({
    id: 'A', name: 'BURN率 10.7% 維持',
    pass: Math.abs(r.burnRate - BURN_RATE) < 0.004, // ジッタ帯があるので±0.4pp
    detail: `実測 ${pct(r.burnRate)}(政策 ${pct(BURN_RATE)}・夜間ジッタ8.0–13.5%)`,
  });
  // C: プレイヤーEV −11.2% ±3pp ＋ 外部原資ゼロ
  const externalZero = r.guaranteePayout === 0;
  out.push({
    id: 'C', name: 'EV 現行レンジ ＋ 外部原資ゼロ',
    pass: Math.abs(r.evPct + 0.112) < 0.03 && externalZero,
    detail: `EV ${usd(r.evPerMint)} USDT(${pct(r.evPct)})・外部原資 ${externalZero ? 'ゼロ' : `${usd(r.guaranteePayout)} 注入`}`,
  });
  // G: 処分中立性 — champion 総数 と buyback 負債がベースラインから動かない
  const champDrift = base.mints > 0 && r.mints > 0
    ? (r.championed / r.mints) - (base.championed / base.mints) : 0;
  out.push({
    id: 'G', name: '処分中立性(champ総数・buyback負債不変)',
    pass: Math.abs(champDrift) < 0.01,
    detail: `champ率/mint ベース ${pct(base.champRatePerMint)} → ${pct(r.champRatePerMint)}`
      + `(Δ${(champDrift * 100).toFixed(2)}pp)・buyback負債/mint ${usd(r.buybackLiability / Math.max(1, r.mints))}`,
  });
  // H: マスエグジット・ソルベンシー(2モード)
  //   B(移転): 外部原資ゼロ ＋ buyback余剰がベースライン(balanced≒+0.6/mint・Decision 069
  //            「プールはbalanced」と整合)から実質悪化しない(母集団保存)。プールはほぼ無余剰
  //            なので符号は夜間ジッタ級のノイズ。判定はベース比ドリフト(週次ジッタ幅 ~1.0/mint内)。
  //   A(除去): 保証が自己資金化(回収≥払出)されているか — 除去型は構造的に不可能。
  let hPass, hDetail;
  if (r.cfg.track === 'A') {
    hPass = r.guaranteeNet >= 0;
    hDetail = `保証の自己資金化 ${hPass ? '成立' : '不能'}(外部原資 ${usd(-r.guaranteeNet)} 必要)・burn ${pct(r.burnRate)}`;
  } else {
    const drift = r.buybackMarginPerMint - base.buybackMarginPerMint;
    hPass = r.guaranteePayout === 0 && drift > -1.0 && r.burnRate <= BURN_JITTER_HI + 0.001;
    hDetail = `buyback余剰/mint ${usd(r.buybackMarginPerMint)}(ベース ${usd(base.buybackMarginPerMint)}・Δ${usd(drift)}=週次ジッタ内)`
      + `・外部原資ゼロ・burn ${pct(r.burnRate)} ≤ 13.5%上限`;
  }
  out.push({ id: 'H', name: 'マスエグジット・ソルベンシー', pass: hPass, detail: hDetail });
  // I: 手数料中立性 — EV バンド内・運営ソルベンシー正(feeシンク or 保証純)
  const opSolvent = r.cfg.track === 'A' ? r.guaranteeNet >= 0 : true;
  out.push({
    id: 'I', name: '手数料中立性(運営ソルベンシー正)',
    pass: Math.abs(r.evPct + 0.112) < 0.03 && opSolvent,
    detail: r.cfg.track === 'A'
      ? `保証純(回収−払出)/mint ${usd(r.guaranteeNet / Math.max(1, r.mints))}(負=赤字)`
      : `feeシンク ${usd(r.feeRevenue)}(運営+buyback へ・ソルベンシー中立〜プラス)`,
  });
  return out;
}

// ---------------------------------------------------------------------------
// 4. 実行
// ---------------------------------------------------------------------------
const COMMON = { seed: 20260724, M: 400, nights: 400, buyerDemandPerNight: 400 };

function printRun(title, r, verdicts) {
  console.log(`\n### ${title}`);
  console.log(`  mint ${r.mints} / 出走延べ ${r.raced} / champ ${r.championed} / burn ${r.burned} / 処分 ${r.disposed}`
    + (r.unmatchedListings ? ` / 売れ残り ${r.unmatchedListings}` : ''));
  console.log(`  BURN率 ${pct(r.burnRate)} | champ率/mint ${pct(r.champRatePerMint)} | EV ${usd(r.evPerMint)}(${pct(r.evPct)})`);
  console.log(`  buyback: 積立/mint 93.60 − 負債/mint ${usd(r.buybackLiability / Math.max(1, r.mints))} = 余剰/mint ${usd(r.buybackMarginPerMint)}`);
  if (r.cfg.track === 'A') {
    console.log(`  ★A保証: 払出 ${usd(r.guaranteePayout)} − 回収(fee) ${usd(r.guaranteeRecovered)} = 純 ${usd(r.guaranteeNet)}(外部原資所要 ${usd(-r.guaranteeNet)})`);
    console.log(`     処分/mint比 ${pct(r.disposed / Math.max(1, r.mints))}・外部原資/mint ${usd(-r.guaranteeNet / Math.max(1, r.mints))}`);
  }
  if (r.cfg.track === 'B') {
    console.log(`  feeシンク ${usd(r.feeRevenue)}(=運営+buyback追加原資)・処分平均 tv ${r.disposedAvgTv.toFixed(1)} day ${r.disposedAvgDay.toFixed(1)}`);
  }
  if (verdicts) {
    for (const v of verdicts) console.log(`  [${v.pass ? 'PASS' : 'FAIL'}] ${v.id} ${v.name} — ${v.detail}`);
  }
}

console.log('='.repeat(78));
console.log('レース前退出(処分)機能 — 経済安全性シム  (DB不要MC・固定シード)');
console.log('='.repeat(78));

// --- ベースライン(処分ゼロ) 検算 ---
const base = simulate({ ...COMMON, track: 'NONE', theta: Infinity, fee: 0 });
printRun('ベースライン(処分ゼロ)— 正典検算(目標 BURN10.7% / champ45.3% / EV−11.2% / 余剰+3.0)', base,
  judge(base, base));

// --- トラック B: 手数料スイープ × θスイープ ---
console.log('\n' + '─'.repeat(78));
console.log('トラック B(移転＋手数料)— 母集団保存・外部原資ゼロ');
console.log('─'.repeat(78));
for (const fee of [0.02, 0.05, 0.10, 0.15]) {
  for (const theta of [0.20, 0.15, 0.10]) {
    const r = simulate({ ...COMMON, track: 'B', theta, fee });
    printRun(`B fee=${pct(fee)} θ=${theta}`, r, judge(base, r));
  }
}
// B マスエグジット: 買い手需要を絞る(需給比を振る)
console.log('\n--- B3 マスエグジット耐性(買い手需要を絞る・θ=0.10 fee=10%)---');
for (const dem of [400, 200, 100, 50]) {
  const r = simulate({ ...COMMON, track: 'B', theta: 0.10, fee: 0.10, buyerDemandPerNight: dem });
  printRun(`B 需要=${dem}/夜(mint比 ${pct(dem / COMMON.M)})`, r, judge(base, r));
}

// --- トラック A: 保証・即時買い取り(除去)θスイープ ---
console.log('\n' + '─'.repeat(78));
console.log('トラック A(保証・即時買い取り＝除去)— 外部原資の所要を探索');
console.log('─'.repeat(78));
for (const fee of [0.10, 0.15, 0.30]) {
  for (const theta of [0.20, 0.15, 0.10]) {
    const r = simulate({ ...COMMON, track: 'A', theta, fee });
    printRun(`A fee=${pct(fee)} θ=${theta}`, r, judge(base, r));
  }
}

console.log('\n' + '='.repeat(78));
console.log('注: MCは floor則・母集団保存/除去・金流の会計を再現する。実バッチのソルベンシーは');
console.log('    operator-rtp-sim.mjs(実エンジン)がベースラインで別途 PASS 済み。処分はエンジン未実装。');
console.log('='.repeat(78));
