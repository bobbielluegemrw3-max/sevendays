import Link from 'next/link';
import {
  PRICE_TABLE_V1,
  SURFACE_JA,
  TRACK_JA,
  WEATHER_JA,
  type Surface,
  type TrackCondition,
  type Weather,
} from '@sevendays/domain';
import { NftHorseArt } from '@/components/NftHorseArt';
import { TrainingForm } from '@/components/TrainingForm';
import { ItemBoostPanel } from '@/components/ItemBoostPanel';
import { RarityLegend } from '@/components/RarityLegend';
import { deriveNftLook } from '@/lib/nft-visual';
import s from '../app/horse-detail.module.css';

/* ============================================================================
 * /horses/[id](馬詳細・調教)全面リデザイン v2 — ダッシュボード/厩舎(Option 1c)と
 * 同じ部品言語。純粋な表示コンポーネント。props は { horse: HorseDetail } のみ。
 *
 * v2 の情報設計:
 *  1) MASTHEAD  : 名前 + レアリティ/タイプ/状態バッジ + 現在価値の大きなスタット。
 *  2) HERO ROW  : ヒーロー馬アート | 今日の調教(=最重要の日課)を「横並び同格」に配置。
 *                 出品中/結末では調教枠が「出品カード / 結末カード」に切り替わる。
 *  3) VALUE LADDER: 7日間の価格表(PRICE_TABLE_V1)を上昇する棒グラフで可視化し、
 *                 「現在地」と「今夜生き残れば/走破すれば」を1本の物語に集約。
 *  4) LOWER ROW : 状態と能力(COND/FATIGUE + ABILITY + レアリティ凡例) | 戦績。
 *  5) PROVENANCE: 検証情報(DNA/シード/世代)。
 *
 * 表示してよい数値は HorseDetail の値と PRICE_TABLE_V1(+ Day7買戻し 200)だけ。
 * 架空の統計は入れない。馬の絵は既存 NftHorseArt(dna_hash 決定論)のみ。調教は
 * 既存 TrainingForm / ItemBoostPanel をそのまま利用(ロジック不変)。データ取得層
 * page.tsx は依頼側で結線。087監査: 手動出品中は「今夜走らない」を明示し調教UIを出さない。
 * ========================================================================== */

export interface HorseRaceResult {
  batch_date: string; final_rank: number; final_score: string; is_burned: boolean;
  participant_count: number;
  weather: string | null; track_condition: string | null; surface: string | null;
}

export interface HorseDetail {
  id: string; name: string; status: string; current_day: number;
  horse_type: string; rarity: string; dna_hash: string; dna_modifier: string;
  ability_json: Record<string, number>;
  condition: string; fatigue: string;
  mint_seed_hash: string; horse_generation_version: string;
  /** 'SMART' | 'MANUAL' | null(087監査)。 */
  listing: string | null;
  /** この馬の全戦績(日付昇順)。 */
  history: HorseRaceResult[];
}

const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

/** 能力の日本語ラベル(生キーのままでは読めない — 087監査 #5)。 */
const ABILITY_JA: Record<string, string> = {
  base_speed: 'スピード',
  base_power: 'パワー',
  base_stamina: 'スタミナ',
  base_guts: '根性',
  base_luck: '運',
};
/** 能力の仕様上の上限(ABILITY_DISTRIBUTION_V1.max)— バーは絶対スケールで描く。 */
const ABILITY_MAX = 100;
/** Day7 走破の買い戻し額(価格表の外側・チャンピオン報酬)。 */
const CHAMPION_VALUE = '200';

