import Link from 'next/link';
import { PRICE_TABLE_V1 } from '@sevendays/domain';
import { Countdown } from '@/components/Countdown';
import { NftHorseArt } from '@/components/NftHorseArt';
import { PwaSetupTile } from '@/components/PwaSetupTile';
import { PromoRedeemForm } from '@/components/PromoRedeemForm';
import { TradeAutoTile, TradeModeModal, type TradeSettings } from '@/components/TradeAutoControls';
import { TotalAssetsCard } from '@/components/TotalAssetsCard';
import { deriveNftLook } from '@/lib/nft-visual';
import { uncollectedGain } from '@/components/stable-shared';
import { APP_COPY, type Lang, type AppDict } from '@/lib/i18n';
import { formatMonthDay } from '@/lib/i18n-shared';
import s from '../app/dashboard.module.css';
import { TotalValue } from '@/components/ui/TotalValue';
import { isLvDisplayMode } from '@/lib/i18n';

/** テンプレ文字列の {name} を値で埋める(多言語の語順差を吸収)。 */
function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m: string, k: string) => String(vars[k] ?? ''));
}

/* ============================================================================
 * /dashboard 再設計 — Option 1c「モジュラータイル / ギャラリー」
 *
 * 純粋な表示コンポーネント。props の DashboardData 型に含まれる値と、価格テーブル
 * PRICE_TABLE_V1(Day0=100 → Day6=177.16, 10%日次複利)だけを表示する。架空の
 * 統計は一切追加しない。馬の絵は既存 HorseArt(dna_hash からの決定論生成)を
 * そのまま使用。データ取得層 Dashboard.tsx / API は変更不要。
 *
 * 情報設計(5つの問い):
 *   ① 昨夜の結果   ② 今夜のレースまで  … 最上部で同格に横並び
 *   ③ 今日やること → ④ 資産 → マイ厩舎 → チャンピオン報酬 / ⑤ 通知
 * PC(≥900px)は grid-template-areas の bento、モバイルは1カラム優先度スタック。
 * ========================================================================== */

/* ---- props 型(Dashboard.tsx が import。名称・形は不変) -------------------- */
export interface DashHorse {
  id: string; name: string; status: string; current_day: number;
  horse_type: string; rarity: string; condition: string; fatigue: string;
  dna_hash: string; trained_for_next_race: boolean;
  listing?: string | null;
  /** 総合値(A1/V2)。GET /horses がそのまま供給する。 */
  total_value?: number | null;
}
export interface DashWallet { available: string; locked: string }
export interface DashBuff { buff_rarity: string; buff_bonus_score: string; status: string }
export interface DashRace { id: string; status: string; participant_count: number | null; batch_date: string; slot?: string | null }
export interface DashResult {
  horse_id: string; final_score: string; final_rank: number; is_burned: boolean; horse: DashHorse;
  /** 帯(同じLV)内での「あと何点で助かったか」。全馬生還の夜や帯不明のときは null。 */
  margin?: number | null;
}
export interface DashBuyback { id: string; status: string; payments_paid: number | string }
export interface DashNotification { id: string; notification_type: string; payload_json: { title?: string; body?: string } | null; read_at: string | null; created_at: string }

export interface DashboardData {
  wallet: DashWallet | null;
  horses: DashHorse[];
  buff: DashBuff | null;
  pendingCount: number;
  lastRace: DashRace | null;
  myResults: DashResult[];
  buybacks: DashBuyback[];
  notifications: DashNotification[];
  /** 売買自動化設定(Decision 086)。null = 取得失敗(モーダル/タイルとも出さない)。 */
  trade: TradeSettings | null;
  /** 厩舎名(Decision 097)。未設定はマイ厩舎表示。 */
  stableName?: string | null;
  /** 今週のジャックポット応募口数(=今週の調教確定数・/me由来)。 */
  weeklyTickets?: number;
  /** 週次ジャックポット設定(無効時 null)。 */
  jackpot?: { enabled: boolean; prize_usdt: string; winners: number } | null;
}

