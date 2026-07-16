import type { SqlClient } from '@sevendays/shared';

/**
 * ============================================================================
 *  隠し演出ルック — 機密度: 最高
 * ============================================================================
 *  正典: EASTER_EGG_PLAN.md。効果はコスメティックのみ(見た目)。馬の生死・
 *  レース結果・USDT・経済・ミント確率に一切触れない。判定は不変の記録から
 *  読み取りのみ・決定論・マイグレーション不要。獲得条件はここにしか存在せず、
 *  API/CS/admin/docs には真偽フラグ(と色種別)だけ出す。SQLは束縛パラメータ
 *  比較なので構造を見ても秘密値は分からない。
 *
 *  収録:
 *   - NIGHT(真夜中の馬): 予約確定時刻(MYT)が秘密の1分 → 夜色ルック
 *   - GOLDEN(黄金の夜): 生存レースの seed commit_hash が秘密パターン → 金星
 *   - AURA(皆勤の金アウラ・案2): 7日間毎日調教したチャンピオン → 金のオーラ
 *   - REVENGE(リベンジの焔・案3): 惜敗(Day5+ BURN)直後24hの予約から生まれた
 *     馬 → 炎の徽章。Day7到達で金の炎
 *   - MILESTONE(777・案8): 通算777/7777頭目のDay0新規発行、または7日生まれ → 刻印
 *   - COLOR(原色ルート・オーナー新要望): その馬に適性アイテムを一致条件で
 *     使って生存を積むと、全身が原色に染まる(黒/赤/青/黄/緑)。**アイテム消費の
 *     funnel**。
 *
 *  【帰属の原則(2026-07-15 オーナー指摘の修正)】
 *   馬は自動出品で持ち主が入れ替わる。したがって「積み重ね系」(努力への報酬)は
 *   **必ず viewer(=今その馬を持つ本人)自身の行動だけ**で数える — 他人がやった分が
 *   割り当てで化けないように。COLOR / AURA / GOLDEN(生存時の所有者)は viewer 帰属。
 *   一方「生まれつきの希少形質」(NIGHT/REVENGE/MILESTONE)は馬に付いて売買で移る
 *   =市場がプレミアを付ける対象(所有していること自体が報酬・"自分がやった"主張ではない)。
 * ============================================================================
 */

/** 真夜中の馬: 予約確定(MYT)が HH時MMの分。 */
const NIGHT_HOUR_MYT = 2;
const NIGHT_MINUTE_MYT = 22;

/** 黄金の夜: レース commit_hash がこの接頭辞(≈1/256)。 */
const GOLDEN_HASH_PREFIX = '77';

/** 777: 通算Day0新規発行の通番の節目。 */
const MILESTONE_MINT_INDEXES = [777, 7777];
/** 生まれ日(MYT)がこの日 → 刻印。 */
const MILESTONE_BIRTH_DOM = 7;

/** リベンジ: この Day 以上での BURN を「惜敗」とみなす。 */
const REVENGE_MIN_BURN_DAY = 5;

/** 原色ルートの必要回数(適性一致アイテム×一致条件×生存の、その馬での累積)。 */
const COLOR_NEED = { black: 1, red: 2, blue: 3, yellow: 3, green: 3 } as const;

export type ColorVariant = 'black' | 'red' | 'blue' | 'yellow' | 'green';

export interface HiddenLook {
  nightVariant: boolean;
  goldenStar: boolean;
  goldenAura: boolean;
  revengeFlame: boolean;
  /** 炎が金に燃え上がった(Day7到達)。 */
  revengeGold: boolean;
  milestone: boolean;
  /** 全身原色ルック(null=通常)。優先度: black>red>blue>yellow>green。 */
  colorVariant: ColorVariant | null;
}

const EMPTY = (): HiddenLook => ({
  nightVariant: false, goldenStar: false, goldenAura: false,
  revengeFlame: false, revengeGold: false, milestone: false, colorVariant: null,
});

