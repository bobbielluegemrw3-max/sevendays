import type { SqlClient } from '@sevendays/shared';

/**
 * ============================================================================
 *  隠し実績(ヒドゥン・バッジ)エンジン — 機密度: 最高
 * ============================================================================
 *  正典: リポジトリ直下 EASTER_EGG_PLAN.md / 発案 2026-07-14・GO 2026-07-15。
 *
 *  【絶対の規律】
 *   - 効果はコスメティックのみ(称号バッジ)。馬の生死・レース結果・USDT・
 *     ティア・経済に一切触れない。ここは settlement/economy から完全に独立。
 *   - **獲得条件(トリガー)はここにしか存在しない**。CS knowledge.ts・admin画面・
 *     公開docs・APIレスポンスの description には条件を絶対に書かない。
 *     プレイヤーには「獲得済みの称号名+雰囲気テキスト」だけが見える。
 *   - 判定は不変の記録(item_usages が SETTLED・races の条件)からの読み取りのみ。
 *     決定論的で、いつ計算しても同じ。マイグレーション不要・バッチ非介入。
 *
 *  設計意図(オーナー): アイテムを使う導線を隠し攻略で作る。初心者でも
 *   「雨アイテムを雨で使って生き残る」を繰り返すと自然に称号が出る=アイテム
 *   購買の funnel。条件は素直な「適性一致アイテム × 一致条件 × 生存」の積み重ね。
 *
 *  拡張: THREADS 配列に定義を足すだけ。条件は predicate(qualifying event の
 *   数え上げ or 集合の充足)で表現する。
 * ============================================================================
 */

/** SETTLED のアイテム使用1件(レース条件を結合済み)。判定の生データ。 */
interface UsageEvent {
  itemKey: string;
  weather: string; // SUNNY | CLOUDY | RAIN | STORM
  track: string; // FAST | GOOD | SOFT | HEAVY
  surface: string; // TURF | DIRT
  survived: boolean;
  raceDate: string; // effective_race_date (YYYY-MM-DD)
}

/** 適性グループ(items.ts の affinity と対応。ここでは判定用に鍵の集合で持つ)。 */
const RAIN_ITEMS = new Set(['rain_hood', 'storm_cloak']);
const SUN_ITEMS = new Set(['sunny_visor']);
const STORM_ITEMS = new Set(['storm_emperor_cloak']);
const MUD_ITEMS = new Set(['mud_guards', 'mudlord_crown']);
const FIRM_ITEMS = new Set(['firm_plates']);
const TURF_ITEMS = new Set(['turf_spikes', 'turf_master_saddle']);
const DIRT_ITEMS = new Set(['dirt_shoes', 'dirt_master_saddle']);
const BURN_DROP_ITEMS = new Set([
  'memento_horseshoe', 'memorial_wreath', 'legacy_mane', 'spirit_roar', 'stardust_sand',
]);

const isWet = (w: string): boolean => w === 'RAIN' || w === 'STORM';
const isHeavyTrack = (t: string): boolean => t === 'SOFT' || t === 'HEAVY';

/** 称号の演出色(UIのエンブレム色。意味色に寄せる)。 */
export type BadgeTone = 'rain' | 'sun' | 'storm' | 'mud' | 'turf' | 'dirt' | 'gold' | 'spirit';

interface BadgeDef {
  /** 安定キー(不変)。 */
  key: string;
  /** 表示名(獲得後に公開される)。 */
  name: string;
  /** 雰囲気テキスト(公開OK)。**獲得条件は書かない**。 */
  flavor: string;
  tone: BadgeTone;
  /**
   * 判定(秘匿)。events からこの称号を獲得済みか。
   * count 系は「適性一致アイテム × 一致条件 × 生存」を数えて閾値到達で獲得。
   */
  earned: (events: readonly UsageEvent[], earnedKeys: ReadonlySet<string>) => boolean;
}

/** 条件一致で「効いた(生存)」イベント数。 */
function countMatched(
  events: readonly UsageEvent[],
  items: ReadonlySet<string>,
  cond: (e: UsageEvent) => boolean,
): number {
  return events.filter((e) => e.survived && items.has(e.itemKey) && cond(e)).length;
}

/** 連続する effective_race_date で条件一致生存が n 連続あるか。 */
function hasStreak(
  events: readonly UsageEvent[],
  items: ReadonlySet<string>,
  cond: (e: UsageEvent) => boolean,
  need: number,
): boolean {
  const days = [
    ...new Set(events.filter((e) => e.survived && items.has(e.itemKey) && cond(e)).map((e) => e.raceDate)),
  ].sort();
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    const prev = new Date(`${days[i - 1]}T00:00:00Z`).getTime();
    const cur = new Date(`${days[i]}T00:00:00Z`).getTime();
    run = cur - prev === 86_400_000 ? run + 1 : 1;
    if (run >= need) return true;
  }
  return need <= 1 && days.length >= 1;
}

/**
 * 称号定義(THREADS)。**この配列そのものが「隠し攻略仕様」**。
 * SHA-256 は EASTER_EGG_PLAN.md に記録(コミット方式)。
 */
