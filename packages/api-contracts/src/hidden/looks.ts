import type { SqlClient } from '@sevendays/shared';

/**
 * ============================================================================
 *  隠し演出ルック(真夜中の馬・黄金の夜) — 機密度: 最高
 * ============================================================================
 *  正典: EASTER_EGG_PLAN.md(案1「真夜中の馬」・案7「黄金の夜」)。
 *
 *  【絶対の規律】(hidden/achievements.ts と同じ)
 *   - 効果はコスメティックのみ(見た目の変化)。馬の生死・レース結果・USDT・
 *     経済・ミント確率に一切触れない。ルックの選択が変わるだけ。
 *   - **獲得条件(トリガー)はここにしか存在しない**。CS knowledge.ts・admin・
 *     公開docs・APIレスポンスには条件を絶対に書かない。真偽フラグだけ返す。
 *   - 判定は不変の記録から読み取りのみ。決定論的。マイグレーション不要。
 *
 *  真夜中の馬(NIGHT): その馬を生んだ購入予約の確定時刻(MYT)が「秘密の1分」に
 *   一致した Day0 新規発行馬 → 承認済み576ルックの外にある「夜色」で表示。
 *   「今夜、その時刻に予約すれば試せる」= 検証最速の発見メカニクス。
 *
 *  黄金の夜(GOLDEN): 生き延びたレースの seed commit_hash が「秘密パターン」に
 *   一致した夜の生還馬 → カードに金の星。公開データ(検証パネルの commit_hash)を
 *   掘るデータ勢への褒美。commit_hash は SHA-256(seed) なので運営は操作できない。
 *
 *  ※秘密の値(分・ハッシュパターン)はこの定数にのみ存在する。SQLは束縛パラメータ
 *    で比較するだけ(構造を見ても値は分からない)。値を変えたら EASTER_EGG_PLAN.md の
 *    SHA-256 を再計算して履歴追記。
 * ============================================================================
 */

/** 真夜中の馬: 予約確定時刻(MYT)が「HH時MMの分」であること。深夜帯の秘密の1分。 */
const NIGHT_HOUR_MYT = 2;
const NIGHT_MINUTE_MYT = 22;

/** 黄金の夜: レースの commit_hash がこの接頭辞で始まる夜(≈1/256)。 */
const GOLDEN_HASH_PREFIX = '77';

export interface HiddenLook {
  /** 夜色ルックで描画する(真夜中の馬)。 */
  nightVariant: boolean;
  /** 金の星を重ねる(黄金の夜の生還馬)。 */
  goldenStar: boolean;
}

const EMPTY: HiddenLook = { nightVariant: false, goldenStar: false };

/**
 * 馬IDの集合に対する隠しルックフラグ(読み取り専用・決定論)。
 * 条件は返さない — 真偽だけ。1クエリで両方を集計する。
 */
export async function computeHiddenLooks(
  client: SqlClient,
  horseIds: readonly string[],
): Promise<Map<string, HiddenLook>> {
  const out = new Map<string, HiddenLook>();
  if (horseIds.length === 0) return out;
  for (const id of horseIds) out.set(id, { ...EMPTY });

  // 真夜中の馬: Day0新規発行(market_listing_id is null)の元予約の確定時刻を
  // MYT(UTC+8)に直し、時=NIGHT_HOUR・分=NIGHT_MINUTE の予約から生まれた馬。
  const night = await client.query<{ horse_id: string }>(
    `select a.horse_id
     from ownership_assignments a
     join purchase_sessions ps on ps.id = a.purchase_session_id
     where a.horse_id = any($1)
       and a.market_listing_id is null
       and extract(hour   from (ps.created_at at time zone 'UTC') + interval '8 hours') = $2
       and extract(minute from (ps.created_at at time zone 'UTC') + interval '8 hours') = $3`,
    [horseIds, NIGHT_HOUR_MYT, NIGHT_MINUTE_MYT],
  );
  for (const r of night.rows) {
    const cur = out.get(r.horse_id);
    if (cur) cur.nightVariant = true;
  }

  // 黄金の夜: 生き延びたレース(race_results.is_burned = false)の
  // commit_hash が秘密接頭辞で始まる夜の生還馬。
  const golden = await client.query<{ horse_id: string }>(
    `select distinct rr.horse_id
     from race_results rr
     join races r on r.id = rr.race_id
     join randomness_commits rc on rc.id = r.seed_commit_id
     where rr.horse_id = any($1)
       and rr.is_burned = false
       and lower(rc.commit_hash) like $2`,
    [horseIds, `${GOLDEN_HASH_PREFIX}%`],
  );
  for (const r of golden.rows) {
    const cur = out.get(r.horse_id);
    if (cur) cur.goldenStar = true;
  }

  return out;
}
