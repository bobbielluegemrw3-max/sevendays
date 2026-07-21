/**
 * 帯レース(BRACKET RACE) — FUN_V3 施策G「帯の可視化」の presentation model。
 *
 * BURN は「同一LV帯の最終スコア下位N頭切り」であり、構造的に既に競走である。
 * ところが現状はそれがダミー行のログ濁流として描かれているため抽選に見える。
 * ここでは *確定済みの実データ* を、開示順序だけで競走に見せる。
 *
 * ★ 最重要の制約(FUN_V3_PLAN.md §4 施策G):
 *   中間順位のデータは存在しない。レースは最終スコア1発で解決している。
 *   したがって「順位が動く」体験を *実際の変動* で作ってはならない — それは
 *   透明性台帳を売りにしているプロダクトに作り話を混ぜることになる。
 *   動かしてよいのは「観客がまだ知らない」という一点だけである。
 *
 * 設計:
 *   1. 自分のスコアを先に確定表示して固定する(もう動かない)
 *   2. 他馬が1頭ずつ確定していく。自分より上が出るたび *表示上の* 順位が下がる
 *   3. 順位は「まだ開示されていない馬」を含まない暫定値であり、単調に下がるだけ
 *   4. 全頭開示でラインが確定し、生死とスコア差が出る
 *
 * すべて純関数(React も IO もない)。elapsed を与えるとその瞬間のフレームを返す。
 */

/* ---- タイムライン(帯レース act 内のローカル秒) --------------------------- */

/** 帯の提示「LV.4 — 38頭が出走。4頭が消える」。 */
export const ACT_INTRO = 3;
/** 自分のスコアだけ先に確定表示(順位はまだ未定)。 */
export const ACT_YOU = 3;
/** 他馬が1頭ずつ確定していく本編。 */
export const ACT_REVEAL = 15;
/** 残り数頭 — ライン確定。 */
export const ACT_LINE = 4;
/** 生死と点差の提示(この幕が払い戻しなので厚めに取る)。 */
export const ACT_VERDICT = 7;
/**
 * act 全体の尺 = 32秒。
 *
 * 既存タイムラインの RACE TURN(30秒〜62秒 = ログ濁流 BURN/生存/価値/DAY7)を
 * まるごと置き換える。音のキュー(CHAPTER 02 = 62秒のマーケット開幕)と
 * P2P以降のタイムラインには一切触れない — Decision 111 の「音のキューも不変」を守る。
 */
export const ACT_TOTAL = ACT_INTRO + ACT_YOU + ACT_REVEAL + ACT_LINE + ACT_VERDICT;

/**
 * 生死が明かされる時刻(act ローカル秒)。
 *
 * ★ショー側の審判オーバーレイは、この時刻より前に発火させてはならない。
 * 既定では BURN の審判は 31.5秒(= LOGS_FROM+1.5)に出るため、素直に重ねると
 * 馬の画像が幕開け直後に答えを言ってしまい、順位が下がっていく25秒が
 * まるごと無意味になる(2026-07-21 プレビューで実際に発生)。
 */
export const ACT_VERDICT_AT = ACT_TOTAL - ACT_VERDICT;

const T_YOU = ACT_INTRO;
const T_REVEAL = T_YOU + ACT_YOU;
const T_LINE = T_REVEAL + ACT_REVEAL;
const T_VERDICT = T_LINE + ACT_LINE;

export type BandActPhase = 'INTRO' | 'YOU' | 'REVEAL' | 'LINE' | 'VERDICT';

/* ---- 入力 ---------------------------------------------------------------- */

/** 帯に出走した1頭(実データ。score は race_results.final_score)。 */
export interface BandEntry {
  name: string;
  score: number;
  burned: boolean;
  /** 自分の馬。所有者は他人のぶんを一切参照しない(ADR-007)。 */
  mine?: boolean;
}

/** 1つのLV帯の確定結果。entries は順不同で渡してよい(内部でスコア降順に整列)。 */
export interface BandRaceInput {
  /** LV(= race_participant_snapshots.current_day)。 */
  day: number;
  entries: readonly BandEntry[];
  /** 開示順を決めるシード(レースIDや日付。同じ夜は誰が見ても同じ順序)。 */
  seed?: string;
}

/* ---- 正規化済みモデル ---------------------------------------------------- */

