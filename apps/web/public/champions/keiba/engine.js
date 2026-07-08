/**
 * KeibaEngine — 予想シアター プロトタイプ用エンジン
 *
 * 元リポジトリ syumi の lib/motion/generate.ts の思想を移植・拡張した単体版。
 *  - 4競馬場の実形状(直線長・コーナー半径)を解析的トラックで再現
 *  - 出馬表生成(馬名・騎手・脚質・能力・オッズ)
 *  - 予想→運動データ(t, dist_m, lane, speed)変換 + Monte Carlo
 *  - 払戻計算・馬券判定
 */
window.KeibaEngine = (function () {
  "use strict";
  const TAU = Math.PI * 2;

  // ───────── RNG ─────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  const smoothLerp = (a, b, t) => a + (b - a) * smoothstep(0, 1, clamp(t, 0, 1));

  // ───────── トラック幾何(解析的・角丸オーバル) ─────────
  // lap = 2*straight + 2πr。CCW(左回り)で構築し、右回りは x を鏡映。
  function makeTrack(cfg) {
    const { lap, straight: S, handed, width, distance: D } = cfg;
    const r = (lap - 2 * S) / TAU;
    const arc = Math.PI * r;
    const mirror = handed === "右" ? -1 : 1;
    // s(0..lap) → {x,z,tx,tz,nx,nz}  (n=内向き法線)
    function pointAtS(sIn) {
      let s = sIn % lap; if (s < 0) s += lap;
      let x, z, tx, tz;
      if (s < S) {                       // ホーム直線 (0,0)→(S,0)
        x = s; z = 0; tx = 1; tz = 0;
      } else if (s < S + arc) {          // 1-2角 中心(S, r)
        const th = -Math.PI / 2 + (s - S) / r;
        x = S + r * Math.cos(th); z = r + r * Math.sin(th);
        tx = -Math.sin(th); tz = Math.cos(th);
      } else if (s < 2 * S + arc) {      // 向こう正面 (S,2r)→(0,2r)
        const u = s - S - arc;
        x = S - u; z = 2 * r; tx = -1; tz = 0;
      } else {                           // 3-4角 中心(0, r)
        const th = Math.PI / 2 + (s - 2 * S - arc) / r;
        x = r * Math.cos(th); z = r + r * Math.sin(th);
        tx = -Math.sin(th); tz = Math.cos(th);
      }
      // 内向き法線 = 接線を+90°回転(CCW時)
      let nx = -tz, nz = tx;
      x *= mirror; tx *= mirror; nx *= mirror;
      return { x, z, tx, tz, nx, nz };
    }
    const finishS = S;                    // ゴール=ホーム直線の終端
    function raceToS(dist) {
      let s = (finishS - (D - dist)) % lap;
      if (s < 0) s += lap;
      return s;
    }
    function laneWorld(dist, lane) {
      const p = pointAtS(raceToS(dist));
      const off = width / 2 - lane;       // lane=0が最内
      return { x: p.x + p.nx * off, z: p.z + p.nz * off, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz };
    }
    return {
      lap, straight: S, r, arc, width, handed, distance: D,
      finishS, mirror,
      centroid: { x: mirror * S / 2, z: r },
      backMid: pointAtS(S + arc + S / 2),
      pointAtS, raceToS, laneWorld,
      bounds: (() => {
        let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
        for (let i = 0; i < 240; i++) {
          const p = pointAtS((i / 240) * lap);
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        }
        const m = width / 2 + 4;
        return { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m };
      })(),
    };
  }

  // ───────── 競馬場定義 ─────────
  const VENUES = [
    {
      id: "tokyo", name: "東京競馬場", short: "東京", handed: "左",
      lap: 2083, straight: 525.9, width: 30, distance: 2400, parTime: 146.8,
      raceNo: 11, raceName: "蒼穹ステークス", grade: "GⅠ", surface: "芝", going: "良",
      skyline: "fuji", pond: "twin", standLabel: "フジビュースタンド風",
      desc: "左回り・直線525m。広いコースでスケールの大きい末脚勝負。",
    },
    {
      id: "nakayama", name: "中山競馬場", short: "中山", handed: "右",
      lap: 1667, straight: 310, width: 24, distance: 2500, parTime: 155.2,
      raceNo: 11, raceName: "冬陽グランプリ", grade: "GⅠ", surface: "芝", going: "良",
      skyline: "city", pond: "small", standLabel: "グランドスタンド風",
      desc: "右回り・直線310m+急坂。小回りで器用さと持続力が問われる。",
    },
    {
      id: "hanshin", name: "阪神競馬場", short: "阪神", handed: "右",
      lap: 1689, straight: 356.5, width: 26, distance: 2200, parTime: 133.9,
      raceNo: 11, raceName: "浪花記念", grade: "GⅠ", surface: "芝", going: "良",
      skyline: "rokko", pond: "garden", standLabel: "メインスタンド風",
      desc: "右回り内回り・直線356m。ゴール前の急坂でドラマが起きる。",
    },
    {
      id: "kyoto", name: "京都競馬場", short: "京都", handed: "右",
      lap: 1894, straight: 403.7, width: 28, distance: 2400, parTime: 147.3,
      raceNo: 11, raceName: "洛東大賞典", grade: "GⅠ", surface: "芝", going: "良",
      skyline: "hills", pond: "large", standLabel: "ステーションスタンド風",
      desc: "右回り外回り・直線404m。3角の坂の下りから一気に動く。",
    },
  ];
  VENUES.forEach((v) => { v.track = makeTrack(v); });
  const venueById = (id) => VENUES.find((v) => v.id === id);

  // ───────── コース諸元(JRA10 + NAR14・公式諸元編纂 2026-06-21) ─────────
  // 各値: lap=1周m, straight=ゴール前直線m, handed=右/左, width=幅員m, slope=高低差/坂(m,描画用・将来)。
  // 内外回り併存(中山/京都/阪神/新潟)は variants[].dists で距離判定、def=既定。
  // 出典: JRA公式コース紹介 / NAR keiba.go.jp 各場 / 各主催者公式(Web裏取り済)。
  const COURSE_DATA = {
    // ─ JRA ─
    "札幌": { "芝": { lap: 1641, straight: 266, handed: "右", width: 26, slope: 0.7 }, "ダート": { lap: 1487, straight: 264, handed: "右", width: 20, slope: 0.9 } },
    "函館": { "芝": { lap: 1627, straight: 262, handed: "右", width: 26, slope: 3.5 }, "ダート": { lap: 1476, straight: 260, handed: "右", width: 20, slope: 3.5 } },
    "福島": { "芝": { lap: 1600, straight: 292, handed: "右", width: 26, slope: 1.9 }, "ダート": { lap: 1445, straight: 296, handed: "右", width: 23, slope: 2.1 } },
    "新潟": {
      "芝": { variants: [
        { dists: [1200, 1400, 2000, 2200, 2400], lap: 1623, straight: 359, handed: "左", width: 28, slope: 0.8 },
        { def: true, dists: [1600, 1800, 3000, 3200], lap: 2223, straight: 659, handed: "左", width: 28, slope: 2.2 },
      ] },
      "ダート": { lap: 1473, straight: 354, handed: "左", width: 20, slope: 0.6 },
    },
    "東京": { "芝": { lap: 2083, straight: 526, handed: "左", width: 33, slope: 2.7 }, "ダート": { lap: 1899, straight: 502, handed: "左", width: 25, slope: 2.5 } },
    "中山": {
      "芝": { variants: [
        { dists: [1800, 2000, 2500, 3600], lap: 1667, straight: 310, handed: "右", width: 25, slope: 2.2 },
        { def: true, dists: [1200, 1600, 2200, 2600, 4000], lap: 1840, straight: 310, handed: "右", width: 25, slope: 2.2 },
      ] },
      "ダート": { lap: 1493, straight: 308, handed: "右", width: 23, slope: 2.2 },
    },
    "中京": { "芝": { lap: 1706, straight: 413, handed: "左", width: 28, slope: 3.5 }, "ダート": { lap: 1530, straight: 411, handed: "左", width: 25, slope: 3.4 } },
    "京都": {
      "芝": { variants: [
        { dists: [1100, 1200, 1400, 2000], lap: 1783, straight: 328, handed: "右", width: 30, slope: 3.1 },
        { def: true, dists: [1600, 1800, 2200, 2400, 3000, 3200], lap: 1894, straight: 404, handed: "右", width: 30, slope: 4.3 },
      ] },
      "ダート": { lap: 1608, straight: 329, handed: "右", width: 25, slope: 3.0 },
    },
    "阪神": {
      "芝": { variants: [
        { def: true, dists: [1200, 1400, 2000, 2200, 3000, 3200], lap: 1689, straight: 357, handed: "右", width: 26, slope: 1.8 },
        { dists: [1600, 1800, 2400, 2600], lap: 2089, straight: 474, handed: "右", width: 27, slope: 2.4 },
      ] },
      "ダート": { lap: 1518, straight: 353, handed: "右", width: 24, slope: 1.6 },
    },
    "小倉": { "芝": { lap: 1615, straight: 293, handed: "右", width: 30, slope: 3.0 }, "ダート": { lap: 1445, straight: 291, handed: "右", width: 24, slope: 2.9 } },
    // ─ NAR(通常14場・帯広ばんえい除外) ─
    "門別": { "ダート": { lap: 1600, straight: 330, handed: "右", width: 25, slope: 1.5 } },
    "盛岡": { "芝": { lap: 1400, straight: 400, handed: "左", width: 25, slope: 4.6 }, "ダート": { lap: 1600, straight: 400, handed: "左", width: 25, slope: 4.4 } },
    "水沢": { "ダート": { lap: 1200, straight: 245, handed: "右", width: 20, slope: 0 } },
    "浦和": { "ダート": { lap: 1200, straight: 220, handed: "左", width: 24, slope: 0 } },
    "船橋": { "ダート": { lap: 1400, straight: 308, handed: "左", width: 25, slope: 0 } },
    "大井": { "ダート": { lap: 1600, straight: 386, handed: "右", width: 25, slope: 0 } },
    "川崎": { "ダート": { lap: 1200, straight: 300, handed: "左", width: 25, slope: 0 } },
    "金沢": { "ダート": { lap: 1200, straight: 236, handed: "右", width: 20, slope: 0 } },
    "笠松": { "ダート": { lap: 1100, straight: 238, handed: "右", width: 20, slope: 0 } },
    "名古屋": { "ダート": { lap: 1180, straight: 240, handed: "右", width: 30, slope: 0 } },
    "園田": { "ダート": { lap: 1051, straight: 213, handed: "右", width: 22, slope: 1.2 } },
    "姫路": { "ダート": { lap: 1200, straight: 230, handed: "右", width: 23, slope: 0 } },
    "高知": { "ダート": { lap: 1100, straight: 200, handed: "右", width: 25, slope: 1.6 } },
    "佐賀": { "ダート": { lap: 1100, straight: 200, handed: "右", width: 22, slope: 1.0 } },
  };

  /** 会場名×馬場×距離 → コース諸元(内外回りは距離で自動判定)。未登録会場はnull(呼び出し側で代用)。 */
  function resolveCourse(venueName, surface, distance) {
    const v = COURSE_DATA[venueName];
    if (!v) return null;
    const sfc = (surface && surface.indexOf("ダ") >= 0) ? "ダート" : "芝";
    const group = v[sfc] || v["ダート"] || v["芝"];
    if (!group) return null;
    if (group.variants) {
      const hit = group.variants.find((va) => va.dists && va.dists.includes(distance));
      return hit || group.variants.find((va) => va.def) || group.variants[0];
    }
    return group;
  }

  // ───────── 出馬表データ ─────────
  const HORSE_NAMES = [
    "ハヤテノオー", "ミナミノホシ", "サクラエクスプレス", "キタノダイチ",
    "リュウグウノツカイ", "アオイトレジャー", "コガネフェニックス", "シルバーレイン",
    "ブラックスナイパー", "ハナミズキボーイ", "エメラルドウェイブ", "テンノカケハシ",
    "トワノキセキ", "セイランカグラ", "オリオンノツルギ", "カゼノシラベ",
    "アカツキテンペスト", "モモイロカイドウ", "ホシゾラノキオク", "マンゲツノヨル",
    "レイメイサンライズ", "コハクノツルギ", "ユメノツヅキ", "ナミマクラ",
    "フブキランマン", "タソガレシンフォニー", "ヒスイカイリュウ", "シンゲツノヤイバ",
  ];
  const JOCKEYS = [
    "桜井 蓮", "高瀬 駿", "葛城 巧", "内海 慎吾", "風間 大和", "神崎 凌",
    "早瀬 光", "三国 純平", "雨宮 颯太", "白鳥 健", "黒岩 渉", "椎名 拓海",
    "真田 怜", "柊 一馬", "緑川 章", "天城 翔吾", "守屋 篤", "燕 良太",
  ];
  const SILKS = [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#17b8c9",
    "#f032e6", "#9acd32", "#14857a", "#a05a2c", "#5a6acf", "#c9a227",
    "#d44d6e", "#2e7d52", "#7b4fc4", "#cc5500", "#3a7ca5", "#8d6e63",
  ];
  const COATS = ["#5a3a22", "#4a2e18", "#6b4226", "#3c2a1a", "#8a8f96", "#27201a", "#7b4a1f", "#94591f"];
  const STYLES = ["逃げ", "先行", "差し", "追込"];
  const STYLE_DETAIL = {
    "逃げ": ["超積極逃げ", "状況逃げ"], "先行": ["前寄り先行", "安定先行", "後寄り先行"],
    "差し": ["強烈差し", "確実差し", "遅め差し"], "追込": ["極限追込", "強力追込"],
  };
  // 枠色(JRA)
  const WAKU_COLORS = [null, "#ffffff", "#1c1c1c", "#e3343b", "#2c66c4", "#f2d03e", "#3da55a", "#e77f28", "#ef9bc0"];
  const WAKU_TEXT = [null, "#1c1c1c", "#ffffff", "#ffffff", "#ffffff", "#1c1c1c", "#ffffff", "#ffffff", "#1c1c1c"];

  function wakuOf(num, n) {
    // JRA配分: 多頭数は後ろの枠から2頭ずつ
    const base = Math.floor(n / 8), extra = n % 8;
    let cum = 0;
    for (let w = 1; w <= 8; w++) {
      const cnt = base + (w > 8 - extra ? 1 : 0);
      cum += cnt;
      if (num <= cum) return w;
    }
    return 8;
  }

  function makeField(venueId, fieldSeed) {
    const venue = venueById(venueId);
    const seedBase = { tokyo: 11, nakayama: 23, hanshin: 37, kyoto: 53 }[venueId] || 7;
    const rand = mulberry32(seedBase * 1000003 + fieldSeed * 97);
    const n = 14;
    // 馬名・騎手をシャッフルして選抜
    const names = [...HORSE_NAMES], jocks = [...JOCKEYS];
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[names[i], names[j]] = [names[j], names[i]]; }
    for (let i = jocks.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[jocks[i], jocks[j]] = [jocks[j], jocks[i]]; }
    // 脚質を現実的な比率で配る
    const stylePlan = [];
    const counts = { "逃げ": 2, "先行": 4, "差し": 5, "追込": 3 };
    STYLES.forEach((s) => { for (let i = 0; i < counts[s]; i++) stylePlan.push(s); });
    for (let i = stylePlan.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[stylePlan[i], stylePlan[j]] = [stylePlan[j], stylePlan[i]]; }

    const horses = [];
    for (let i = 0; i < n; i++) {
      const num = i + 1;
      const style = stylePlan[i];
      const det = STYLE_DETAIL[style];
      const strength = gaussian(rand) * 1.0;              // 大きいほど強い
      horses.push({
        num, waku: wakuOf(num, n),
        wakuColor: WAKU_COLORS[wakuOf(num, n)], wakuText: WAKU_TEXT[wakuOf(num, n)],
        name: names[i], jockey: jocks[i],
        style, styleDetail: det[Math.floor(rand() * det.length)],
        strength,
        stability: clamp(0.45 + rand() * 0.45, 0, 0.95),  // 位置取り安定度
        kohan: 33.2 + rand() * 2.4,                       // 上がり目安(演出用)
        silks: SILKS[i % SILKS.length],
        coat: COATS[Math.floor(rand() * COATS.length)],
        weight: 440 + Math.floor(rand() * 80),
        age: 3 + Math.floor(rand() * 4),
        sex: rand() < 0.7 ? "牡" : (rand() < 0.5 ? "牝" : "セ"),
      });
    }
    return { venueId, seed: fieldSeed, horses };
  }

  // ───────── 運動生成 ─────────
  const HZ = 10;
  const MAX_SPEED = 19.5;
  const RANK_SIGMA = 1.9;
  const STYLE_POS = { "逃げ": 0, "先行": 1, "差し": 2, "追込": 3 };
  const STYLE_KIN = {
    "逃げ": { baseLane: 2.2, swing: 0.5, kickExp: 0.85 },
    "先行": { baseLane: 4.0, swing: 1.6, kickExp: 1.0 },
    "差し": { baseLane: 7.0, swing: 4.0, kickExp: 1.5 },
    "追込": { baseLane: 9.5, swing: 5.8, kickExp: 1.9 },
  };

  function paceShape(pace) {
    if (pace === "ハイ") return (t) => Math.cos(t * Math.PI) * 0.12;
    if (pace === "スロー") return (t) => -0.10 + Math.pow(t, 2.2) * 0.30;
    return (t) => -0.03 + Math.pow(t, 2.0) * 0.12;
  }

  /** scores(連続値) → 1..N の順位(連続、同値は順序保持) */
  function toRanks(scores) {
    const idx = scores.map((s, i) => [s, i]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(scores.length);
    idx.forEach(([, i], pos) => { ranks[i] = pos + 1; });
    return ranks;
  }

  /**
   * レース生成。
   * mode: 'representative'(揺らぎ無し) | 'sample'(1試行) | 'user'(印どおり決着)
   * marks: { tan: 馬番, ren: 馬番, san: 馬番 } (userモード/判定用)
   */
  function generateRace(venueId, field, opts) {
    const venue = venueById(venueId);
    const track = venue.track;
    const D = track.distance, T = venue.parTime;
    const N = field.horses.length;
    const mode = opts.mode || "sample";
    const seed = opts.seed ?? 12345;
    const rand = mulberry32(seed * 2654435761 + 17);
    const pace = opts.pace || ["スロー", "平均", "ハイ"][Math.floor(mulberry32(field.seed * 31 + 5)() * 3)];

    // ── キーフレームスコア生成 ──
    const strengthScore = field.horses.map((h) => -h.strength); // 小さいほど上位
    let finScore;
    if (mode === "user" && opts.marks && opts.marks.tan) {
      finScore = field.horses.map((h) => {
        if (h.num === opts.marks.tan) return -100;
        if (h.num === opts.marks.ren) return -99;
        if (h.num === opts.marks.san) return -98;
        return -h.strength;
      });
    } else if (mode === "sample") {
      finScore = field.horses.map((h) => -h.strength + gaussian(rand) * (1 - h.stability) * RANK_SIGMA * 0.62);
    } else {
      finScore = strengthScore.slice();
    }
    const startScore = field.horses.map((h, i) =>
      STYLE_POS[h.style] * 3 + (h.num - 1) * 0.12 + gaussian(rand) * 0.35);
    const finR = toRanks(finScore), startR = toRanks(startScore);
    const c3Score = field.horses.map((h, i) =>
      startR[i] * 0.78 + finR[i] * 0.22 + gaussian(rand) * (1 - field.horses[i].stability) * 0.9);
    const c4Score = field.horses.map((h, i) =>
      startR[i] * 0.40 + finR[i] * 0.60 + gaussian(rand) * (1 - field.horses[i].stability) * 0.7);
    const c3R = toRanks(c3Score), c4R = toRanks(c4Score);

    // ── フロント進行 F(t)。T以降は等速で延長 ──
    const STEPS = 480;
    const shape = paceShape(pace);
    const cum = [0];
    for (let i = 1; i <= STEPS; i++) {
      const w0 = 1 + shape((i - 1) / STEPS), w1 = 1 + shape(i / STEPS);
      cum.push(cum[i - 1] + (w0 + w1) / 2);
    }
    const frontAt = (t) => {
      if (t <= 0) return 0;
      if (t >= T) {
        const vEnd = (cum[STEPS] - cum[STEPS - 1]) / (cum[STEPS] / D) / (T / STEPS); // 終端速度
        return D + (t - T) * ((D / cum[STEPS]) * (cum[STEPS] - cum[STEPS - 1]) / (T / STEPS));
      }
      const x = (t / T) * STEPS, i = Math.floor(x), f = x - i;
      return ((cum[i] + (cum[Math.min(i + 1, STEPS)] - cum[i]) * f) / cum[STEPS]) * D;
    };

    // キーフレーム進行割合
    const wp = {
      start: 0,
      c3: clamp((D - track.straight - track.arc) / D, 0.3, 0.92),
      c4: clamp((D - track.straight) / D, 0.5, 0.96),
      fin: 1,
    };

    const gapFromRank = (rank, p) =>
      (rank - 1) * 2.05 * (0.85 + 0.55 * p) * smoothstep(0, 0.045, p);

    // ── 各馬フレーム ──
    const gateSpread = (num) => 1.4 + ((num - 1) / (N - 1)) * (track.width - 4.5);
    const horses = field.horses.map((h, i) => {
      const kin = STYLE_KIN[h.style];
      const ranks = [startR[i], c3R[i], c4R[i], finR[i]];
      const laneJit = gaussian(rand) * 0.5;
      const rankAtP = (p) => {
        if (p <= wp.c3) return smoothLerp(ranks[0], ranks[1], (p - wp.start) / (wp.c3 - wp.start));
        if (p <= wp.c4) return smoothLerp(ranks[1], ranks[2], (p - wp.c3) / (wp.c4 - wp.c3));
        const u = clamp((p - wp.c4) / (wp.fin - wp.c4), 0, 1);
        return smoothLerp(ranks[2], ranks[3], Math.pow(u, kin.kickExp));
      };
      const frames = [];
      let prevDist = 0;
      const tEnd = T + 12;
      const nF = Math.floor(tEnd * HZ) + 1;
      let finishTime = null, t600 = null;
      for (let fi = 0; fi < nF; fi++) {
        const t = fi / HZ;
        const F = frontAt(t);
        const p = clamp(F / D, 0, 1);
        const rank = rankAtP(p);
        let dist = F - gapFromRank(rank, p);
        if (dist < prevDist) dist = prevDist;
        const speed = clamp((dist - prevDist) * HZ, 0, MAX_SPEED);
        // レーン: ゲート位置 → 脚質ポジション → 直線で外へ
        const styleLane = clamp(kin.baseLane + (ranks[2] - 1) * 0.22 + laneJit, 0.8, track.width - 1.2);
        let lane = lerp(gateSpread(h.num), styleLane, smoothstep(0, 0.06, p));
        if (p > wp.c4) lane += kin.swing * smoothstep(wp.c4, Math.min(1, wp.c4 + 0.1), p);
        lane = clamp(lane, 0.8, track.width - 1.0);
        frames.push({ t, d: dist, l: lane, v: speed });
        if (finishTime === null && dist >= D && prevDist < D) {
          const pd = frames[fi - 1] ? frames[fi - 1].d : 0;
          finishTime = (fi - 1) / HZ + (D - pd) / Math.max(0.01, dist - pd) / HZ;
        }
        if (t600 === null && dist >= D - 600 && prevDist < D - 600) {
          const pd = frames[fi - 1] ? frames[fi - 1].d : 0;
          t600 = (fi - 1) / HZ + (D - 600 - pd) / Math.max(0.01, dist - pd) / HZ;
        }
        prevDist = dist;
      }
      if (finishTime === null) finishTime = tEnd;
      return {
        ...h, frames, finishTime,
        agari: t600 !== null ? finishTime - t600 : null,
      };
    });

    // ── 着順・タイム ──
    const finishOrder = [...horses].sort((a, b) => a.finishTime - b.finishTime).map((h) => h.num);
    const lastFinish = Math.max(...horses.map((h) => h.finishTime));
    // 上がり3Fを現実的なレンジ(33秒台〜)へ較正
    const minAg = Math.min(...horses.map((h) => h.agari ?? 99));
    const paceAdj = pace === "ハイ" ? 0.9 : pace === "スロー" ? -0.3 : 0.2;
    horses.forEach((h) => {
      if (h.agari != null) h.agari = 33.2 + (h.agari - minAg) * 0.45 + paceAdj;
    });

    // ── Monte Carlo(エンジン予想ベース・揺らぎ統計) ──
    const iterations = 1500;
    const win = {}, top3 = {}, meanFin = {};
    field.horses.forEach((h) => { win[h.num] = 0; top3[h.num] = 0; meanFin[h.num] = 0; });
    for (let it = 0; it < iterations; it++) {
      const r2 = mulberry32(9000 + it * 2654435761);
      const sc = field.horses.map((h) => ({ num: h.num, s: -h.strength + gaussian(r2) * (1 - h.stability) * RANK_SIGMA * 0.62 }));
      sc.sort((a, b) => a.s - b.s);
      sc.forEach((e, idx) => {
        meanFin[e.num] += idx + 1;
        if (idx === 0) win[e.num] += 1;
        if (idx < 3) top3[e.num] += 1;
      });
    }
    const mc = { iterations, win: {}, top3: {}, meanFin: {} };
    field.horses.forEach((h) => {
      mc.win[h.num] = win[h.num] / iterations;
      mc.top3[h.num] = top3[h.num] / iterations;
      mc.meanFin[h.num] = meanFin[h.num] / iterations;
    });
    // 単勝オッズ・人気
    const odds = {};
    field.horses.forEach((h) => { odds[h.num] = clamp(Math.round((0.78 / Math.max(mc.win[h.num], 0.004)) * 10) / 10, 1.2, 199.9); });
    const popOrder = [...field.horses].sort((a, b) => odds[a.num] - odds[b.num]).map((h) => h.num);
    const popularity = {};
    popOrder.forEach((num, i) => { popularity[num] = i + 1; });

    return {
      venueId, venue, mode, seed, pace,
      distance: D, parTime: T, hz: HZ,
      duration: lastFinish + 2.0,
      horses, finishOrder, mc, odds, popularity,
      marks: opts.marks || null,
    };
  }

  // ───────── 実予想データ注入(Dろじくん統合) ─────────
  // 会場名(日本語) → 解析的トラックID。未知会場は距離が近い既存トラックで代用(MVP)。
  const VENUE_NAME_TO_ID = {
    "東京": "tokyo", "中山": "nakayama", "阪神": "hanshin", "京都": "kyoto",
    // 未対応会場の暫定マップ(コース精緻化は後段)
    "中京": "tokyo", "新潟": "tokyo", "札幌": "kyoto", "函館": "nakayama",
    "福島": "nakayama", "小倉": "nakayama",
  };
  function resolveVenueId(venueName, distance) {
    if (VENUE_NAME_TO_ID[venueName]) return VENUE_NAME_TO_ID[venueName];
    // 距離で最も近い既存トラック
    let best = "tokyo", bd = 1e9;
    VENUES.forEach((v) => { const d = Math.abs(v.distance - (distance || v.distance)); if (d < bd) { bd = d; best = v.id; } });
    return best;
  }

  /**
   * 実予想データから運動データを生成(renderer.js 互換の race を返す)。
   * input = {
   *   venueName, distance, surface, going, raceNo, raceName, grade,
   *   pace: "ハイ"|"平均"|"スロー",
   *   horses: [{ num, name, jockey, post, style, styleDetail, stability,
   *              startRank, c3Rank, c4Rank, finishRank }]   // ranks=1..N
   * }
   * 運動の土台(脚質/ペース/start/c3/c4順位)=ViewLogic、finishRank=選択ソース(MetaLogic/MYBOT/ViewLogic)。
   */
  function generateRaceFromInput(input, opts) {
    opts = opts || {};
    const venueId = input.venueId || resolveVenueId(input.venueName, input.distance);
    const baseVenue = venueById(venueId) || VENUES[0];   // 景観・par timeの代用元(4場の見た目)
    const D = input.distance || baseVenue.distance;
    // コース幾何は公式諸元(resolveCourse)を正とする。未登録会場のみ4場代用にフォールバック。
    const cfg = resolveCourse(input.venueName, input.surface, D) ||
      { lap: baseVenue.lap, straight: baseVenue.straight, width: baseVenue.width, handed: baseVenue.handed, slope: 0 };
    const track = makeTrack({ lap: cfg.lap, straight: cfg.straight, width: cfg.width, handed: cfg.handed, distance: D });
    const venue = {
      ...baseVenue, track, distance: D, handed: cfg.handed, slope: cfg.slope,
      short: input.venueName || baseVenue.short,
      name: (input.venueName ? input.venueName + "競馬場" : baseVenue.name),
      raceNo: input.raceNo || baseVenue.raceNo, raceName: input.raceName || baseVenue.raceName,
      grade: input.grade || "", surface: input.surface || baseVenue.surface, going: input.going || baseVenue.going,
    };
    // par time: 距離比 + ダートは芝よりやや遅い補正(描画タイミングの目安)
    const surfFactor = (input.surface && input.surface.indexOf("ダ") >= 0) ? 1.05 : 1.0;
    const T = baseVenue.parTime * (D / baseVenue.distance) * surfFactor;
    const inH = input.horses;
    const N = inH.length;
    const seed = opts.seed ?? 12345;
    const rand = mulberry32(seed * 2654435761 + 17);
    const pace = input.pace || "平均";

    const shape = paceShape(pace);
    const STEPS = 480;
    const cum = [0];
    for (let i = 1; i <= STEPS; i++) {
      const w0 = 1 + shape((i - 1) / STEPS), w1 = 1 + shape(i / STEPS);
      cum.push(cum[i - 1] + (w0 + w1) / 2);
    }
    const frontAt = (t) => {
      if (t <= 0) return 0;
      if (t >= T) return D + (t - T) * ((D / cum[STEPS]) * (cum[STEPS] - cum[STEPS - 1]) / (T / STEPS));
      const x = (t / T) * STEPS, i = Math.floor(x), f = x - i;
      return ((cum[i] + (cum[Math.min(i + 1, STEPS)] - cum[i]) * f) / cum[STEPS]) * D;
    };
    const wp = {
      start: 0,
      c3: clamp((D - track.straight - track.arc) / D, 0.3, 0.92),
      c4: clamp((D - track.straight) / D, 0.5, 0.96),
      fin: 1,
    };
    const gapFromRank = (rank, p) => (rank - 1) * 2.05 * (0.85 + 0.55 * p) * smoothstep(0, 0.045, p);
    const gateSpread = (num) => 1.4 + ((num - 1) / Math.max(1, N - 1)) * (track.width - 4.5);

    const HZ_ = HZ;
    const horses = inH.map((h) => {
      const style = STYLE_KIN[h.style] ? h.style : "先行";
      const kin = STYLE_KIN[style];
      const det = (STYLE_DETAIL[style] || ["不明"]);
      const ranks = [h.startRank, h.c3Rank, h.c4Rank, h.finishRank];
      const laneJit = gaussian(rand) * 0.5;
      const rankAtP = (p) => {
        if (p <= wp.c3) return smoothLerp(ranks[0], ranks[1], (p - wp.start) / (wp.c3 - wp.start));
        if (p <= wp.c4) return smoothLerp(ranks[1], ranks[2], (p - wp.c3) / (wp.c4 - wp.c3));
        const u = clamp((p - wp.c4) / (wp.fin - wp.c4), 0, 1);
        return smoothLerp(ranks[2], ranks[3], Math.pow(u, kin.kickExp));
      };
      const frames = [];
      let prevDist = 0;
      const tEnd = T + 12, nF = Math.floor(tEnd * HZ_) + 1;
      let finishTime = null, t600 = null;
      for (let fi = 0; fi < nF; fi++) {
        const t = fi / HZ_;
        const F = frontAt(t);
        const p = clamp(F / D, 0, 1);
        const rank = rankAtP(p);
        let dist = F - gapFromRank(rank, p);
        if (dist < prevDist) dist = prevDist;
        const speed = clamp((dist - prevDist) * HZ_, 0, MAX_SPEED);
        const styleLane = clamp(kin.baseLane + (ranks[2] - 1) * 0.22 + laneJit, 0.8, track.width - 1.2);
        let lane = lerp(gateSpread(h.num), styleLane, smoothstep(0, 0.06, p));
        if (p > wp.c4) lane += kin.swing * smoothstep(wp.c4, Math.min(1, wp.c4 + 0.1), p);
        lane = clamp(lane, 0.8, track.width - 1.0);
        frames.push({ t, d: dist, l: lane, v: speed });
        if (finishTime === null && dist >= D && prevDist < D) {
          const pd = frames[fi - 1] ? frames[fi - 1].d : 0;
          finishTime = (fi - 1) / HZ_ + (D - pd) / Math.max(0.01, dist - pd) / HZ_;
        }
        if (t600 === null && dist >= D - 600 && prevDist < D - 600) {
          const pd = frames[fi - 1] ? frames[fi - 1].d : 0;
          t600 = (fi - 1) / HZ_ + (D - 600 - pd) / Math.max(0.01, dist - pd) / HZ_;
        }
        prevDist = dist;
      }
      if (finishTime === null) finishTime = tEnd;
      const wk = h.post || wakuOf(h.num, N);
      return {
        num: h.num, waku: wk, wakuColor: WAKU_COLORS[wk] || "#888", wakuText: WAKU_TEXT[wk] || "#fff",
        name: h.name, jockey: h.jockey || "",
        style, styleDetail: h.styleDetail || det[0],
        strength: (N - h.finishRank) / N, stability: h.stability != null ? h.stability : 0.7,
        silks: h.silks || SILKS[(h.num - 1) % SILKS.length], coat: h.coat || COATS[(h.num - 1) % COATS.length],
        weight: h.weight || 480, age: h.age || 4, sex: h.sex || "牡",
        frames, finishTime, agari: t600 !== null ? finishTime - t600 : null,
      };
    });

    const finishOrder = [...horses].sort((a, b) => a.finishTime - b.finishTime).map((h) => h.num);
    const lastFinish = Math.max(...horses.map((h) => h.finishTime));
    const minAg = Math.min(...horses.map((h) => h.agari ?? 99));
    const paceAdj = pace === "ハイ" ? 0.9 : pace === "スロー" ? -0.3 : 0.2;
    horses.forEach((h) => { if (h.agari != null) h.agari = 33.2 + (h.agari - minAg) * 0.45 + paceAdj; });

    // 参考統計(本物のMonte Carloはバックエンドに無い→予想順位+安定度からの簡易分布。UIで「参考」明示)
    const iterations = 1200;
    const win = {}, top3 = {}, meanFin = {};
    horses.forEach((h) => { win[h.num] = 0; top3[h.num] = 0; meanFin[h.num] = 0; });
    for (let it = 0; it < iterations; it++) {
      const r2 = mulberry32(9000 + it * 2654435761);
      const sc = horses.map((h) => ({ num: h.num, s: -h.strength + gaussian(r2) * (1 - h.stability) * RANK_SIGMA * 0.62 }));
      sc.sort((a, b) => a.s - b.s);
      sc.forEach((e, idx) => { meanFin[e.num] += idx + 1; if (idx === 0) win[e.num] += 1; if (idx < 3) top3[e.num] += 1; });
    }
    const mc = { iterations, win: {}, top3: {}, meanFin: {} };
    horses.forEach((h) => { mc.win[h.num] = win[h.num] / iterations; mc.top3[h.num] = top3[h.num] / iterations; mc.meanFin[h.num] = meanFin[h.num] / iterations; });
    // オッズ: 実オッズがあれば採用、無ければ参考分布から
    const odds = {};
    horses.forEach((h) => {
      const real = input.horses.find((x) => x.num === h.num);
      odds[h.num] = (real && real.odds > 0) ? real.odds
        : clamp(Math.round((0.78 / Math.max(mc.win[h.num], 0.004)) * 10) / 10, 1.2, 199.9);
    });
    const popOrder = [...horses].sort((a, b) => odds[a.num] - odds[b.num]).map((h) => h.num);
    const popularity = {};
    popOrder.forEach((num, i) => { popularity[num] = i + 1; });

    return {
      venueId, venue, mode: "input", seed, pace,
      distance: D, parTime: T, hz: HZ_,
      duration: lastFinish + 2.0,
      horses, finishOrder, mc, odds, popularity, marks: opts.marks || null,
      predSource: input.predSource || null,
    };
  }

  // ───────── サンプリング ─────────
  function sampleAt(horse, t) {
    const fr = horse.frames;
    const x = clamp(t * HZ, 0, fr.length - 1.001);
    const i = Math.floor(x), f = x - i;
    const a = fr[i], b = fr[Math.min(i + 1, fr.length - 1)];
    return { d: a.d + (b.d - a.d) * f, l: a.l + (b.l - a.l) * f, v: a.v + (b.v - a.v) * f };
  }

  // ───────── 払戻・馬券 ─────────
  function yen(odds) { return Math.max(110, Math.round(odds * 100 / 10) * 10); }
  function computePayouts(race) {
    const [a, b, c] = race.finishOrder;
    const p = (n) => Math.max(race.mc.win[n], 0.004);
    const q = (n) => Math.max(race.mc.top3[n], 0.012);
    const tanOdds = 0.78 / p(a);
    const fukuOdds = (n) => clamp(0.82 / q(n) * 0.42, 1.1, 60);
    const umarenOdds = clamp(0.75 / (p(a) * p(b) * 4.2), 1.5, 2500);
    const sanrenOdds = clamp(0.72 / (p(a) * p(b) * p(c) * 30), 2.5, 30000);
    return {
      tansho: { sel: [a], yen: yen(clamp(tanOdds, 1.1, 999)) },
      fukusho: [a, b, c].map((n) => ({ sel: [n], yen: yen(fukuOdds(n)) })),
      umaren: { sel: [a, b].sort((x, y) => x - y), yen: yen(umarenOdds) },
      sanrenpuku: { sel: [a, b, c].sort((x, y) => x - y), yen: yen(sanrenOdds) },
    };
  }

  /** marks {tan,ren,san} → 馬券リスト+的中判定 */
  function judgeBets(marks, race) {
    const pay = computePayouts(race);
    const top1 = race.finishOrder[0];
    const top2 = race.finishOrder.slice(0, 2);
    const top3 = race.finishOrder.slice(0, 3);
    const bets = [];
    if (marks.tan) {
      const hit = marks.tan === top1;
      bets.push({ type: "単勝", sel: [marks.tan], stake: 100, hit, payout: hit ? pay.tansho.yen : 0 });
    }
    if (marks.tan && marks.ren) {
      const s = [marks.tan, marks.ren];
      const hit = s.every((n) => top2.includes(n));
      bets.push({ type: "馬連", sel: [...s].sort((a, b) => a - b), stake: 100, hit, payout: hit ? pay.umaren.yen : 0 });
    }
    if (marks.tan && marks.ren && marks.san) {
      const s = [marks.tan, marks.ren, marks.san];
      const hit = s.every((n) => top3.includes(n));
      bets.push({ type: "三連複", sel: [...s].sort((a, b) => a - b), stake: 100, hit, payout: hit ? pay.sanrenpuku.yen : 0 });
    }
    const totalStake = bets.reduce((s, b) => s + b.stake, 0);
    const totalReturn = bets.reduce((s, b) => s + b.payout, 0);
    return { bets, totalStake, totalReturn, payouts: pay };
  }

  // ───────── 表示フォーマット ─────────
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  }
  function fmtMargin(dt) {
    if (dt < 0.03) return "ハナ";
    if (dt < 0.07) return "アタマ";
    if (dt < 0.13) return "クビ";
    const n = dt / 0.165;
    if (n < 0.7) return "1/2";
    if (n < 1.0) return "3/4";
    if (n >= 10) return "大差";
    const whole = Math.floor(n), half = n - whole >= 0.45 ? " 1/2" : "";
    return `${whole}${half}`;
  }

  return {
    VENUES, venueById, makeField, generateRace, generateRaceFromInput, sampleAt,
    resolveVenueId, computePayouts, judgeBets, fmtTime, fmtMargin,
    WAKU_COLORS, WAKU_TEXT, HZ,
  };
})();
