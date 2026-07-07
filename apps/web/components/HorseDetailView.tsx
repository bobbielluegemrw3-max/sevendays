import Link from 'next/link';
import { PRICE_TABLE_V1 } from '@sevendays/domain';
import { NftHorseArt } from '@/components/NftHorseArt';
import { TrainingForm } from '@/components/TrainingForm';
import { ItemBoostPanel } from '@/components/ItemBoostPanel';
import { deriveNftLook } from '@/lib/nft-visual';
import s from '../app/horse-detail.module.css';

/* ============================================================================
 * /horses/[id](馬詳細・調教)再設計 — ダッシュボード/厩舎 Option 1c と同じ部品言語。
 *
 * 純粋な表示コンポーネント。props は { horse: HorseDetail } のみ。表示してよい数値は
 * HorseDetail の値と PRICE_TABLE_V1 だけ(架空の統計は入れない)。馬の絵は既存
 * HorseArt(dna_hash 決定論)のみ。調教は既存 TrainingForm(client)をそのまま利用。
 * データ取得層 page.tsx は依頼側で結線。
 * ========================================================================== */

export interface HorseDetail {
  id: string; name: string; status: string; current_day: number;
  horse_type: string; rarity: string; dna_hash: string; dna_modifier: string;
  ability_json: Record<string, number>;
  condition: string; fatigue: string;
  mint_seed_hash: string; horse_generation_version: string;
}

const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