export interface BandRaceModel {
  day: number;
  /** スコア降順(= final_rank 昇順)に整列済み。 */
  entries: readonly BandEntry[];
  total: number;
  burns: number;
  /** 生存する頭数 = この順位までが助かる。 */
  lineRank: number;
  /** 自分の馬の index(entries 内)。複数所有時は最も危ない1頭。null=出走なし。 */
  myIndex: number | null;
  /** 他馬の開示順(entries の index。自分は含まない)。 */
  revealOrder: readonly number[];
}

/** 決定論ハッシュ(開示順のシャッフル用。乱数は使わない)。 */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mix(i: number, salt: number): number {
  let h = (i + 1) * 2654435761 + salt * 40503;
  h = (h ^ (h >>> 15)) * 2246822519;
  h = (h ^ (h >>> 13)) * 3266489917;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * 帯の確定結果から act のモデルを組む。
 *
 * 開示順は決定論シャッフル。スコア順に開示すると「上から順」で早々に決着が
 * 見えてしまい、下から順だと最後まで1位のままで緊張が終端に固まる。
 * バラバラに開示すると暫定順位が最後まで少しずつ下がり続ける。
 */
export function buildBandRace(input: BandRaceInput): BandRaceModel {
  const entries = [...input.entries].sort((a, b) => b.score - a.score);
  const total = entries.length;
  const burns = entries.reduce((n, e) => n + (e.burned ? 1 : 0), 0);

  // 自分の馬が複数いる帯では「最も危ない1頭」(=最下位のスコア)を主役にする。
  let myIndex: number | null = null;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.mine) myIndex = i;
  }

  const salt = hash32(input.seed ?? `LV${input.day}:${total}`);
  const lineRank = Math.max(0, total - burns);

  /** 決定論シャッフル(Fisher-Yates)。乱数は使わない。 */
  const shuffle = (arr: number[]): number[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = mix(i, salt) % (i + 1);
      const t = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = t;
    }
    return arr;
  };

  const others = entries.map((_, i) => i).filter((i) => i !== myIndex);
  let revealOrder = shuffle(others);

  /* ★決着を最後まで持ち越す(ここが act の設計の芯)
   *
   * 生死は「未開示の馬の内訳」だけで先に確定してしまう:
   *   生存確定 ⇔ 自分より下の未開示数 ≦ (生存ライン − 自分の確定順位)
   *   BURN確定 ⇔ 自分より上が十分に開示され、暫定順位がラインを割る
   * 素直にシャッフルすると、この確定が本編の途中(実測で残り12秒)で起きて
   * しまい、以後は結果の分かった表を眺めるだけの時間になる。
   *
   * そこで「結論を決める馬」だけを最後の一群に回す。開示順序は表示の順番で
   * あって結果ではないので、これは作り話にはならない — 実況が最後の直線を
   * 引っ張るのと同じことである。 */
  if (myIndex !== null) {
    const myRankFinal = myIndex + 1;
    const above = revealOrder.filter((i) => i < myIndex);
    const below = revealOrder.filter((i) => i > myIndex);
    // 生存側は「自分より下の馬」、BURN側は「自分より上の馬」が結論を決める
    const survives = myRankFinal <= lineRank;
    const pool = survives ? below : above;
    const need = survives ? lineRank - myRankFinal + 1 : myRankFinal - lineRank;
    const hold = pool.slice(Math.max(0, pool.length - Math.min(need, pool.length)));
    const holdSet = new Set(hold);
    revealOrder = [...revealOrder.filter((i) => !holdSet.has(i)), ...hold];
  }

  return {
    day: input.day,
    entries,
    total,
    burns,
    lineRank,
    myIndex,
    revealOrder,
  };
}

/* ---- フレーム ------------------------------------------------------------ */

export interface BandRow {
  /**
   * ★暫定順位(開示済みの馬の中での順位)。確定順位ではない。
   *
   * ここに final_rank を出すと、1頭目を開示した瞬間に全員の最終順位が
   * 露見してショーが終わる。表に出てよいのは「今わかっている範囲での順位」だけ。
   */
  rank: number;
  name: string;
  score: number;
  /** BURN確定の表示は全頭開示後のみ(途中で出すと結果が漏れる)。 */
  burned: boolean;
  mine: boolean;
  /** この行が生存ラインの直上(最後の生存枠)であることの印。 */
  atLine: boolean;
  /** カメラ窓の切れ目(…)。 */
  gap?: boolean;
}

