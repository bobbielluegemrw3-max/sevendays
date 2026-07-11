import Link from 'next/link';
import { PURCHASE_LOCK_AMOUNT } from '@sevendays/domain';
import { money, horseValue } from '@/components/stable-shared';
import { ChampionCard, ListedCard, StableBrowser } from '@/components/StableBrowser';
import { RarityLegend } from '@/components/RarityLegend';
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
  /** 'SMART' | 'MANUAL' | null — 出品中の事実表示(Decision 087監査)。 */
  listing: string | null;
}
// status: 'ACTIVE'(出走中) | 'BURNED'(消滅) | 'DAY7_CLEARED'(チャンピオン) | 'MEMORIALIZED'(記念馬)
export interface StableData {
  horses: StableHorse[];   // 全所有馬(現役 + 過去)
  pendingCount: number;    // 割当待ちの購入予約数
}

export function StableView({ data }: { data: StableData }) {
  const { horses, pendingCount } = data;

  const active = horses.filter((h) => h.status === 'ACTIVE');
  // 手動出品中(Market Lock)は今夜走らない — 「出走中」と分けて事実どおり見せる
  const racing = active.filter((h) => h.listing !== 'MANUAL');
  const listed = active.filter((h) => h.listing === 'MANUAL');
  const champions = horses.filter((h) => h.status === 'DAY7_CLEARED' || h.status === 'MEMORIALIZED');
  const burned = horses.filter((h) => h.status === 'BURNED');
  const stableValue = active.reduce((sum, h) => sum + Number(horseValue(h.current_day)), 0);

  return (
    <div className={s.app}>
      {/* ===== ヘッダ(頭数 + 評価額合計) ===== */}
      <div className={s.header}>
        <div>
          <div className={s.headTitle}>マイ厩舎</div>
          <div className={s.headSub}>
            現役 {active.length}頭{champions.length > 0 ? ` · チャンピオン ${champions.length}頭` : ''} · 消滅 {burned.length}頭
          </div>
        </div>
        <div className={s.headStats}>
          <div className={`${s.stat} ${s.statCount}`}>
            <div className="k">保有 HORSES</div>
            <div className="v">{horses.length}<small>頭</small></div>
          </div>
          <div className={`${s.stat} ${s.statValue}`}>
            <div className="k">評価額合計</div>
            <div className="v">{money(stableValue)}<small>USDT</small></div>
          </div>
        </div>
      </div>

      {/* ===== 「馬を迎える」CTA ===== */}
      <section className={s.welcome}>
        <div>
          <div className={s.welcomeTitle}>新しい馬を迎える</div>
          <div className={s.welcomeText}>
            マーケットで購入予約(1頭につき最大 <b>{money(PURCHASE_LOCK_AMOUNT)} USDT</b> ロック)をすると、今夜20:00のレースで馬が割り当てられます。
            {pendingCount > 0 ? <span className={s.welcomePending}> 現在 {pendingCount}件 割当待ち。</span> : null}
          </div>
        </div>
        <Link href="/market" className={s.welcomeCta}>馬を迎える ▶</Link>
      </section>

      {/* ===== 出走中(手動出品中を除く実数・検索/ソート/絞り込み/ページング) ===== */}
      <section>
        <div className={s.secHead}>
          <span className={`${s.secLabel} ${s.secLabelActive}`}>出走中 · TONIGHT&apos;S RUNNERS</span>
          <span className={s.secCount}>{racing.length}</span>
          <span className={s.secNote}><span className={s.live}>●</span> 今夜20:00 一斉発走</span>
        </div>
        {racing.length > 0 ? (
          <StableBrowser kind="active" horses={racing} />
        ) : (
          <div className={s.emptyBox}>
            {pendingCount > 0
              ? `割当待ち ${pendingCount} 件 — 今夜のレースで馬が誕生します。`
              : '出走中の馬はいません。上の「馬を迎える」から参加しましょう。'}
          </div>
        )}
        <div className={s.legendWrap}><RarityLegend /></div>
      </section>

      {/* ===== 出品中(Market Lock=今夜走らない・調教CTAなし) ===== */}
      {listed.length > 0 ? (
        <section>
          <div className={s.secHead}>
            <span className={`${s.secLabel} ${s.secLabelListed}`}>出品中 · ON THE MARKET</span>
            <span className={s.secCount}>{listed.length}</span>
            <span className={s.secNote}>今夜は出走しません(Day・価値は凍結)· 管理は<Link href="/market" className={s.secLink}>マーケット</Link></span>
          </div>
          <div className={s.gallery}>
            {listed.map((h) => <ListedCard key={h.id} h={h} />)}
          </div>
        </section>
      ) : null}

      {/* ===== チャンピオンコレクション(金枠NFTギャラリー) ===== */}
      {champions.length > 0 ? (
        <section>
          <div className={s.secHead}>
            <span className={`${s.secLabel} ${s.secLabelChamp}`}>チャンピオンコレクション · MY NFTS</span>
            <span className={s.secCount}>{champions.length}</span>
            <span className={s.secNote}>Day7走破の栄光 — 200 USDT報酬+記念NFT</span>
          </div>
          <div className={s.champGrid}>
            {champions.map((h) => <ChampionCard key={h.id} h={h} />)}
          </div>
        </section>
      ) : null}

      {/* ===== BURNED(消滅の記録・検索/ソート/ページング) ===== */}
      {burned.length > 0 ? (
        <section>
          <div className={s.secHead}>
            <span className={`${s.secLabel} ${s.secLabelPast}`}>消滅の記録 · BURNED</span>
            <span className={s.secCount}>{burned.length}</span>
            <span className={s.secNote}>レースで消滅した馬たち</span>
          </div>
          <StableBrowser kind="past" horses={burned} />
        </section>
      ) : null}
    </div>
  );
}
