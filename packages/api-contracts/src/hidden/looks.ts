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
 *     per-horse funnel**。累積はその馬自身にのみ効く。
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

export async function computeHiddenLooks(
  client: SqlClient,
  horseIds: readonly string[],
): Promise<Map<string, HiddenLook>> {
  const out = new Map<string, HiddenLook>();
  if (horseIds.length === 0) return out;
  for (const id of horseIds) out.set(id, EMPTY());

  // ---- NIGHT: Day0新規発行の元予約の確定時刻(MYT)が秘密の1分 ----
  const night = await client.query<{ horse_id: string }>(
    `select a.horse_id
     from ownership_assignments a
     join purchase_sessions ps on ps.id = a.purchase_session_id
     where a.horse_id = any($1) and a.market_listing_id is null
       and extract(hour   from (ps.created_at at time zone 'UTC') + interval '8 hours') = $2
       and extract(minute from (ps.created_at at time zone 'UTC') + interval '8 hours') = $3`,
    [horseIds, NIGHT_HOUR_MYT, NIGHT_MINUTE_MYT],
  );
  for (const r of night.rows) out.get(r.horse_id)!.nightVariant = true;

  // ---- GOLDEN: 生存レースの commit_hash が秘密接頭辞 ----
  const golden = await client.query<{ horse_id: string }>(
    `select distinct rr.horse_id
     from race_results rr
     join races r on r.id = rr.race_id
     join randomness_commits rc on rc.id = r.seed_commit_id
     where rr.horse_id = any($1) and rr.is_burned = false and lower(rc.commit_hash) like $2`,
    [horseIds, `${GOLDEN_HASH_PREFIX}%`],
  );
  for (const r of golden.rows) out.get(r.horse_id)!.goldenStar = true;

  // ---- AURA: 7日間毎日調教したチャンピオン(DAY7_CLEARED/MEMORIALIZED) ----
  const aura = await client.query<{ id: string }>(
    `select h.id
     from horses h
     where h.id = any($1) and h.status in ('DAY7_CLEARED', 'MEMORIALIZED')
       and (select count(distinct t.effective_race_date) from training_sessions t where t.horse_id = h.id) >= 7`,
    [horseIds],
  );
  for (const r of aura.rows) out.get(r.id)!.goldenAura = true;

  // ---- REVENGE: 惜敗(Day5+ BURN)直後24hの予約から生まれた馬 → 炎 ----
  const revenge = await client.query<{ horse_id: string; day7: boolean }>(
    `select a.horse_id,
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
           and s.current_day >= $2
           and hb.created_at <= ps.created_at
           and hb.created_at > ps.created_at - interval '24 hours'
       )`,
    [horseIds, REVENGE_MIN_BURN_DAY],
  );
  for (const r of revenge.rows) {
    const cur = out.get(r.horse_id)!;
    cur.revengeFlame = true;
    if (r.day7) cur.revengeGold = true;
  }

  // ---- MILESTONE: 生まれ日(MYT)が7日、または通算Day0新規発行の通番が節目 ----
  const dom = await client.query<{ id: string }>(
    `select id from horses
     where id = any($1)
       and extract(day from (created_at at time zone 'UTC') + interval '8 hours') = $2`,
    [horseIds, MILESTONE_BIRTH_DOM],
  );
  for (const r of dom.rows) out.get(r.id)!.milestone = true;

  const mintIdx = await client.query<{ id: string }>(
    `with mints as (
       select h.id, row_number() over (order by h.created_at, h.id) as n
       from horses h
       join ownership_assignments a on a.horse_id = h.id and a.market_listing_id is null
     )
     select id from mints where id = any($1) and n = any($2)`,
    [horseIds, MILESTONE_MINT_INDEXES],
  );
  for (const r of mintIdx.rows) out.get(r.id)!.milestone = true;

  // ---- COLOR(原色ルート): その馬での「適性一致アイテム×一致条件×生存」累積 ----
  const color = await client.query<{
    horse_id: string; blue: number; yellow: number; green: number; red: number; black: number;
  }>(
    `select iu.horse_id,
       count(*) filter (where iu.item_key = any($2) and r.weather in ('RAIN','STORM'))   as blue,
       count(*) filter (where iu.item_key = any($3) and r.weather = 'SUNNY')             as yellow,
       count(*) filter (where iu.item_key = any($4) and (r.surface = 'TURF' or r.track_condition in ('SOFT','HEAVY'))) as green,
       count(*) filter (where iu.item_key = any($5) and r.weather = 'STORM')             as red,
       count(*) filter (where iu.item_key = any($6))                                     as black
     from item_usages iu
     join races r on r.id = iu.race_id
     where iu.horse_id = any($1) and iu.status = 'SETTLED' and iu.settled_outcome = 'SURVIVED'
     group by iu.horse_id`,
    [horseIds, RAIN_ITEMS, SUN_ITEMS, TURF_MUD_ITEMS, STORM_EPIC_ITEMS, BURN_DROP_ITEMS],
  );
  for (const r of color.rows) {
    const cur = out.get(r.horse_id)!;
    // 優先度: rarer first
    if (Number(r.black) >= COLOR_NEED.black) cur.colorVariant = 'black';
    else if (Number(r.red) >= COLOR_NEED.red) cur.colorVariant = 'red';
    else if (Number(r.blue) >= COLOR_NEED.blue) cur.colorVariant = 'blue';
    else if (Number(r.yellow) >= COLOR_NEED.yellow) cur.colorVariant = 'yellow';
    else if (Number(r.green) >= COLOR_NEED.green) cur.colorVariant = 'green';
  }

  return out;
}
