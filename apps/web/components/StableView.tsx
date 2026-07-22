import Link from 'next/link';
import { horseValue, uncollectedGain } from '@/components/stable-shared';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { BulkTrainButton } from '@/components/BulkTrainButton';
import { ChampionCard, ListedCard, StableBrowser } from '@/components/StableBrowser';
import { HiddenBadges, type HiddenBadge } from '@/components/HiddenBadges';
import { APP_COPY, type Lang } from '@/lib/i18n';
import { fill } from '@/lib/i18n-shared';
import s from '../app/stable.module.css';

/* ============================================================================
 * /horses(マイ厩舎)再設計 — ダッシュボード Option 1c と同じ部品言語。
 *
 * サーバーコンポーネント(シェル)。ヘッダ + CTA を描画し、出走中/過去のリストは
 * クライアントの <StableBrowser>(検索・ソート・絞り込み・ページネーション)に委譲。
 * 100頭規模の一括所有でも快適に一覧・選択できる。
 *
 * 表示してよい数値は StableData + PRICE_TABLE_V1 のみ(V2: 旧177.16表示は廃止)。
 * 馬の絵は既存 HorseArt(dna_hash 決定論)のみ。データ取得層 page.tsx は依頼側で結線。
 * ========================================================================== */

/* ---- props 型(page.tsx / StableBrowser が import) ------------------------ */
export interface StableHorse {
  id: string; name: string; status: string; current_day: number;
  horse_type: string; rarity: string; condition: string; fatigue: string;
  dna_hash: string; trained_for_next_race: boolean;
  /** 総合値V0(0-100)。ACTIVE以外は null(FUN_V2_PLAN.md §3 A1)。 */
  total_value?: number | null;
  /** 今夜の安全圏(出走馬のみ・目安)。 */
  tonight_rank?: number | null;
  tonight_entrants?: number | null;
  tonight_band?: 'SAFE' | 'MID' | 'RISK' | null;
  /** 'SMART' | 'MANUAL' | null — 出品中の事実表示(Decision 087監査)。 */
  listing: string | null;
  /** 隠し演出(EASTER_EGG_PLAN.md)。 */
  night_variant?: boolean;
  golden_star?: boolean;
  golden_aura?: boolean;
  revenge_flame?: boolean;
  revenge_gold?: boolean;
  milestone?: boolean;
  /** 全身原色ルック(黒/赤/青/黄/緑・null=通常)。 */
  color_variant?: 'black' | 'red' | 'blue' | 'yellow' | 'green' | null;
}
// status: 'ACTIVE'(出走中) | 'BURNED'(消滅) | 'DAY7_CLEARED'(チャンピオン) | 'MEMORIALIZED'(記念馬)
export interface StableData {
  /** V2エンジン稼働中(一括調教=V1機能を隠す)。 */
  engineV2?: boolean;
  /** 厩舎名(Decision 097)。未設定はマイ厩舎。 */
  stableName?: string | null;
  /** 調教チケット累計(/me由来・A2)。 */
  trainingTickets?: number;
  horses: StableHorse[];   // 全所有馬(現役 + 過去)
  pendingCount: number;    // 割当待ちの購入予約数
  /** 獲得済みの隠し称号(EASTER_EGG_PLAN.md)。0件なら非表示。 */
  hiddenBadges?: HiddenBadge[];
  /** 名伯楽ランク(施策D・top60圏内のみ)。圏外/新規/取得失敗は null で非表示。 */
  breederRank?: number | null;
}

/** 7日レール(サマリー用の大きい版)。StableBrowser の DayRail と同じ見え方。 */
function SummaryRail({ day }: { day: number }) {
  return (
    <div className={`${s.rail} ${s.railBig}`}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = i + 1;
        const cls = d < day + 1 ? s.pipDone : d === day + 1 ? s.pipToday : s.pip;
        return <span key={d} className={cls} />;
      })}
    </div>
  );
}