/** 適性グループ(items.ts の affinity と対応)。 */
const RAIN_ITEMS = ['rain_hood', 'storm_cloak'];
const SUN_ITEMS = ['sunny_visor'];
const STORM_EPIC_ITEMS = ['storm_emperor_cloak'];
const TURF_MUD_ITEMS = ['turf_spikes', 'turf_master_saddle', 'mud_guards', 'mudlord_crown'];
const BURN_DROP_ITEMS = [
  'memento_horseshoe', 'memorial_wreath', 'legacy_mane', 'spirit_roar', 'stardust_sand',
];

/** 統合クエリの1行(kind別に使うカラムだけ埋まる)。 */
interface LookRow {
  kind: 'NIGHT' | 'GOLDEN' | 'AURA' | 'REVENGE' | 'DOM' | 'MINT' | 'COLOR';
  horse_id: string;
  day7: boolean | null;
  blue: string | null;
  yellow: string | null;
  green: string | null;
  red: string | null;
  black: string | null;
}

export async function computeHiddenLooks(
  client: SqlClient,
  horseIds: readonly string[],
  /** 表示する本人(=現在の所有者)。積み重ね系はこの人の行動だけで数える。 */
  viewerUserId: string,
): Promise<Map<string, HiddenLook>> {
  const out = new Map<string, HiddenLook>();
  if (horseIds.length === 0) return out;
  for (const id of horseIds) out.set(id, EMPTY());

  // 7判定を単一ラウンドトリップに統合(2026-07-16 §D: Web↔DBは1往復≈55msのため、
  // 直列7クエリ=馬一覧APIの支配的コストだった)。各CTEは旧実装の各クエリと同一。
  const rows = await client.query<LookRow>(
    `with
     -- NIGHT: Day0新規発行の元予約の確定時刻(MYT)が秘密の1分
     night as (
       select a.horse_id
       from ownership_assignments a
       join purchase_sessions ps on ps.id = a.purchase_session_id
       where a.horse_id = any($1) and a.market_listing_id is null
         and extract(hour   from (ps.created_at at time zone 'UTC') + interval '8 hours') = $2
         and extract(minute from (ps.created_at at time zone 'UTC') + interval '8 hours') = $3
     ),
     -- GOLDEN: 生存レースの commit_hash が秘密接頭辞。かつ「その夜 viewer が
     -- 所有していた」(snapshot の所有者)ときだけ = 他人所有中の生存を化けさせない
     golden as (
       select distinct rr.horse_id
       from race_results rr
       join races r on r.id = rr.race_id
       join randomness_commits rc on rc.id = r.seed_commit_id
       join race_participant_snapshots s on s.race_id = rr.race_id and s.horse_id = rr.horse_id
       where rr.horse_id = any($1) and rr.is_burned = false
         and lower(rc.commit_hash) like $4 and s.owner_user_id = $5
     ),
     -- AURA: viewer が「毎日自分で」7日間調教し切ったチャンピオン
     aura as (
       select h.id as horse_id
       from horses h
       where h.id = any($1) and h.status in ('DAY7_CLEARED', 'MEMORIALIZED')
         and (select count(distinct t.effective_race_date) from training_sessions t
              where t.horse_id = h.id and t.user_id = $5) >= 7
     ),
     -- REVENGE: 惜敗(Day5+ BURN)直後24hの予約から生まれた馬 → 炎
     revenge as (
       select a.horse_id,
              (h.status in ('DAY7_CLEARED', 'MEMORIALIZED')) as day7
       from ownership_assignments a
       join purchase_sessions ps on ps.id = a.purchase_session_id
       join horses h on h.id = a.horse_id
       where a.horse_id = any($1) and a.market_listing_id is null
         and exists (
           select 1
           from horse_burns hb
           join race_participant_snapshots s on s.race_id = hb.race_id and s.horse_id = hb.horse_id
           where hb.owner_user_id_at_snapshot = h.owner_user_id
             and s.current_day >= $6
             and hb.created_at <= ps.created_at
             and hb.created_at > ps.created_at - interval '24 hours'
         )
     ),
     -- MILESTONE: 生まれ日(MYT)が7日
     dom as (
       select id as horse_id from horses
       where id = any($1)
         and extract(day from (created_at at time zone 'UTC') + interval '8 hours') = $7
     ),
     -- MILESTONE: 通算Day0新規発行の通番が節目
     mints as (
       select h.id, row_number() over (order by h.created_at, h.id) as n
       from horses h
       join ownership_assignments a on a.horse_id = h.id and a.market_listing_id is null
     ),
     mintidx as (
       select id as horse_id from mints where id = any($1) and n = any($8)
     ),
     -- COLOR(原色ルート): その馬での「適性一致アイテム×一致条件×生存」累積
     color as (
       select iu.horse_id,
         count(*) filter (where iu.item_key = any($9)  and r.weather in ('RAIN','STORM'))  as blue,
         count(*) filter (where iu.item_key = any($10) and r.weather = 'SUNNY')            as yellow,
         count(*) filter (where iu.item_key = any($11) and (r.surface = 'TURF' or r.track_condition in ('SOFT','HEAVY'))) as green,
         count(*) filter (where iu.item_key = any($12) and r.weather = 'STORM')            as red,
         count(*) filter (where iu.item_key = any($13))                                    as black
       from item_usages iu
       join races r on r.id = iu.race_id
       where iu.horse_id = any($1) and iu.status = 'SETTLED' and iu.settled_outcome = 'SURVIVED'
         and iu.user_id = $5
       group by iu.horse_id
     )
     select 'NIGHT' as kind, horse_id, null::boolean as day7,
            null::bigint as blue, null::bigint as yellow, null::bigint as green,
            null::bigint as red, null::bigint as black from night
     union all select 'GOLDEN', horse_id, null, null, null, null, null, null from golden
     union all select 'AURA', horse_id, null, null, null, null, null, null from aura
     union all select 'REVENGE', horse_id, day7, null, null, null, null, null from revenge
     union all select 'DOM', horse_id, null, null, null, null, null, null from dom
     union all select 'MINT', horse_id, null, null, null, null, null, null from mintidx
     union all select 'COLOR', horse_id, null, blue, yellow, green, red, black from color`,
    [
      horseIds, NIGHT_HOUR_MYT, NIGHT_MINUTE_MYT,
      `${GOLDEN_HASH_PREFIX}%`, viewerUserId, REVENGE_MIN_BURN_DAY,
      MILESTONE_BIRTH_DOM, MILESTONE_MINT_INDEXES,
      RAIN_ITEMS, SUN_ITEMS, TURF_MUD_ITEMS, STORM_EPIC_ITEMS, BURN_DROP_ITEMS,
    ],
  );

  for (const r of rows.rows) {
    const cur = out.get(r.horse_id);
    if (!cur) continue;
    switch (r.kind) {
      case 'NIGHT':
        cur.nightVariant = true;
        break;
      case 'GOLDEN':
        cur.goldenStar = true;
        break;
      case 'AURA':
        cur.goldenAura = true;
        break;
      case 'REVENGE':
        cur.revengeFlame = true;
        if (r.day7) cur.revengeGold = true;
        break;
      case 'DOM':
      case 'MINT':
        cur.milestone = true;
        break;
      case 'COLOR':
        // 優先度: rarer first
        if (Number(r.black) >= COLOR_NEED.black) cur.colorVariant = 'black';
        else if (Number(r.red) >= COLOR_NEED.red) cur.colorVariant = 'red';
        else if (Number(r.blue) >= COLOR_NEED.blue) cur.colorVariant = 'blue';
        else if (Number(r.yellow) >= COLOR_NEED.yellow) cur.colorVariant = 'yellow';
        else if (Number(r.green) >= COLOR_NEED.green) cur.colorVariant = 'green';
        break;
    }
  }

  return out;
}
