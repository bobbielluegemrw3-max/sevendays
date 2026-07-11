import Link from 'next/link';
import { PRICE_TABLE_V1 } from '@sevendays/domain';
import { Countdown } from '@/components/Countdown';
import { NftHorseArt } from '@/components/NftHorseArt';
import { PwaSetupTile } from '@/components/PwaSetupTile';
import { deriveNftLook } from '@/lib/nft-visual';
import s from '../app/dashboard.module.css';

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
}
export interface DashWallet { available: string; locked: string }
export interface DashBuff { buff_rarity: string; buff_bonus_score: string; status: string }
export interface DashRace { id: string; status: string; participant_count: number | null; batch_date: string }
export interface DashResult { horse_id: string; final_score: string; final_rank: number; is_burned: boolean; horse: DashHorse }
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
}

/* ---- helpers -------------------------------------------------------------- */
const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

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
function rarClass(rarity: string): string {
  return s[`rar${RARITIES.includes(rarity) ? rarity : 'COMMON'}`]!;
}

/** dna_hash から決定論生成された HorseArt を厩舎用に描画。 */
function StableArt({ horse }: { horse: DashHorse }) {
  const look = deriveNftLook(horse.dna_hash, horse.name);
  return <NftHorseArt look={look} className={s.hartCanvas} />;
}

/** 厩舎ストリップの1頭 — 要約行のみ(詳細はSTABLEページの仕事)。 */
function HorseStrip({ h }: { h: DashHorse }) {
  const trained = h.trained_for_next_race;
  return (
    <Link href={`/horses/${h.id}`} className={s.srow}>
      <div className={s.sart}>
        <StableArt horse={h} />
      </div>
      <span className={s.sname}>{h.name}</span>
      <span className={`${s.rar} ${rarClass(h.rarity)}`}>{h.rarity}</span>
      <span className={s.sday}>Day {Math.min(7, h.current_day)}/7</span>
      <span className={`${s.trainBadge} ${trained ? s.trainYes : s.trainNo}`}>{trained ? '調教済' : '未調教'}</span>
    </Link>
  );
}

