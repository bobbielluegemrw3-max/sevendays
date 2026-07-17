import Link from 'next/link';
import { PURCHASE_LOCK_AMOUNT } from '@sevendays/domain';
import { money, horseValue, uncollectedGain } from '@/components/stable-shared';
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
 * 表示してよい数値は StableData + PRICE_TABLE_V1 + PURCHASE_LOCK_AMOUNT のみ。
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
  /** 厩舎名(Decision 097)。未設定はマイ厩舎。 */
  stableName?: string | null;
  /** 調教チケット累計(/me由来・A2)。 */
  trainingTickets?: number;
  horses: StableHorse[];   // 全所有馬(現役 + 過去)
  pendingCount: number;    // 割当待ちの購入予約数
  /** 獲得済みの隠し称号(EASTER_EGG_PLAN.md)。0件なら非表示。 */
  hiddenBadges?: HiddenBadge[];
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
  const subParts = [
    fill(t.sub_active_tpl, { n: active.length }),
    ...(champions.length > 0 ? [fill(t.sub_champ_tpl, { n: champions.length })] : []),
    fill(t.sub_burned_tpl, { n: burned.length }),
  ];
  // {amt} の前後に分割して金額だけ太字にする(語順の言語差を吸収)
  const [welcome1, welcome2] = t.welcome_text_tpl.split('{amt}');

  return (
    <div className={s.app}>
      {/* ===== ヘッダ(頭数 + 評価額合計) ===== */}
      <div className={s.header}>
        <div>
          <div className={s.headTitle}>{data.stableName ?? t.default_name}</div>
          <div className={s.headSub}>{subParts.join(' · ')}</div>
        </div>
        <div className={s.headStats}>
          <div className={`${s.stat} ${s.statCount}`}>
            <div className="k">{t.stat_horses_k}</div>
            <div className="v">{horses.length}</div>
          </div>
          <div className={`${s.stat} ${s.statValue}`}>
            <div className="k">{t.stat_value_k}</div>
            <div className="v">{money(stableValue)}<small>USDT</small></div>
          </div>
          {(data.trainingTickets ?? 0) > 0 ? (
            <div className={`${s.stat} ${s.statTickets}`}>
              <div className="k">{t.tickets_k}</div>
              <div className="v">{data.trainingTickets}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ===== 獲得した称号(隠し実績・EASTER_EGG_PLAN.md) ===== */}
      {data.hiddenBadges && data.hiddenBadges.length > 0 ? (
        <HiddenBadges badges={data.hiddenBadges} title={t.badges_title} />
      ) : null}

      {/* ===== 「馬を迎える」CTA ===== */}
      <section className={s.welcome}>
        <div>
          <div className={s.welcomeTitle}>{t.welcome_title}</div>
          <div className={s.welcomeText}>
            {welcome1}<b>{money(PURCHASE_LOCK_AMOUNT)} USDT</b>{welcome2}
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
            <BulkTrainButton untrainedCount={racing.filter((h) => !h.trained_for_next_race).length} uncollectedTotal={uncollectedTotal} t={t} />
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