/* ---- helpers -------------------------------------------------------------- */
function money(v: string): string {
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function num(n: number): string {
  return n.toLocaleString('en-US');
}
/** その馬の本日の P2P 価値 — 不変の価格テーブルから。 */
function horseValue(currentDay: number): string {
  return PRICE_TABLE_V1[Math.max(0, Math.min(6, currentDay))] ?? PRICE_TABLE_V1[0]!;
}
/** dna_hash から決定論生成された HorseArt を厩舎用に描画。 */
function StableArt({ horse }: { horse: DashHorse }) {
  const look = deriveNftLook(horse.dna_hash, horse.name);
  return <NftHorseArt look={look} className={s.hartCanvas} size={128} />;
}

/** 厩舎ストリップの1頭 — 要約行のみ(詳細はSTABLEページの仕事)。 */
function HorseStrip({ h, t }: { h: DashHorse; t: AppDict['dash'] }) {
  const trained = h.trained_for_next_race;
  return (
    <Link href={`/horses/${h.id}`} className={s.srow}>
      <div className={s.sart}>
        <StableArt horse={h} />
      </div>
      <span className={s.sname}>{h.name}</span>
      {/* 数字群は1つの塊にする。モバイルでは名前の下へ回り込ませるため
          (2026-07-22 オーナー指摘: 1行に並べると総合値以降が画面外へ切れていた) */}
      <span className={s.smeta}>
        {/* レアリティ用バッジ枠の流用をやめ、数字とティア色だけに
            (一覧は数字を見比べる場所。箱が比較を邪魔していた) */}
        {h.total_value !== null && h.total_value !== undefined ? (
          <TotalValue value={h.total_value} size="sm" />
        ) : null}
        <span className={s.sday}>{isLvDisplayMode() ? 'LV.' : 'Day '}{Math.min(7, h.current_day)}/7</span>
        {/* 7日間の物語 — この馬は走破まであと何走か(current_day から。データ追加なし) */}
        <span className={s.sleft}>
          {7 - Math.min(7, h.current_day) <= 1
            ? t.races_left_last
            : fill(t.races_left_tpl, { n: 7 - Math.min(7, h.current_day) })}
        </span>
        <span className={`${s.trainBadge} ${trained ? s.trainYes : s.trainNo}`}>{trained ? t.train_yes : t.train_no}</span>
      </span>
    </Link>
  );
}

/* ---- main ----------------------------------------------------------------- */
export function DashboardView({ data, lang = 'ja' }: { data: DashboardData; lang?: Lang }) {
  const { wallet, horses, pendingCount, lastRace, myResults, buybacks } = data;
  const t = APP_COPY[lang].dash;
  const c = APP_COPY[lang].common;

  const active = horses.filter((h) => h.status === 'ACTIVE');
  const untrained = active.filter((h) => !h.trained_for_next_race);
  const activeBuybacks = buybacks.filter((b) => b.status !== 'COMPLETED');
  const stableValue = active.reduce((sum, h) => sum + Number(horseValue(h.current_day)), 0);

  const survived = myResults.filter((r) => !r.is_burned);
  const burned = myResults.filter((r) => r.is_burned);
  const rankPool = survived.length ? survived : myResults;
  const bestRank = rankPool.reduce((m, r) => Math.min(m, r.final_rank), Infinity);
  const participants = lastRace?.participant_count ?? 0;

  const hasTasks = untrained.length > 0 || pendingCount > 0;
  // 真の新規 = 1頭も持たず、レース履歴も無い。
  // ★「履歴はあるが今 0頭」(全馬BURN/売却済みの常連)は新規ではないので歓迎ブロックを出さない
  const isNewcomer = active.length === 0 && myResults.length === 0;

  return (
    <div className={s.app}>
      {/* DASHBOARD_REVISION_SPEC レベル1: このページが何かを言う1行。
          常連にはハブの枠、新規には「厩舎のゲーム」だと即伝わる */}
      <div className={s.pageHead}>
        <span className={s.pageHeadBrand}>SEVEN DAYS DERBY</span>
        <span className={s.pageHeadSep}>·</span>
        <span className={s.pageHeadStable}>{data.stableName ?? t.dash_stable_default}</span>
      </div>

      {/* レベル2: 真の新規には、空のタイル格子ではなく「まず何をするか」を1枚で。
          チュートリアルではない — 何のゲームで最初の一手がどれか、だけを言う */}
      {isNewcomer ? (
        <section className={s.welcome}>
          <div className={s.welcomeH}>{t.welcome_h}</div>
          <p className={s.welcomeLead}>{t.welcome_lead}</p>
          <Link href="/market" className={`${s.welcomeCta} primary`}>{t.welcome_cta} →</Link>
          <div className={s.welcomeSteps}>
            <span><b>1</b> {t.welcome_step1}</span>
            <span><b>2</b> {t.welcome_step2}</span>
            <span><b>3</b> {t.welcome_step3}</span>
          </div>
        </section>
      ) : null}

      {/* ===== ① レース結果(日付つき — 2026-07-16: ショー直後に「昨夜」は違和感) ===== */}
      {isNewcomer ? null : (
      <section className={s.result}>
        <div className={s.tileHead}>
          <span className={s.tileLabel}>
            {lastRace
              ? fill(t.result_label_tpl, {
                  date: `${formatMonthDay(lang, lastRace.batch_date)}${lastRace.slot === 'MORNING' ? ' 8:00' : lastRace.slot === 'NIGHT' ? ' 20:00' : ''}`,
                })
              : t.result_label}
          </span>
          {lastRace ? <Link href={`/races/${lastRace.id}`} className={s.tileLink}>{t.result_detail}</Link> : null}
        </div>
        {myResults.length > 0 ? (
          <>
            <div className={s.resSummary}>
              <div className={`${s.resStat} ${s.survived}`}><div className="n">{survived.length}</div><div className="k">{t.res_survived}</div></div>
              <div className={`${s.resStat} ${s.burned}`}><div className="n">{burned.length}</div><div className="k">{t.res_burned}</div></div>
              <div className={s.resBest}>
                <div className="n">#{bestRank === Infinity ? '—' : num(bestRank)}</div>
                <div className="k">{fill(t.res_best_tpl, { n: num(participants) })}</div>
              </div>
            </div>
            <div className={s.resList}>
              {myResults.map((r) => (
                <Link key={r.horse_id} href={`/horses/${r.horse_id}`} className={s.resRow}>
                  <span className={s.resRank}>#{num(r.final_rank)}</span>
                  <span className={s.resName}>{r.horse.name}</span>
                  {/* 「あと何点で助かったか」— ショーで見せた緊張を翌朝にも残す。
                      帯(同じLV)内の実測差。全馬生還の夜は margin が無いので出ない */}
                  {typeof r.margin === 'number' ? (
                    <span className={`${s.resMargin} ${r.is_burned ? s.resMarginBad : ''}`}>
                      {fill(r.is_burned ? t.margin_burn_tpl : t.margin_survive_tpl, { v: r.margin.toFixed(2) })}
                    </span>
                  ) : null}
                  {r.is_burned ? (
                    <span className={`${s.pill} ${s.pillBurned}`}>{t.pill_burn}</span>
                  ) : (
                    <span className={`${s.pill} ${s.pillSurvived}`}>{fill(t.pill_survived_tpl, { d: Math.min(7, r.horse.current_day) })}</span>
                  )}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className={s.empty}>
            {t.result_empty}
          </div>
        )}
      </section>
      )}

      {/* ===== ② 今夜のレースまで ===== */}
      <section className={`${s.count} ${isNewcomer ? s.countWide : ''}`}>
        <div className={s.tileHead}>
          <span className={s.tileLabel}>{t.tonight_label}</span>
          <span className={s.live}><span className={s.dot}>●</span> LIVE 8:00 / 20:00 MYT</span>
        </div>
        {/* Tier 2-2: 画面で最も強い48pxの数字が非操作だった。押せば当夜のレースへ
            飛ぶようにして、視線の到達点と動線を一致させる(主アクションの階層は
            変えない — ここは .primary ではない)。 */}
        <Link href="/races" className={s.timerLink} aria-label={t.watch_show}>
          <Countdown className={s.timer} />
        </Link>
        <div className={s.countMeta}>
          <span>{t.countdown_to}</span>
          <span>RUNNERS <b>{active.length}</b></span>
        </div>
        <div className={s.countNote}>{t.tonight_note}</div>
        {data.jackpot?.enabled ? (
          <div className={s.jpBox}>
            <div className={s.jpHead}>
              <span className={s.jpK}>WEEKLY JACKPOT</span>
              <span className={s.jpPrize}>{fill(t.jp_prize_tpl, { p: money(data.jackpot.prize_usdt) })}</span>
            </div>
            <div className={s.jpTickets}>{fill(t.jp_tickets_tpl, { n: num(data.weeklyTickets ?? 0) })}</div>
            <div className={s.jpDesc}>{t.jp_desc}</div>
          </div>
        ) : null}
        {/* 0-1原則: 新規の画面で主アクションは「最初の馬を迎える」1つだけ。
            ショー導線は残すが、塗りを外して主役を争わせない */}
        <Link href="/races" className={`${s.showCta} ${isNewcomer ? s.showCtaQuiet : ''}`}>{t.watch_show}</Link>
      </section>

      {/* ===== ③ 今日やること ===== */}
      {isNewcomer ? null : hasTasks ? (
        <section className={s.task}>
          <div className={s.taskRow}>
            <span className={s.taskLabel}>{t.tasks_label}</span>
            {untrained.length > 0 ? (
              <span className={s.taskItem}><b>{untrained.length}{c.horses_unit}</b>{t.untrained_suffix}</span>
            ) : null}
            {pendingCount > 0 ? (
              <span className={s.taskItem}><b>{pendingCount}{c.cases_unit}</b>{t.pending_suffix}</span>
            ) : null}
            <Link href="/items" className={s.taskGhost}>{t.tasks_prepare_items}</Link>
            <Link href={untrained.length > 0 ? '/horses' : '/market'} className={s.taskCta}>
              {untrained.length > 0 ? t.tasks_train : t.tasks_adopt} →
            </Link>
          </div>
          <div className={s.taskSub}>{t.tasks_sub}</div>
        </section>
      ) : active.length === 0 ? (
        /* 馬が0頭のユーザー(新規)には「本日のタスクは完了」ではなく迎え入れ導線を出す。
           旧: hasTasks=false に落ちて「完了」と表示され、tasks_adopt へ到達できなかった
           (2026-07-21・UI_FOUNDATION_PLAN 0-3) */
        <section className={s.task}>
          <div className={s.taskRow}>
            <span className={s.taskLabel}>{t.tasks_label}</span>
            <span className={s.taskItem}>{t.stable_empty_none}</span>
            <Link href="/market" className={s.taskCta}>{t.tasks_adopt} →</Link>
          </div>
        </section>
      ) : (
        <section className={`${s.task} ${s.taskDone}`}>
          <div className={s.taskRow}>
            <span className={s.taskLabel}>{t.tasks_label}</span>
            <span className={s.taskDoneText}>{t.tasks_done_text}</span>
            <Link href="/items" className={s.taskGhost}>{t.tasks_prepare_items}</Link>
          </div>
        </section>
      )}

      {/* ===== ④ 資産(総資産 / 残高 / 評価額 / Revenge Buff) ===== */}
      {/* 見出し(2026-07-22 オーナー指摘: 見出しが無くて何の塊か分からない)。
          見出しとカード群を1つの塊にしないと、grid の自動配置で見出しだけが飛ぶ */}
      <div className={s.assetsBlock}>
      <div className={s.secHead}>{t.assets_label}</div>
      <section className={s.assets}>
        {wallet ? (
          <div className={s.totalRow}>
            <TotalAssetsCard available={wallet.available} locked={wallet.locked} stableValue={stableValue} uncollected={horses.reduce((sum, h) => sum + uncollectedGain(h), 0)} t={t} />
          </div>
        ) : null}
        <Link href="/wallet" className={`${s.kpi} ${s.kpiBal}`}>
          <div className="k">{t.balance_k}</div>
          <div className="v">{wallet ? money(wallet.available) : '—'}</div>
          <div className="s">{t.balance_avail}{wallet && Number(wallet.locked) > 0 ? fill(t.balance_locked_tpl, { v: money(wallet.locked) }) : ''}</div>
        </Link>
        <Link href="/horses" className={`${s.kpi} ${s.kpiVal}`}>
          <div className="k">{t.stable_val_k}</div>
          <div className="v">{stableValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="s">{fill(t.stable_val_s_tpl, { n: active.length })}</div>
        </Link>
        {/* Revenge BuffカードはV2で撤去(Decision 109: バフ廃止 — 弔いはBurnドロップへ) */}
      </section>
      </div>

      {/* ===== マイ厩舎(要約ストリップ + 直接購入) ===== */}
      {isNewcomer ? null : (
      <section className={s.stable}>
        <div className={s.tileHead}>
          <span className={s.stableTitle}>{data.stableName ?? t.stable_mine}<small>{fill(t.stable_sub_tpl, { n: active.length, v: stableValue.toFixed(2) })}</small></span>
          <span className={s.stableActions}>
            {/* 購入は/marketの予約ファネルに一本化(Decision 085) — 即時ロックのボタンは廃止 */}
            <Link href="/market" className={s.stableBuy}>{t.stable_adopt}</Link>
            <Link href="/horses" className={s.tileLink}>{t.stable_all}</Link>
          </span>
        </div>
        {active.length > 0 ? (
          <div className={s.strip}>
            {active.slice(0, 8).map((h) => <HorseStrip key={h.id} h={h} t={t} />)}
          </div>
        ) : (
          <div className={s.stableEmpty}>
            {pendingCount > 0
              ? fill(t.stable_empty_pending_tpl, { n: pendingCount })
              : t.stable_empty_none}
          </div>
        )}
        {/* 施策D(育成者クレジット)の導線。ダッシュボードからは辿れていなかった —
            「手放した後も功績が残る」のはこのゲームで唯一の非金銭の報酬 */}
        <Link href="/breeders" className={s.breederLink}>
          {t.breeders_link}<span className={s.breederNote}>{t.breeders_note}</span>
        </Link>
      </section>
      )}

      {/* ===== チャンピオン報酬(進行中の全件) ===== */}
      {activeBuybacks.length > 0 ? (
        <section className={s.buyback}>
          <div className={s.bbHead}>
            <span className={s.bbTitle}>
              {t.bb_title}{activeBuybacks.length > 1 ? fill(t.bb_title_count_tpl, { n: activeBuybacks.length }) : ''}
            </span>
            <Link href="/champion" className={s.tileLink}>CHAMPION →</Link>
          </div>
          {activeBuybacks.map((b) => (
            <div key={b.id}>
              <div className={s.bbHead} style={{ marginTop: 10 }}>
                <span className={s.bbNote} style={{ margin: 0 }}>{t.bb_per}</span>
                <span className={s.bbCount}>{fill(t.bb_count_tpl, { p: Number(b.payments_paid) })}</span>
              </div>
              <div className={s.bar}><span style={{ width: `${(Number(b.payments_paid) / 7) * 100}%` }} /></div>
            </div>
          ))}
          <div className={s.bbNote}>{t.bb_note}</div>
        </section>
      ) : null}

      {/* ===== 主動線の外(Tier 2-2) =====
          設定・特典コード・アプリ化は「毎日やること」ではない。1箇所に集めて
          最下段へ落とし、①結果 → ②今夜 → ③やること → ④資産 → 厩舎 の
          流れを分断しないようにする(旧: 引換コードが③と④の間に挟まっていた)。
          grid-area を持たせるのは、買い戻しタイルが無い夜に自動配置で
          空いた行へ迫り上がってくるのを防ぐため。 */}
      <section className={s.extras}>
        {/* 売買の自動化(Decision 086: トグルはここと/marketの2箇所) */}
        {data.trade ? <TradeAutoTile settings={data.trade} t={APP_COPY[lang].trade} /> : null}
        {/* アプリ化&通知ON の導線(通知一覧はメニューのバッジ+通知ページへ集約) */}
        <PwaSetupTile t={APP_COPY[lang].pwa} />
        {/* 引換コード(Decision 095: セミナー特典馬)— 既定は小さなトグル1個 */}
        <PromoRedeemForm t={APP_COPY[lang].promo} />
      </section>

      {/* ===== 出品方式の必須選択(未選択ユーザーにブロッキング表示) ===== */}
      {/* DASHBOARD_REVISION_SPEC レベル3: 1頭も持たない人に「自動出品方式を選べ」と
          迫るのは無意味かつ有害(出品対象がそもそも無い)。馬を持ってから初めて訊く */}
      {data.trade && active.length > 0 ? <TradeModeModal settings={data.trade} t={APP_COPY[lang].trade} /> : null}
    </div>
  );
}