function pct(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(6, Math.min(100, n)) : 60;
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

interface StatusMeta {
  badge: string; label: string; isActive: boolean; burned: boolean;
  heroValLabel: string; heroVal: string; heroValUnit: string; heroValMuted: boolean;
  sideLabel: string; sideNote: string; dayNote: string;
  retiredClass?: string; retiredNote?: string;
}
function statusMeta(horse: HorseDetail): StatusMeta {
  const d = horse.current_day;
  switch (horse.status) {
    case 'DAY7_CLEARED':
      return {
        badge: s.stCleared!, label: 'チャンピオン', isActive: false, burned: false,
        heroValLabel: '7日走破', heroVal: 'チャンピオン', heroValUnit: '', heroValMuted: false,
        sideLabel: '結末 · OUTCOME', sideNote: '7日走破 · チャンピオン報酬 200 USDT 受取中',
        dayNote: '7日間を走り切ったチャンピオンです。チャンピオン報酬 200 USDT(7日分割)を受け取り中です。',
        retiredClass: s.retiredGold!, retiredNote: '7日走破のチャンピオン。報酬 200 USDT を受け取り中です。',
      };
    case 'MEMORIALIZED':
      return {
        badge: s.stMemorial!, label: '記念馬 · NFT', isActive: false, burned: false,
        heroValLabel: '7日完走', heroVal: '記念NFT', heroValUnit: '', heroValMuted: false,
        sideLabel: '結末 · OUTCOME', sideNote: '7日完走 · 記念NFT',
        dayNote: '7日間を走り切った証。記念NFTとして厩舎に残ります。',
        retiredClass: s.retiredGold!, retiredNote: '7日間を走り切った記念馬。チャンピオン報酬 200 USDT の受け取りは完了しています。',
      };
    case 'BURNED':
      return {
        badge: s.stBurned!, label: 'BURNED · 消滅', isActive: false, burned: true,
        heroValLabel: '結末', heroVal: '消滅', heroValUnit: '', heroValMuted: true,
        sideLabel: '結末 · OUTCOME', sideNote: `Day ${d} のレースで下位10.7%に入りBurn`,
        dayNote: 'このレースで下位10.7%に入り、Burn(消滅)しました。',
        retiredClass: s.retiredBurned!, retiredNote: 'この馬は消滅しました。厩舎の記録としてのみ残ります。',
      };
    case 'ACTIVE':
    default:
      return {
        badge: s.stActive!, label: '出走中', isActive: true, burned: false,
        heroValLabel: '現在価値', heroVal: horseValue(d), heroValUnit: 'USDT', heroValMuted: false,
        sideLabel: '現在価値 · VALUE', sideNote: '生き残るほど日々上昇 · Day7でチャンピオン報酬 200 USDT',
        dayNote: `Day ${d} を走行中。今夜のレースを生き延びれば Day ${Math.min(7, d + 1)} へ、価値も上昇します。`,
      };
  }
}

function DayRail({ day }: { day: number }) {
  return (
    <div className={s.rail}>
      {Array.from({ length: 7 }, (_, i) => {
        const dd = i + 1;
        const cls = dd < day + 1 ? s.pipDone : dd === day + 1 ? s.pipToday : s.pip;
        return <span key={dd} className={cls} />;
      })}
    </div>
  );
}

export function HorseDetailView({ horse }: { horse: HorseDetail }) {
  const look = deriveNftLook(horse.dna_hash, horse.name);
  const m = statusMeta(horse);
  const abilities = Object.entries(horse.ability_json ?? {});
  const abMax = Math.max(1, ...abilities.map(([, val]) => Number(val) || 0));

  return (
    <div className={s.wrap}>
      {/* パンくず + タイトル */}
      <div>
        <Link href="/horses" className={s.crumb}>← マイ厩舎</Link>
        <div className={s.titleRow}>
          <span className={s.title}>{horse.name}</span>
          <span className={`${s.badge} ${rarClass(horse.rarity)}`}>{horse.rarity}</span>
          <span className={`${s.badge} ${s.typeBadge}`}>{horse.horse_type}</span>
          <span className={`${s.badge} ${m.badge}`}>{m.label}</span>
        </div>
      </div>

      {/* ヒーロー + サイド */}
      <div className={s.top}>
        <div className={`${s.hero} ${m.burned ? s.heroBurned : ''}`}>
          <div className={s.heroInner}>
            <div className={s.heroArtBox}>
              <NftHorseArt look={look} className={s.heroCanvas} />
              <div className={s.scrim} />
              <div className={s.heroCaption}>
                <div>
                  <div className={s.heroValLabel}>{m.heroValLabel}</div>
                  <div className={`${s.heroVal} ${m.heroValMuted ? s.heroValMuted : ''}`}>
                    {m.heroVal}{m.heroValUnit ? <small>{m.heroValUnit}</small> : null}
                  </div>
                </div>
                <div className={s.heroDay}>
                  <div className="l">DAY</div>
                  <div className="v">{Math.min(7, horse.current_day)}<small>/7</small></div>
                </div>
              </div>
            </div>
            <div className={s.heroFoot}>
              <DayRail day={horse.current_day} />
              <div className={s.dayNote}>{m.dayNote}</div>
            </div>
          </div>
        </div>

        <div className={s.side}>
          <div className={`${s.mini} ${s.miniCond}`}>
            <div className={s.miniK}>CONDITION コンディション</div>
            <div className={s.miniRow}>
              <span className={s.miniNum}>{horse.condition}</span>
              <span className={s.track}><span className={s.fillCyan} style={{ width: `${pct(horse.condition)}%` }} /></span>
            </div>
          </div>
          <div className={`${s.mini} ${s.miniFtg}`}>
            <div className={s.miniK}>FATIGUE 疲労</div>
            <div className={s.miniRow}>
              <span className={s.miniNum}>{horse.fatigue}</span>
              <span className={s.track}><span className={s.fillMag} style={{ width: `${pct(horse.fatigue)}%` }} /></span>
            </div>
          </div>
          <div className={`${s.mini} ${s.miniVal}`}>
            <div className={s.miniK}>{m.sideLabel}</div>
            <div className={s.miniValNum}>{m.heroVal}{m.heroValUnit ? <small>{m.heroValUnit}</small> : null}</div>
            <div className={s.miniNote}>{m.sideNote}</div>
          </div>
        </div>
      </div>

      {/* 能力 */}
      <div>
        <div className={s.secLabel}>能力 · ABILITY</div>
        <div className={s.abilityBox}>
          {abilities.map(([key, val]) => (
            <div key={key} className={s.abRow}>
              <span className={s.abLabel}>{key}</span>
              <span className={s.track}><span className={s.fillCyan} style={{ width: `${(Number(val) / abMax) * 100}%` }} /></span>
              <span className={s.abVal}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 今日の調教(ACTIVE のみ)/ それ以外は結末カード */}
      {m.isActive ? (
        <div className={`${s.train} ${s.trainActive}`}>
          <div className={s.trainHead}>
            <div>
              <div className={s.trainTitle}>今日の調教</div>
              <div className={s.trainDesc}>コンディションを整え、今夜のレースに備えましょう。疲労とのバランスが鍵です。</div>
            </div>
          </div>
          <div className={s.trainForm}>
            <TrainingForm horseId={horse.id} />
            <ItemBoostPanel horseId={horse.id} currentDay={horse.current_day} />
          </div>
          <div className={s.trainNote}>調教は1日1回。今夜20:00のスナップショット確定までに実施すると、今夜のレースに反映されます。</div>
        </div>
      ) : (
        <div className={`${s.retired} ${m.retiredClass ?? ''}`}>
          <span className={`${s.badge} ${m.badge}`}>{m.label}</span>
          <span className={s.retiredText}>{m.retiredNote}</span>
        </div>
      )}

      {/* 検証情報 */}
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