export interface BandRaceFrame {
  phase: BandActPhase;
  day: number;
  total: number;
  burns: number;
  lineRank: number;
  /** 開示済みの他馬の数。 */
  revealed: number;
  /** 自分のスコア(YOU 以降のみ非null)。 */
  myScore: number | null;
  /**
   * 現時点の暫定順位 = 1 + (自分より上のスコアが開示された数)。
   * 未開示の馬を含まないため、これは単調に下がる(数字は増える)だけである。
   */
  myRank: number | null;
  /** 自分が確実に生存 / 確実にBURN と決まったか(未確定は null)。 */
  myFate: 'SAFE' | 'BURN' | null;
  /**
   * 生死を画面で宣言してよいか。
   *
   * 帯が小さい夜は開示順序で粘っても決着が早く付くことがある。そのとき
   * 「SAFE」を出した瞬間に残りの尺が消化試合になるので、宣言は最終幕まで待つ。
   * (myFate 自体は UI の事前準備のために先に返す)
   */
  showFate: boolean;
  /** 生死確定後のライン馬とのスコア差(±)。 */
  margin: number | null;
  /** カメラ窓(上位数頭 + 自分の前後 + ライン付近)。 */
  rows: readonly BandRow[];
}

/** カメラ窓の構成(FUN_V3_PLAN.md §4「表示範囲」)。 */
const TOP_ROWS = 3;
const AROUND_ME = 5;
const AROUND_LINE = 3;

/** ease-out — 序盤は速く、残り数頭はじりじり遅くなる。 */
const easeOut = (x: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 2.4);

/**
 * elapsed(act ローカル秒)時点のフレーム。
 *
 * revealedAt: 各 entry index が何番目に開示されるか。自分は最初から開示済み。
 */
export function bandRaceFrame(model: BandRaceModel, elapsed: number): BandRaceFrame {
  const { entries, total, burns, lineRank, myIndex, revealOrder } = model;

  const phase: BandActPhase =
    elapsed < T_YOU ? 'INTRO'
      : elapsed < T_REVEAL ? 'YOU'
        : elapsed < T_LINE ? 'REVEAL'
          : elapsed < T_VERDICT ? 'LINE'
            : 'VERDICT';

  // 開示済みの他馬数。REVEAL で ease-out、LINE で残り全部を出し切る。
  let revealed: number;
  if (elapsed < T_REVEAL) revealed = 0;
  else if (elapsed < T_LINE) {
    // REVEAL 区間で全体の 88% まで開示し、残りを LINE 区間に残す。
    const t = (elapsed - T_REVEAL) / ACT_REVEAL;
    revealed = Math.floor(revealOrder.length * 0.88 * easeOut(t));
  } else if (elapsed < T_VERDICT) {
    const t = (elapsed - T_LINE) / ACT_LINE;
    const from = Math.floor(revealOrder.length * 0.88);
    revealed = from + Math.ceil((revealOrder.length - from) * Math.min(1, t));
  } else revealed = revealOrder.length;
  revealed = Math.max(0, Math.min(revealOrder.length, revealed));

  const shown = new Set<number>(revealOrder.slice(0, revealed));
  const myShown = myIndex !== null && elapsed >= T_YOU;
  if (myIndex !== null && myShown) shown.add(myIndex);
  const settled = revealed === revealOrder.length;

  const myScore = myIndex !== null && myShown ? entries[myIndex]!.score : null;

  // 暫定順位: 自分より上のスコアが「開示された」数 + 1。
  // 未開示の馬を含まないので、この数字は単調に下がる(増える)だけである。
  // YOU 幕はスコアだけを先に固定して見せる — 順位はまだ名乗らない
  // (「1位」と出してしまうと、直後に転げ落ちるのが出来レースに見える)。
  let myRank: number | null = null;
  if (myIndex !== null && myShown && phase !== 'YOU') {
    let above = 0;
    for (const i of shown) if (i < myIndex) above++;
    myRank = above + 1;
  }

  // 生死の確定判定(未開示分をどう振っても結論が変わらなくなった時点)。
  let myFate: 'SAFE' | 'BURN' | null = null;
  let margin: number | null = null;
  if (myIndex !== null && myShown && myRank !== null) {
    const remaining = revealOrder.length - revealed;
    // 残り全頭が自分より上だった場合の最悪順位
    if (myRank + remaining <= lineRank) myFate = 'SAFE';
    // 順位はもう良くならないので、ラインを割った時点でBURN確定
    else if (myRank > lineRank) myFate = 'BURN';
    if (settled) {
      myFate = entries[myIndex]!.burned ? 'BURN' : 'SAFE';
      // 生存: 自分と「BURNの最上位」の差 —「4.66点差で生存」
      // BURN : 自分と「生存の最下位」の差 —「4.66点差で及ばず」
      const other = entries[myFate === 'SAFE' ? lineRank : lineRank - 1];
      if (other) margin = Math.round(Math.abs(entries[myIndex]!.score - other.score) * 100) / 100;
    }
  }

  return {
    phase,
    day: model.day,
    total,
    burns,
    lineRank,
    revealed,
    myScore,
    myRank,
    myFate,
    showFate: myFate !== null && phase === 'VERDICT',
    margin,
    rows: cameraRows(model, shown, myShown, settled),
  };
}