function pct(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(6, Math.min(100, n)) : 60;
}
/** NUMERIC(20,8)のテキスト("82.00000000")を人間向けの整数表示に。 */
function stat(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? String(Math.round(n)) : raw;
}
function score2(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2) : raw;
}
function horseValue(currentDay: number): string {
  return PRICE_TABLE_V1[Math.max(0, Math.min(6, currentDay))] ?? PRICE_TABLE_V1[0]!;
}
function rarClass(rarity: string): string {
  return s[`rar${RARITIES.includes(rarity) ? rarity : 'COMMON'}`]!;
}
function short(hash: string, head = 6, tail = 4): string {
  if (!hash || hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
function conditionsText(r: HorseRaceResult): string {
  if (!r.weather || !r.track_condition || !r.surface) return '—';
  return `${WEATHER_JA[r.weather as Weather] ?? r.weather} · ${TRACK_JA[r.track_condition as TrackCondition] ?? r.track_condition} · ${SURFACE_JA[r.surface as Surface] ?? r.surface}`;
}

/* ---- 状態モデル ----------------------------------------------------------- */
type Mode = 'ACTIVE' | 'LISTED' | 'BURNED' | 'DAY7_CLEARED' | 'MEMORIALIZED';

/** 087監査: 手動出品中の ACTIVE は Market Lock(今夜走らない)として扱う。 */
function modeOf(horse: HorseDetail): Mode {
  if (horse.status === 'ACTIVE') return horse.listing === 'MANUAL' ? 'LISTED' : 'ACTIVE';
  if (horse.status === 'DAY7_CLEARED' || horse.status === 'MEMORIALIZED' || horse.status === 'BURNED') {
    return horse.status;
  }
  return 'ACTIVE';
}

interface StatusBadgeInfo { cls: string; label: string; }
function statusBadge(mode: Mode): StatusBadgeInfo {
  switch (mode) {
    case 'LISTED': return { cls: s.stListed!, label: '出品中' };
    case 'BURNED': return { cls: s.stBurned!, label: 'BURNED · 消滅' };
    case 'DAY7_CLEARED': return { cls: s.stCleared!, label: 'チャンピオン' };
    case 'MEMORIALIZED': return { cls: s.stMemorial!, label: '記念馬 · NFT' };
    case 'ACTIVE':
    default: return { cls: s.stActive!, label: '出走中' };
  }
}

interface MastValue { k: string; v: string; unit: string; muted: boolean; }
function mastValue(horse: HorseDetail, mode: Mode): MastValue {
  const d = horse.current_day;
  switch (mode) {
    case 'LISTED': return { k: '出品価格 · LISTED', v: horseValue(d), unit: 'USDT', muted: false };
    case 'BURNED': return { k: '結末 · OUTCOME', v: '消滅', unit: '', muted: true };
    case 'DAY7_CLEARED': return { k: '報酬 · REWARD', v: CHAMPION_VALUE, unit: 'USDT', muted: false };
    case 'MEMORIALIZED': return { k: '結末 · OUTCOME', v: '記念NFT', unit: '', muted: false };
    case 'ACTIVE':
    default: return { k: '現在価値 · CURRENT VALUE', v: horseValue(d), unit: 'USDT', muted: false };
  }
}

function dayNote(horse: HorseDetail, mode: Mode): string {
  const d = horse.current_day;
  switch (mode) {
    case 'ACTIVE':
      if (d >= 6) return `Day ${d} を走行中。今夜のレースを走破すれば7日完走 — チャンピオン報酬 200 USDT ＋記念NFT。`;
      return `Day ${d} を走行中。今夜のレースを生き延びれば Day ${Math.min(7, d + 1)} へ、価値も上昇します。${horse.listing === 'SMART' ? ' スマート出品中 — 今夜売れた場合はレース後に新オーナーへ引き渡されます。' : ''}`;
    case 'LISTED': return `マーケットに出品中 — 今夜は出走しません(Day ${d}・価値は凍結)。取り下げは翌バッチから反映されます。`;
    case 'BURNED': return `Day ${d} のレースで成績下位に入り Burn(消滅)しました。`;
    case 'DAY7_CLEARED': return '7日間を走り切ったチャンピオン。報酬 200 USDT を受け取り中です。';
    case 'MEMORIALIZED': return '7日間を走り切った記念馬。厩舎に永久保存されます。';
  }
}

/* ---- 7日レール ------------------------------------------------------------ */
function DayRail({ horse, mode }: { horse: HorseDetail; mode: Mode }) {
  const day = horse.current_day;
  const reached = mode === 'DAY7_CLEARED' || mode === 'MEMORIALIZED' ? 7 : day;
  return (
    <div className={s.rail}>
      {Array.from({ length: 7 }, (_, i) => {
        const dd = i + 1;
        let cls = s.pip!;
        if (mode === 'BURNED') {
          if (dd < day + 1) cls = s.pipDone!;
          if (dd === day + 1) cls = s.pipBurn!;
        } else {
          if (dd < reached + 1) cls = s.pipDone!;
          if (dd === reached + 1 && mode === 'ACTIVE') cls = s.pipToday!;
        }
        return <span key={dd} className={cls} />;
      })}
    </div>
  );
}

/* ---- バリューラダー(価値の階段) ------------------------------------------- */
function ValueLadder({ horse, mode }: { horse: HorseDetail; mode: Mode }) {
  const day = horse.current_day;

  let headline: JSX.Element;
  if (mode === 'ACTIVE') {
    headline = day >= 6 ? (
      <>
        <span className={s.ladNow}>現在 <b>{PRICE_TABLE_V1[6]}</b> USDT</span>
        <span className={s.ladArrow}>→</span>
        <span className={`${s.ladNext} ${s.ladNextChamp}`}><span className={s.ladNextK}>今夜走破すれば</span> <b>{CHAMPION_VALUE}</b> USDT ＋記念NFT</span>
      </>
    ) : (
      <>
        <span className={s.ladNow}>現在 <b>{horseValue(day)}</b> USDT</span>
        <span className={s.ladArrow}>→</span>
        <span className={s.ladNext}><span className={s.ladNextK}>今夜生き残れば</span> <b>{PRICE_TABLE_V1[day + 1]}</b> USDT</span>
      </>
    );
  } else if (mode === 'LISTED') {
    headline = (
      <>
        <span className={s.ladNow}>出品価格 <b>{horseValue(day)}</b> USDT</span>
        <span className={s.ladNext}><span className={`${s.ladNextK} ${s.ladNextKWarn}`}>今夜は出走しません(価値は凍結)</span></span>
      </>
    );
  } else if (mode === 'BURNED') {
    headline = (
      <>
        <span className={`${s.ladNow} ${s.ladNowBurn}`}>Day {day} で消滅</span>
        <span className={s.ladNext}><span className={`${s.ladNextK} ${s.ladNextKFaint}`}>この先の価値には進めませんでした</span></span>
      </>
    );
  } else if (mode === 'DAY7_CLEARED') {
    headline = <span className={s.ladNow}>7日走破 · チャンピオン報酬 <b>{CHAMPION_VALUE}</b> USDT 受取中</span>;
  } else {
    headline = <span className={s.ladNow}>7日完走 · 記念NFT · 報酬 {CHAMPION_VALUE} USDT 受取済</span>;
  }

  const cols: JSX.Element[] = [];
  for (let i = 0; i < 7; i++) {
    let cls = s.barFuture!;
    let pin: JSX.Element | null = null;
    if (mode === 'ACTIVE' || mode === 'LISTED') {
      if (i < day) cls = s.barPast!;
      else if (i === day) { cls = s.barNow!; pin = <span className={`${s.ladPin} ${s.pinNow}`}>現在</span>; }
      else if (i === day + 1 && mode === 'ACTIVE') { cls = s.barNext!; pin = <span className={`${s.ladPin} ${s.pinNext}`}>今夜</span>; }
    } else if (mode === 'BURNED') {
      if (i < day) cls = s.barPast!;
      else if (i === day) { cls = s.barBurn!; pin = <span className={`${s.ladPin} ${s.pinBurn}`}>消滅</span>; }
    } else {
      cls = s.barPast!;
    }
    const price = PRICE_TABLE_V1[i] ?? '0';
    const h = Math.max(24, Math.round((Number(price) / 200) * 100));
    cols.push(
      <div key={i} className={s.ladCol}>
        <div className={s.ladPrice}>{price}</div>
        <div className={`${s.ladBar} ${cls}`} style={{ height: `${h}%` }}>{pin}</div>
        <div className={s.ladDay}>Day{i}</div>
      </div>,
    );
  }
  // Day7 チャンピオン列
  let ccls = s.barChampFuture!;
  let cpin: JSX.Element | null = null;
  if (mode === 'DAY7_CLEARED' || mode === 'MEMORIALIZED') { ccls = s.barChamp!; cpin = <span className={`${s.ladPin} ${s.pinChamp}`}>走破</span>; }
  else if (mode === 'ACTIVE' && day >= 6) { ccls = s.barChamp!; cpin = <span className={`${s.ladPin} ${s.pinChamp}`}>今夜</span>; }
  cols.push(
    <div key="champ" className={s.ladCol}>
      <div className={`${s.ladPrice} ${s.ladPriceGold}`}>{CHAMPION_VALUE}</div>
      <div className={`${s.ladBar} ${ccls}`} style={{ height: '100%' }}>{cpin}</div>
      <div className={`${s.ladDay} ${s.ladDayChamp}`}>走破</div>
    </div>,
  );

  return (
    <div>
      <div className={s.secLabel}>価値の階段 · VALUE LADDER</div>
      <div className={s.ladWrap}>
        <div className={s.ladHead}>{headline}</div>
        <div className={s.ladBars}>{cols}</div>
        <div className={s.ladNote}>
          価値は7日間の価格表(PRICE TABLE)で決まる公開値。毎晩のレースを生き残るほど上がり、7日走り切ると 200 USDT で買い戻されチャンピオンNFTになります。
        </div>
      </div>
    </div>
  );
}

/* ---- メイン --------------------------------------------------------------- */
export function HorseDetailView({ horse }: { horse: HorseDetail }) {
  const look = deriveNftLook(horse.dna_hash, horse.name);
  const mode = modeOf(horse);
  const badge = statusBadge(mode);
  const mv = mastValue(horse, mode);
  const abilities = Object.entries(horse.ability_json ?? {});
  const history = horse.history ?? [];
  const isActive = mode === 'ACTIVE';

  return (
    <div className={s.wrap}>
      <Link href="/horses" className={s.crumb}>← マイ厩舎</Link>

      {/* MASTHEAD */}
      <div className={s.mast}>
        <div className={s.mastL}>
          <div className={s.titleRow}>
            <span className={s.title}>{horse.name}</span>
            <span className={`${s.badge} ${rarClass(horse.rarity)}`}>{horse.rarity}</span>
            <span className={`${s.badge} ${s.typeBadge}`}>{horse.horse_type}</span>
            <span className={`${s.badge} ${badge.cls}`}>{badge.label}</span>
            {horse.listing === 'SMART' ? <span className={`${s.badge} ${s.stSmart}`}>出品中 · スマート</span> : null}
          </div>
        </div>
        <div className={s.mastR}>
          <div className={s.mastValK}>{mv.k}</div>
          <div className={`${s.mastVal} ${mv.muted ? s.mastValMuted : ''}`}>
            {mv.v}{mv.unit ? <small>{mv.unit}</small> : null}
          </div>
        </div>
      </div>

      {/* HERO ROW: 馬アート | 今日の調教(=最重要の日課) */}
      <div className={s.heroRow}>
        <div className={`${s.hero} ${mode === 'BURNED' ? s.heroBurned : ''}`}>
          <div className={s.heroInner}>
            <div className={s.artBox}>
              <NftHorseArt look={look} className={s.heroCanvas} />
              <div className={s.scrim} />
              <div className={s.artCap}>
                <div>
                  <div className={s.artCapK}>{horse.name.toUpperCase()}</div>
                  <div className={s.artCapSub}>{horse.horse_type} · {horse.rarity}</div>
                </div>
                <div className={s.dayBig}>
                  <div className="l">DAY</div>
                  <div className="v">{Math.min(7, horse.current_day)}<small>/7</small></div>
                </div>
              </div>
            </div>
            <div className={s.heroFoot}>
              <DayRail horse={horse} mode={mode} />
              <div className={s.dayNote}>{dayNote(horse, mode)}</div>
            </div>
          </div>
        </div>

        <div className={s.action}>
          {isActive ? (
            <div className={s.trainCard}>
              <div className={s.trainTop}>
                <span className={s.trainTitle}>今日の調教</span>
                <span className={s.freeTag}>無料 · 1日1回</span>
              </div>
              <div className={s.trainDesc}>
                今夜のスコアに直接加点(馬タイプとの相性で+3〜5)。攻めれば疲労が溜まり、回復調教で癒せます —
                疲労はスコアとコンディションを蝕むので、7日間の采配が価値を伸ばす鍵です。
              </div>
              <div className={s.trainForm}>
                <TrainingForm horseId={horse.id} horseType={horse.horse_type} fatigue={Number(horse.fatigue)} />
                <ItemBoostPanel horseId={horse.id} currentDay={horse.current_day} />
              </div>
              <div className={s.trainNote}>今夜20:00のスナップショット確定までに実施すると、今夜のレースに反映されます。</div>
            </div>
          ) : mode === 'LISTED' ? (
            <div className={`${s.outcome} ${s.outListed}`}>
              <div className={s.outHead}>出品中 — 今夜は走りません</div>
              <div className={s.outText}>
                マーケットに出品中のため、今夜のレースには出走しません(Day {horse.current_day}・価値は凍結)。
                出品中は調教とアイテムは使えません。売れると価格の98%(手数料2%)を受け取り、通知とメールでお知らせします。
              </div>
              <Link href="/market" className={s.outCta}>出品を管理 →</Link>
            </div>
          ) : mode === 'BURNED' ? (
            <div className={`${s.outcome} ${s.outBurned}`}>
              <div className={s.outHead}>BURNED — 消滅</div>
              <div className={s.outText}>
                Day {horse.current_day} のレースで成績下位に入り、Burn(消滅)しました。
                Burn＝毎晩の下位の馬が消える仕組みで、生き残った馬の価値を支えます。この馬は厩舎の記録としてのみ残ります。
              </div>
            </div>
          ) : mode === 'DAY7_CLEARED' ? (
            <div className={`${s.outcome} ${s.outGold}`}>
              <div className={s.outHead}>チャンピオン — 7日走破</div>
              <div className={s.outText}>
                7日間を走り切ったチャンピオンです。チャンピオン報酬 200 USDT(7日分割)を受け取り中。
                走破後は記念NFTとして厩舎に残ります。
              </div>
            </div>
          ) : (
            <div className={`${s.outcome} ${s.outGold}`}>
              <div className={s.outHead}>記念馬 — NFT</div>
              <div className={s.outText}>
                7日間を走り切った証。記念NFTとして厩舎に永久保存されます。
                チャンピオン報酬 200 USDT の受け取りは完了しています。
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VALUE LADDER */}
      <ValueLadder horse={horse} mode={mode} />

      {/* LOWER ROW: 状態と能力 | 戦績 */}
      <div className={s.lowRow}>
        <div>
          <div className={s.secLabel}>状態と能力 · VITALS & ABILITY</div>
          <div className={s.vitals}>
            <div className={`${s.mini} ${s.miniCond}`}>
              <div className={s.miniK}>CONDITION コンディション</div>
              <div className={s.miniRow}>
                <span className={s.miniNum}>{stat(horse.condition)}</span>
                <span className={s.track}><span className={s.fillCyan} style={{ width: `${pct(horse.condition)}%` }} /></span>
              </div>
            </div>
            <div className={`${s.mini} ${s.miniFtg}`}>
              <div className={s.miniK}>FATIGUE 疲労</div>
              <div className={s.miniRow}>
                <span className={s.miniNum}>{stat(horse.fatigue)}</span>
                <span className={s.track}><span className={s.fillMag} style={{ width: `${pct(horse.fatigue)}%` }} /></span>
              </div>
            </div>
          </div>
          <div className={s.abilityBox}>
            {abilities.map(([key, val]) => (
              <div key={key} className={s.abRow}>
                <span className={s.abLabel}>{ABILITY_JA[key] ?? key}</span>
                <span className={s.track}>
                  <span className={s.fillCyan} style={{ width: `${Math.max(3, Math.min(100, (Number(val) / ABILITY_MAX) * 100))}%` }} />
                </span>
                <span className={s.abVal}>{val}</span>
              </div>
            ))}
          </div>
          <div className={s.legendWrap}><RarityLegend /></div>
        </div>

        {history.length > 0 ? (
          <div>
            <div className={s.secLabel}>戦績 · RACE HISTORY</div>
            <div className={s.histBox}>
              {history.map((r, i) => (
                <div key={r.batch_date} className={`${s.histRow} ${r.is_burned ? s.histBurned : ''}`}>
                  <span className={s.histDay}>第{i + 1}戦</span>
                  <span className={s.histDate}>{r.batch_date.slice(5).replace('-', '/')}</span>
                  <span className={s.histRank}>
                    <b>{r.final_rank.toLocaleString('en-US')}</b>
                    <small> / {r.participant_count.toLocaleString('en-US')}頭</small>
                  </span>
                  <span className={s.histScore}>SCORE {score2(r.final_score)}</span>
                  <span className={s.histCond}>{conditionsText(r)}</span>
                  <span className={s.histRes}>
                    {r.is_burned ? <span className={s.burnTag}>BURN</span> : <span className={s.survTag}>生存</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className={s.histNote}>全結果はコミット済みシードから決定論計算 — 台帳(LEDGER)とレース詳細で誰でも検証できます。</div>
          </div>
        ) : (
          <div>
            <div className={s.secLabel}>戦績 · RACE HISTORY</div>
            <div className={s.histEmpty}>まだレースを走っていません。最初のレースは今夜20:00です。</div>
          </div>
        )}
      </div>

      {/* PROVENANCE */}
      <div>
        <div className={`${s.secLabel} ${s.secLabelDim}`}>検証情報 · PROVENANCE</div>
        <div className={s.prov}>
          <div className={s.provRow}>
            <span className={s.provK}>DNA HASH</span>
            <span className={s.provV}>{short(horse.dna_hash)} (mod {horse.dna_modifier})</span>
          </div>
          <div className={s.provRow}>
            <span className={s.provK}>MINT SEED</span>
            <span className={s.provV}>{short(horse.mint_seed_hash)}</span>
          </div>
          <div className={s.provRow}>
            <span className={s.provK}>GEN VERSION</span>
            <span className={s.provV}>{horse.horse_generation_version}</span>
          </div>
          <div className={s.provNote}>見た目と能力は dna_hash から決定論生成。誰でも同じ入力から同じ結果を再計算・検証できます。</div>
        </div>
      </div>
    </div>
  );
}