const BADGES: readonly BadgeDef[] = [
  // ---- 初心者ルート: 適性一致 × 一致条件 × 生存 を3回(オーナー例=雨) ----
  {
    key: 'rain_reader',
    name: '雨読みの三重奏',
    flavor: '雨を味方につけた者にだけ、水面は道を見せる。',
    tone: 'rain',
    earned: (e) => countMatched(e, RAIN_ITEMS, (x) => isWet(x.weather)) >= 3,
  },
  {
    key: 'sun_basker',
    name: '陽だまりの使い手',
    flavor: '晴れ舞台を三度、味方に。眩しさは実力の裏返し。',
    tone: 'sun',
    earned: (e) => countMatched(e, SUN_ITEMS, (x) => x.weather === 'SUNNY') >= 3,
  },
  {
    key: 'mud_general',
    name: '泥将',
    flavor: '道悪を制する者は、晴天の勝者を三度食う。',
    tone: 'mud',
    earned: (e) => countMatched(e, MUD_ITEMS, (x) => isHeavyTrack(x.track)) >= 3,
  },
  {
    key: 'turf_child',
    name: '芝の申し子',
    flavor: '緑の絨毯があなたを覚えた。',
    tone: 'turf',
    earned: (e) => countMatched(e, TURF_ITEMS, (x) => x.surface === 'TURF') >= 3,
  },
  {
    key: 'sand_ruler',
    name: '砂の覇者',
    flavor: '砂塵の向こうに、勝ち筋だけが光る。',
    tone: 'dirt',
    earned: (e) => countMatched(e, DIRT_ITEMS, (x) => x.surface === 'DIRT') >= 3,
  },
  {
    key: 'firm_flyer',
    name: '高速馬場の申し子',
    flavor: '硬い馬場は、速さを知る者への贈り物。',
    tone: 'turf',
    earned: (e) => countMatched(e, FIRM_ITEMS, (x) => x.track === 'FAST') >= 3,
  },
  // ---- 中級: 荒天専用の一撃を嵐で決める ----
  {
    key: 'storm_emperor',
    name: '嵐帝',
    flavor: '嵐の夜にだけ吼える者がいる。',
    tone: 'storm',
    earned: (e) => countMatched(e, STORM_ITEMS, (x) => x.weather === 'STORM') >= 2,
  },
  // ---- 連夜ルート: 泥を3夜連続で制する ----
  {
    key: 'mud_dynasty',
    name: '不連泥の王',
    flavor: '三夜続けて泥に沈まなかった、ただ一頭の采配。',
    tone: 'mud',
    earned: (e) => hasStreak(e, MUD_ITEMS, (x) => isHeavyTrack(x.track), 3),
  },
  // ---- 物語ルート: 失った馬の形見を使って生き延びる ----
  {
    key: 'legacy_bearer',
    name: '遺志を継ぐ者',
    flavor: '失われた馬の力が、次の一頭を勝たせた。',
    tone: 'spirit',
    earned: (e) => countMatched(e, BURN_DROP_ITEMS, () => true) >= 1,
  },
  // ---- メタ実績: 天候3種(雨・晴・泥)の称号を全て集める ----
  {
    key: 'all_weather_sage',
    name: '全天候の賢者',
    flavor: 'どんな空の下でも、あなたは道を知っている。',
    tone: 'gold',
    earned: (_e, earned) => earned.has('rain_reader') && earned.has('sun_basker') && earned.has('mud_general'),
  },
];

export interface EarnedBadge {
  key: string;
  name: string;
  flavor: string;
  tone: BadgeTone;
}

/**
 * ユーザーの獲得済み隠しバッジを算出(読み取り専用・決定論)。
 * 条件は返さない。獲得済みのバッジ(表示名+雰囲気)だけを返す。
 */
export async function evaluateHiddenBadges(
  client: SqlClient,
  userId: string,
): Promise<EarnedBadge[]> {
  const rows = await client.query<{
    item_key: string;
    weather: string | null;
    track: string | null;
    surface: string | null;
    settled_outcome: string | null;
    effective_race_date: string;
  }>(
    `select iu.item_key,
            r.weather::text as weather,
            r.track_condition::text as track,
            r.surface::text as surface,
            iu.settled_outcome,
            iu.effective_race_date::text as effective_race_date
     from item_usages iu
     left join races r on r.id = iu.race_id
     where iu.user_id = $1 and iu.status = 'SETTLED'`,
    [userId],
  );

  const events: UsageEvent[] = rows.rows
    .filter((r) => r.weather !== null && r.settled_outcome !== null)
    .map((r) => ({
      itemKey: r.item_key,
      weather: r.weather!,
      track: r.track ?? '',
      surface: r.surface ?? '',
      survived: r.settled_outcome === 'SURVIVED',
      raceDate: r.effective_race_date,
    }));

  // メタ実績が下位バッジを参照するので、獲得集合を育てながら2パス評価する。
  const earnedKeys = new Set<string>();
  const out: EarnedBadge[] = [];
  // 依存のない基本バッジを先に、メタ(earned参照)を後に評価するため2周する。
  for (let pass = 0; pass < 2; pass += 1) {
    for (const b of BADGES) {
      if (earnedKeys.has(b.key)) continue;
      if (b.earned(events, earnedKeys)) {
        earnedKeys.add(b.key);
        out.push({ key: b.key, name: b.name, flavor: b.flavor, tone: b.tone });
      }
    }
  }
  // 定義順で安定ソート(表示の一貫性)。
  const order = new Map(BADGES.map((b, i) => [b.key, i]));
  out.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  return out;
}