export function StableView({ data, lang = 'ja' }: { data: StableData; lang?: Lang }) {
  const { horses, pendingCount } = data;
  const t = APP_COPY[lang].stable;

  const active = horses.filter((h) => h.status === 'ACTIVE');
  // 手動出品中(Market Lock)は今夜走らない — 「出走中」と分けて事実どおり見せる
  const racing = active.filter((h) => h.listing !== 'MANUAL');
  const listed = active.filter((h) => h.listing === 'MANUAL');
  const champions = horses.filter((h) => h.status === 'DAY7_CLEARED' || h.status === 'MEMORIALIZED');
  const burned = horses.filter((h) => h.status === 'BURNED');
  const stableValue = active.reduce((sum, h) => sum + Number(horseValue(h.current_day)), 0);
  const uncollectedTotal = racing.reduce((sum, h) => sum + uncollectedGain(h), 0);
  // 頭数サマリー(チャンピオン0頭のときは省略 — 従来と同じ)
  // C(誇り): 最高到達 Day は「まだチャンピオンなし」より前向きな到達目標として出す
  const bestDepth = horses.reduce((m, h) => Math.max(m, Math.min(7, h.current_day)), 0);
  const subParts = [
    fill(t.sub_active_tpl, { n: active.length }),
    ...(champions.length > 0 ? [fill(t.sub_champ_tpl, { n: champions.length })] : []),
    fill(t.sub_burned_tpl, { n: burned.length }),
    ...(bestDepth > 0 ? [fill(t.sum_best_depth_tpl, { d: bestDepth })] : []),
    // 腕を認められた人にだけ出る誇り(top60圏内)。圏外は出さない
    ...(data.breederRank ? [fill(t.sum_breeder_rank_tpl, { r: data.breederRank })] : []),
  ];

  /* ---- サマリー A: 今夜(STABLE_REVISION_SPEC 2026-07-22) --------------------
     tonight_band は API が既に返している目安値。ここは集計するだけで、
     新しい数字を作らない。R1: 「BURNされる」とは書かない(帯は目安)。 */
  const racingTonight = racing.filter((h) => h.tonight_band);
  const safeN = racingTonight.filter((h) => h.tonight_band === 'SAFE').length;
  const midN = racingTonight.filter((h) => h.tonight_band === 'MID').length;
  const riskN = racingTonight.filter((h) => h.tonight_band === 'RISK').length;
  // 名指しは「最初に見つかった RISK」ではなく **帯内で最も下の1頭**。
  // 配列順は取得順で意味が無く、名指しする以上は一番危ない馬であるべき
  const riskHorse = racingTonight
    .filter((h) => h.tonight_band === 'RISK' && h.tonight_rank && h.tonight_entrants)
    .reduce<StableHorse | null>((worst, h) => {
      if (!worst) return h;
      const a1 = h.tonight_rank! / h.tonight_entrants!;
      const b1 = worst.tonight_rank! / worst.tonight_entrants!;
      return a1 > b1 ? h : worst;
    }, null);

  /* ---- サマリー B: 走破に一番近い現役馬 ---------------------------------- */
  // 母集団は racing ではなく active。全馬が手動出品中で今夜の出走が0でも、
  // 「走破に一番近い馬」は変わらず存在する(SPEC §3: 今夜0でも B は継続)
  const roadHorse = active.reduce<StableHorse | null>(
    (best, h) => (!best || h.current_day > best.current_day ? h : best),
    null,
  );
  const racesLeft = roadHorse ? 7 - Math.min(7, roadHorse.current_day) : 0;
  // 真の新規(1頭も持たず履歴も無い)にはサマリーを出さない。
  // 空の TONIGHT ブロックを出すのが一番やってはいけないこと(ダッシュの轍)
  const showSummary = horses.length > 0;
  // {amt} の前後に分割して金額だけ太字にする(語順の言語差を吸収)


  return (
    <div className={s.app}>
      {/* ===== ヘッダ(厩舎名 + 誇り) =====
          C(誇り)は独立した箱を作らず、既存の見出し行に寄せる。箱を増やすと
          上部が過密になり「引き算」に反する(STABLE_REVISION_SPEC §1 視覚階層) */}
      <div className={s.header}>
        <div>
          <div className={s.headTitle}>{data.stableName ?? t.default_name}</div>
          <div className={s.headSub}>{subParts.join(' · ')}</div>
        </div>
      </div>

      {/* ===== STABLE SUMMARY(A: 今夜 / B: チャンピオンへの道) =====
          この厩舎ページを毎日開く理由は「今夜うちの馬は生き残るか」。
          その答えは各カードの RankLine に埋もれていたので最上部へ引き上げる。
          数字はすべて既存の実データ(tonight_band / current_day)の集計 */}
      {showSummary ? (
        <section className={s.summary}>
          <div className={s.sumTonight}>
            <div className={s.sumEyebrow}><span className={s.live}>●</span> TONIGHT</div>
            <div className={s.sumH}>
              {racingTonight.length > 0
                ? fill(t.sum_tonight_h_tpl, { n: racingTonight.length })
                : t.sum_tonight_none}
            </div>
            {racingTonight.length > 0 ? (
              <>
                <div className={s.sumBands}>
                  <span className={s.sumSafe}><b>{safeN}</b> {t.band_safe}</span>
                  <span className={s.sumMid}><b>{midN}</b> {t.band_mid}</span>
                  <span className={s.sumRisk}><b>{riskN}</b> {t.band_risk}</span>
                </div>
                {riskHorse ? (
                  <div className={s.sumPoint}>
                    → {fill(t.sum_risk_point_tpl, {
                      name: riskHorse.name,
                      r: riskHorse.tonight_rank ?? 0,
                      n: riskHorse.tonight_entrants ?? 0,
                    })}
                  </div>
                ) : (
                  <div className={s.sumSafeNote}>{t.sum_all_safe}</div>
                )}
              </>
            ) : null}
          </div>

          {roadHorse ? (
            <div className={s.sumRoad}>
              <div className={s.sumEyebrow}>◆ {t.sum_road_h}</div>
              <SummaryRail day={roadHorse.current_day} />
              <div className={s.sumRoadText}>
                {fill(racesLeft <= 1 ? t.sum_road_last_tpl : t.sum_road_tpl, {
                  name: roadHorse.name, d: Math.min(7, roadHorse.current_day), n: racesLeft,
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ===== 在庫メトリクス(頭数 / 評価額 / チケット) =====
          管理情報なので、毎日の核(サマリー)の下へ小さく降ろす(消さない) */}
      <div className={s.metaRow}>
        <span className={s.metaItem}>{t.stat_horses_k}<b>{horses.length}</b></span>
        <span className={`${s.metaItem} ${s.metaValue}`}>
          {t.stat_value_k}
          {/* 評価額は馬の育成・売買で変わる — 変化時に登る(2026-07-21・1-1) */}
          <b><AnimatedNumber value={stableValue} digits={2} group /><small>USDT</small></b>
        </span>
        <span className={s.metaItem}>{t.tickets_k}<b><AnimatedNumber value={data.trainingTickets ?? 0} /></b></span>
      </div>
      <div className={s.ticketsNote}>{t.tickets_note}</div>

      {/* ===== 獲得した称号(隠し実績・EASTER_EGG_PLAN.md) ===== */}
      {data.hiddenBadges && data.hiddenBadges.length > 0 ? (
        <HiddenBadges badges={data.hiddenBadges} title={t.badges_title} />
      ) : null}

      {/* ===== 「馬を迎える」CTA ===== */}
      <section className={s.welcome}>
        <div>
          <div className={s.welcomeTitle}>{t.welcome_title}</div>
          <div className={s.welcomeText}>
            {t.welcome_text_tpl}
            {pendingCount > 0 ? <span className={s.welcomePending}>{fill(t.welcome_pending_tpl, { n: pendingCount })}</span> : null}
          </div>
        </div>
        <Link href="/market" className={s.welcomeCta}>{t.welcome_cta}</Link>
      </section>

      {/* ===== 出走中(手動出品中を除く実数・検索/ソート/絞り込み/ページング) ===== */}
      <section>
        <div className={s.secHead}>
          <span className={`${s.secLabel} ${s.secLabelActive}`}>{t.sec_running}</span>
          <span className={s.secCount}>{racing.length}</span>
          <span className={s.secNote}><span className={s.live}>●</span> {t.sec_note_running}</span>
        </div>
        {racing.length > 0 ? (
          <>
            {!data.engineV2 && (
              <BulkTrainButton untrainedCount={racing.filter((h) => !h.trained_for_next_race).length} uncollectedTotal={uncollectedTotal} t={t} />
            )}
            <StableBrowser kind="active" horses={racing} t={t} />
          </>
        ) : (
          <div className={s.emptyBox}>
            {pendingCount > 0 ? fill(t.empty_pending_tpl, { n: pendingCount }) : t.empty_none}
          </div>
        )}
      </section>

      {/* ===== 出品中(Market Lock=今夜走らない・調教CTAなし) ===== */}
      {listed.length > 0 ? (
        <section>
          <div className={s.secHead}>
            <span className={`${s.secLabel} ${s.secLabelListed}`}>{t.sec_listed}</span>
            <span className={s.secCount}>{listed.length}</span>
            <span className={s.secNote}>{t.listed_note_pre}<Link href="/market" className={s.secLink}>{t.listed_note_link}</Link></span>
          </div>
          <div className={s.gallery}>
            {listed.map((h) => <ListedCard key={h.id} h={h} t={t} />)}
          </div>
        </section>
      ) : null}

      {/* ===== チャンピオンコレクション(金枠NFTギャラリー) ===== */}
      {champions.length > 0 ? (
        <section>
          <div className={s.secHead}>
            <span className={`${s.secLabel} ${s.secLabelChamp}`}>{t.sec_champ}</span>
            <span className={s.secCount}>{champions.length}</span>
            <span className={s.secNote}>{t.sec_note_champ}</span>
          </div>
          <div className={s.champGrid}>
            {champions.map((h) => <ChampionCard key={h.id} h={h} t={t} />)}
          </div>
        </section>
      ) : null}

      {/* ===== BURNED(消滅の記録・検索/ソート/ページング) ===== */}
      {burned.length > 0 ? (
        <section>
          <div className={s.secHead}>
            <span className={`${s.secLabel} ${s.secLabelPast}`}>{t.sec_burned}</span>
            <span className={s.secCount}>{burned.length}</span>
            <span className={s.secNote}>{t.sec_note_burned}</span>
          </div>
          <StableBrowser kind="past" horses={burned} t={t} />
        </section>
      ) : null}
    </div>
  );
}
