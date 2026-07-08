import { BuybacksView, type Buyback } from '@/components/BuybacksView';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import { ChampionHero } from '@/components/champion/ChampionHero';
import { SAMPLE_CHAMPIONS } from '@/lib/champion-fixtures';
import s from '../../app/champion.module.css';

/**
 * /champion — チャンピオンの栄誉を1ページに集約(ADR-011 / Decision 080)。
 * ①ヒーロー(ループアニメ+LEAGUE COMING SOON) ②あなたのチャンピオン報酬
 * ③殿堂(Hall of Champions) ④リーグ予告。
 * R3: betting/odds/gambling系の語は使わない。
 */

export interface HallChampion {
  horse_id: string;
  name: string;
  dna_hash: string;
  horse_type: string;
  rarity: string;
  owner: string;
  cleared_at: string | null;
}

const SAMPLE_HALL: HallChampion[] = SAMPLE_CHAMPIONS.slice(0, 8).map((h, i) => ({
  horse_id: `sample-${i}`,
  name: h.name,
  dna_hash: h.dna_hash,
  horse_type: ['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK'][i % 5]!,
  rarity: ['LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'][i % 5]!,
  owner: ['yu***', 'mi***', '0x9fe3…12aa', 'ta***', 'ke***', 'sa***', '0x77cd…09be', 'no***'][i]!,
  cleared_at: `2026-07-${String(1 + i).padStart(2, '0')}`,
}));

export function ChampionView({
  buybacks,
  hall,
}: {
  buybacks: Buyback[];
  hall: HallChampion[];
}) {
  const isSample = hall.length === 0;
  const shown = isSample ? SAMPLE_HALL : hall;
  const heroHorses = shown.map((c) => ({ name: c.name, dna_hash: c.dna_hash }));

  return (
    <>
      {/* ① ヒーロー */}
      <ChampionHero horses={heroHorses} />

      {/* ② あなたのチャンピオン報酬(既存ビューを統合) */}
      <section className="panel" style={{ marginTop: '1rem' }}>
        <BuybacksView buybacks={buybacks} />
      </section>

      {/* ③ 殿堂 */}
      <section className="panel">
        <div className={s.secTitle}>
          HALL OF CHAMPIONS
          <span className={s.secSub}>Day7を走破した全ての馬</span>
        </div>
        {isSample && (
          <div className={s.hallSample}>
            サンプル表示(仮データ)— 最初のチャンピオンが誕生すると、ここに実際の馬が刻まれます。
          </div>
        )}
        <div className={s.hallGrid}>
          {shown.map((c) => (
            <div key={c.horse_id} className={s.hallCard}>
              <div className={s.hallArt}>
                <NftHorseArt look={deriveNftLook(c.dna_hash, c.name)} />
              </div>
              <div className={s.hallName}>{c.name}</div>
              <div className={s.hallMeta}>
                <span>{c.horse_type}</span>
                <span>{c.rarity}</span>
                <span>{c.owner}</span>
                {c.cleared_at && <span className={s.hallDate}>戴冠 {c.cleared_at}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ④ リーグ予告 */}
      <section className="panel">
        <div className={s.secTitle}>
          CHAMPION LEAGUE
          <span className={s.comingTag}>COMING SOON</span>
        </div>
        <p className="muted" style={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
          Day7を走破したチャンピオン馬だけが出走できる、週次の頂上リーグ。
          アクティブユーザーが10,000人に到達すると開幕します。デイリーダービーとは独立した経済で運営されます。
        </p>
        <div className={s.leagueGrid}>
          <div className={s.leagueCard}>
            <div className={s.leagueK}>WEEKLY RACES</div>
            <div className={s.leagueV}>
              週1回開催・1レース最大18頭。登録されたチャンピオン馬の数に応じてレースが自動編成されます。
            </div>
          </div>
          <div className={s.leagueCard}>
            <div className={s.leagueK}>7 CLASSES</div>
            <div className={s.leagueV}>
              勝ち上がりでクラスが昇級。
              <span className={s.classRow}>
                {['Maiden', '1勝', '2勝', '3勝'].map((c) => (
                  <span key={c} className={s.classChip}>{c}</span>
                ))}
                {['G3', 'G2', 'G1'].map((c) => (
                  <span key={c} className={`${s.classChip} ${s.classChipG}`}>{c}</span>
                ))}
              </span>
            </div>
          </div>
          <div className={s.leagueCard}>
            <div className={s.leagueK}>PRIZE POOL</div>
            <div className={s.leagueV}>
              毎週のアイテムショップ売上の1%が賞金プールへ。勝者総取りではなく、複数の出走馬に分配されます。
            </div>
          </div>
          <div className={s.leagueCard}>
            <div className={s.leagueK}>RETIREMENT</div>
            <div className={s.leagueV}>
              G1制覇、またはリーグ10走で名誉引退。引退馬は殿堂に永久に刻まれます。
            </div>
          </div>
          <div className={s.leagueCard}>
            <div className={s.leagueK}>FAN PASS — 3 USDT</div>
            <div className={s.leagueV}>
              マルチカメラアングルとプレミアム観戦を解放。ファン参加・ランキングなどの機能も計画中です。
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