/* ---- main ----------------------------------------------------------------- */
export function DashboardView({ data }: { data: DashboardData }) {
  const { wallet, horses, buff, pendingCount, lastRace, myResults, buybacks } = data;

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

  return (
    <div className={s.app}>
      {/* ===== ① 昨夜の結果 ===== */}
      <section className={s.result}>
        <div className={s.tileHead}>
          <span className={s.tileLabel}>昨夜の結果</span>
          {lastRace ? <Link href={`/races/${lastRace.id}`} className={s.tileLink}>レース詳細 →</Link> : null}
        </div>
        {myResults.length > 0 ? (
          <>
            <div className={s.resSummary}>
              <div className={`${s.resStat} ${s.survived}`}><div className="n">{survived.length}</div><div className="k">生存</div></div>
              <div className={`${s.resStat} ${s.burned}`}><div className="n">{burned.length}</div><div className="k">Burn(消滅)</div></div>
              <div className={s.resBest}>
                <div className="n">#{bestRank === Infinity ? '—' : num(bestRank)}</div>
                <div className="k">最高順位 / 全{num(participants)}頭</div>
              </div>
            </div>
            <div className={s.resList}>
              {myResults.map((r) => (
                <Link key={r.horse_id} href={`/horses/${r.horse_id}`} className={s.resRow}>
                  <span className={s.resRank}>#{num(r.final_rank)}</span>
                  <span className={s.resName}>{r.horse.name}</span>
                  {r.is_burned ? (
                    <span className={`${s.pill} ${s.pillBurned}`}>Burn</span>
                  ) : (
                    <span className={`${s.pill} ${s.pillSurvived}`}>生存 · Day {Math.min(7, r.horse.current_day)}</span>
                  )}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className={s.empty}>
            まだレース結果はありません。今夜20:00、最初のレースであなたの馬が誕生します。
          </div>
        )}
      </section>

      {/* ===== ② 今夜のレースまで ===== */}
      <section className={s.count}>
        <div className={s.tileHead}>
          <span className={s.tileLabel}>今夜のレース</span>
          <span className={s.live}><span className={s.dot}>●</span> LIVE 20:00 MYT</span>
        </div>
        <Countdown className={s.timer} />
        <div className={s.countMeta}>
          <span>発走まで</span>
          <span>RUNNERS <b>{active.length}</b></span>
        </div>
        <div className={s.countNote}>成績下位の馬はBurn=消滅。生き残った馬は日ごとに価値が上がります。全記録は台帳で公開。</div>
        <Link href="/races" className={s.showCta}>今夜のショーを見る →</Link>
      </section>

      {/* ===== ③ 今日やること ===== */}
      {hasTasks ? (
        <section className={s.task}>
          <div className={s.taskRow}>
            <span className={s.taskLabel}>今日やること</span>
            {untrained.length > 0 ? (
              <span className={s.taskItem}><b>{untrained.length}頭</b> が未調教</span>
            ) : null}
            {pendingCount > 0 ? (
              <span className={s.taskItem}><b>{pendingCount}件</b> が割当待ち</span>
            ) : null}
            <Link href="/items" className={s.taskGhost}>アイテムを備える →</Link>
            <Link href={untrained.length > 0 ? '/horses' : '/market'} className={s.taskCta}>
              {untrained.length > 0 ? '調教する' : '馬を迎える'} →
            </Link>
          </div>
          <div className={s.taskSub}>調教は1日1回・今夜のスナップショット確定まで。割当待ちは今夜のレースで馬が確定します。</div>
        </section>
      ) : (
        <section className={`${s.task} ${s.taskDone}`}>
          <div className={s.taskRow}>
            <span className={s.taskLabel}>今日やること</span>
            <span className={s.taskDoneText}>本日のタスクは完了。あとは20:00の発走を待つだけ。</span>
            <Link href="/items" className={s.taskGhost}>アイテムを備える →</Link>
          </div>
        </section>
      )}

      {/* ===== ④ 資産(残高 / 評価額 / Revenge Buff) ===== */}
      <section className={s.assets}>
        <Link href="/wallet" className={`${s.kpi} ${s.kpiBal}`}>
          <div className="k">残高 BALANCE</div>
          <div className="v">{wallet ? money(wallet.available) : '—'}</div>
          <div className="s">USDT 利用可能{wallet && Number(wallet.locked) > 0 ? ` · ロック中 ${money(wallet.locked)}` : ''}</div>
        </Link>
        <Link href="/horses" className={`${s.kpi} ${s.kpiVal}`}>
          <div className="k">厩舎の評価額</div>
          <div className="v">{stableValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="s">USDT · {active.length}頭の現在価値</div>
        </Link>
        <div className={`${s.kpi} ${s.kpiBuff}`}>
          <div className="k">REVENGE BUFF</div>
          <div className="v">{buff ? `${buff.buff_rarity} +${buff.buff_bonus_score}` : 'なし'}</div>
          <div className="s">{buff ? '次回割当に自動で加点' : 'Burnで獲得する次走ボーナス'}</div>
        </div>
      </section>

      {/* ===== マイ厩舎(要約ストリップ + 直接購入) ===== */}
      <section className={s.stable}>
        <div className={s.tileHead}>
          <span className={s.stableTitle}>マイ厩舎<small>STABLE {active.length} · 評価額 {stableValue.toFixed(2)} USDT</small></span>
          <span className={s.stableActions}>
            {/* 購入は/marketの予約ファネルに一本化(Decision 085) — 即時ロックのボタンは廃止 */}
            <Link href="/market" className={s.stableBuy}>馬を迎える ▶</Link>
            <Link href="/horses" className={s.tileLink}>すべて →</Link>
          </span>
        </div>
        {active.length > 0 ? (
          <div className={s.strip}>
            {active.slice(0, 8).map((h) => <HorseStrip key={h.id} h={h} />)}
          </div>
        ) : (
          <div className={s.stableEmpty}>
            {pendingCount > 0
              ? `割当待ち ${pendingCount} 件 — 今夜のレースで確定します。`
              : '出走中の馬はいません。上の「馬を迎える ▶」から今夜のダービーに参加しましょう。'}
          </div>
        )}
      </section>

      {/* ===== チャンピオン報酬(進行中の全件) ===== */}
      {activeBuybacks.length > 0 ? (
        <section className={s.buyback}>
          <div className={s.bbHead}>
            <span className={s.bbTitle}>
              チャンピオン報酬 受取中{activeBuybacks.length > 1 ? ` · ${activeBuybacks.length}頭` : ''}
            </span>
            <Link href="/champion" className={s.tileLink}>CHAMPION →</Link>
          </div>
          {activeBuybacks.map((b) => (
            <div key={b.id}>
              <div className={s.bbHead} style={{ marginTop: 10 }}>
                <span className={s.bbNote} style={{ margin: 0 }}>200 USDT を7回に分けて受取</span>
                <span className={s.bbCount}>{Number(b.payments_paid)} / 7 回</span>
              </div>
              <div className={s.bar}><span style={{ width: `${(Number(b.payments_paid) / 7) * 100}%` }} /></div>
            </div>
          ))}
          <div className={s.bbNote}>毎晩20:00の精算で1回ずつ支払い</div>
        </section>
      ) : null}

      {/* ===== アプリ化&通知ON の導線(通知一覧はメニューのバッジ+通知ページへ集約) ===== */}
      <PwaSetupTile />
    </div>
  );
}