/**
 * カメラ窓。
 *
 * 表は「開示済みの馬だけ」を並べた暫定リーダーボードである。未開示の席を
 * 空けて確保することはしない — 空席の位置がそのまま最終順位の答えになるため。
 *
 * 窓は 上位3頭 + 自分の前後±5 + 生存ライン付近±3。
 * カメラは1位ではなくラインを追う — 見るべきは首位ではなく「線と自分の距離」。
 */
function cameraRows(
  model: BandRaceModel,
  shown: ReadonlySet<number>,
  myShown: boolean,
  settled: boolean,
): BandRow[] {
  const { entries, lineRank, myIndex } = model;
  // 開示済みをスコア降順のまま取り出す(entries が既に降順なので index 昇順で足りる)
  const board: number[] = [];
  for (let i = 0; i < entries.length; i++) if (shown.has(i)) board.push(i);

  const n = board.length;
  /* カメラは主役(= 最もラインに近い自分の馬 = myIndex)を追う。
     同じ帯に自分の馬が複数いる夜に findIndex(mine) を使うと、見出しの
     YOUR SCORE/暫定順位が主役の数字なのに、カメラだけスコア最上位の別の
     持ち馬に張り付く(複数保有時のみ発現する不整合)。
     主役以外の持ち馬は、開示された時点で金色の行として表に出る。 */
  const myPos = myShown && myIndex !== null ? board.indexOf(myIndex) : -1;

  const want = new Set<number>();
  for (let p = 0; p < Math.min(TOP_ROWS, n); p++) want.add(p);
  if (myPos >= 0) {
    for (let p = myPos - AROUND_ME; p <= myPos + AROUND_ME; p++) if (p >= 0 && p < n) want.add(p);
  }
  /* 自分の馬は主役以外も必ず窓に入れる。
     窓が「上位3 + 自分±5 + ライン±3」だけだと、同じ帯の4位や20位の持ち馬が
     どの窓にも入らず消える(2026-07-21 プレビューで発覚)。
     自分が持っている馬が画面から漏れるのは、この幕の趣旨に反する。 */
  if (myShown) {
    for (let p = 0; p < n; p++) if (entries[board[p]!]!.mine) want.add(p);
  }
  // ラインは「暫定順位 lineRank」の位置。まだそこまで開示されていなければ出ない。
  for (let p = lineRank - AROUND_LINE; p < lineRank + AROUND_LINE; p++) {
    if (p >= 0 && p < n) want.add(p);
  }

  const positions = [...want].sort((a, b) => a - b);
  const rows: BandRow[] = [];
  let prev = -1;
  for (const p of positions) {
    if (prev >= 0 && p > prev + 1) {
      rows.push({ rank: 0, name: '', score: 0, burned: false, mine: false, atLine: false, gap: true });
    }
    const e = entries[board[p]!]!;
    rows.push({
      rank: p + 1,
      name: e.name,
      score: e.score,
      // 全頭開示までは BURN を表に出さない(途中で出すと結果が漏れる)
      burned: settled && e.burned,
      mine: !!e.mine,
      atLine: p + 1 === lineRank,
    });
    prev = p;
  }
  return rows;
}

/* ---- 主役の帯を選ぶ ------------------------------------------------------ */

/**
 * その夜の全帯から、フル演出する1帯を選ぶ(オーナー判断 2026-07-21)。
 *
 * 101秒のショーに全帯は入らない。かといって頭数比で機械的に割ると、尺の大半が
 * 自分と無関係な帯に流れる — それは計画書が削ろうとしている「他人の話44秒」を
 * 温存することになる。したがって「自分が最も危なかった1帯」を主役にする。
 *
 * 他の帯にいる自分の馬は、従来どおり審判オーバーレイ + MY LANE が拾う
 * (myEvents の実結線・2026-07-16 #5)。取りこぼしは起きない。
 *
 * 自分の出走馬がいない夜(観戦・全馬デビュー前)は、最も競った帯を見せる。
 */
export function selectFeaturedBand(bands: readonly BandRaceInput[]): BandRaceInput | null {
  if (bands.length === 0) return null;

  /* 全帯にスコアを付けて最小を取る。自分の馬がいる帯は必ず 1000 未満、
     観戦用の代役は 1000 以上 — 自分がいる帯が観戦帯に負けることはない。 */
  const score = (band: BandRaceInput): number => {
    const sorted = [...band.entries].sort((a, b) => b.score - a.score);
    const burns = sorted.reduce((n, e) => n + (e.burned ? 1 : 0), 0);
    const lineRank = Math.max(0, sorted.length - burns);

    let mine = Number.POSITIVE_INFINITY;
    sorted.forEach((e, i) => {
      if (!e.mine) return;
      const rank = i + 1;
      /* 境界からの「何枠ぶんか」。ラインは 34位と35位の *あいだ* に引かれるので、
         最後の生存(34位)も最初のBURN(35位)も距離0 — どちらも紙一重である。
         計画書 §2 の実例(17位47.53 生存 / 18位42.87 BURN = 4.66点差)がまさに
         この対で、片方だけを遠いと見なす metric では惜しさを取り逃がす。 */
      const burned = rank > lineRank;
      const key = (burned ? rank - lineRank - 1 : lineRank - rank) - (burned ? 0.5 : 0);
      if (key < mine) mine = key;
    });
    if (mine !== Number.POSITIVE_INFINITY) return mine;

    // 出走馬がいない夜の代役 = ライン際が最も競った帯(点差が最小)
    const above = sorted[lineRank - 1];
    const below = sorted[lineRank];
    if (!above || !below) return 2000;
    return 1000 + (above.score - below.score);
  };

  let best = bands[0]!;
  let bestKey = score(best);
  for (const band of bands.slice(1)) {
    const key = score(band);
    if (key < bestKey) { bestKey = key; best = band; }
  }
  return best;
}

/* ---- フィクスチャ(プレビュー/フレーム検証用) ---------------------------- */

/**
 * FUN_V3_PLAN.md §2 の実例を再現するフィクスチャ。
 * 2026-07-20 20:00 MYT の 17位 47.53(生存) / 18位 42.87(BURN) = 4.66点差。
 */
export function fixtureBandRace(opts?: { mineRank?: number; day?: number; total?: number; burns?: number }): BandRaceInput {
  const day = opts?.day ?? 4;
  const total = opts?.total ?? 38;
  const burns = opts?.burns ?? 4;
  const mineRank = opts?.mineRank ?? total - burns; // 既定 = ライン上ぎりぎり生存
  const PREFIX = ['Royal', 'Black', 'Azure', 'Neon', 'Iron', 'Lunar', 'Storm', 'Cosmic', 'Wild', 'Noble'];
  const SUFFIX = ['Thunder', 'Comet', 'Wolf', 'Frost', 'Meteor', 'Nova', 'Blade', 'Flame', 'Arrow', 'Bolt'];
  // 実測の分布に寄せる: 首位 ~88、ライン付近 ~47、最下位 ~35。
  // 隣接馬の差は 0.1〜2 点台に散る(4.66 点差のような「惜しさ」が出る幅)。
  const entries: BandEntry[] = Array.from({ length: total }, (_, i) => {
    const h = mix(i, 991 + day);
    const score = 88 - (i / Math.max(1, total - 1)) * 53 - ((h % 220) / 100);
    return {
      name: `${PREFIX[h % PREFIX.length]!} ${SUFFIX[(h >>> 8) % SUFFIX.length]!} ${i + 1}`,
      score: Math.round(score * 100) / 100,
      burned: i >= total - burns,
      mine: i === mineRank - 1,
    };
  });
  // スコアは降順を保つ(ジッタで前後しても順位=スコア順であること)
  entries.sort((a, b) => b.score - a.score);
  entries.forEach((e, i) => {
    e.burned = i >= total - burns;
    e.mine = i === mineRank - 1;
  });
  return { day, entries, seed: `fixture:${day}:${total}` };
}
