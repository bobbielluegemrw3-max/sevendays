'use client';

import { PRICE_TABLE_V1 } from '@sevendays/domain';
import type { PersonalResult } from '@/lib/daily-derby';
import { deriveNftLook } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import s from '../../app/daily-derby.module.css';

/**
 * グローバル演出のあとに出す「あなたの今日の結果」— ショーのフィナーレ。
 * 実際の馬NFTアート(dna_hash 由来・サイト全体と同一ルック)を主役に、
 * 行が順に立ち上がるカスケードで見せる。絵文字は使わない。
 */

function Art({
  dnaHash,
  name,
  size,
  variant = '',
}: {
  dnaHash: string | undefined;
  name: string;
  size: 'main' | 'small';
  variant?: string;
}) {
  if (!dnaHash) return null;
  return (
    <div className={`${size === 'main' ? s.rArtFrame : s.rArtFrameSmall} ${variant}`}>
      <NftHorseArt look={deriveNftLook(dnaHash, name)} className={s.rArt} />
    </div>
  );
}

/** 行を順に立ち上げる(delay 秒)。 */
function Row({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <div className={s.rRow} style={{ animationDelay: `${delay}s` }}>
      {children}
    </div>
  );
}

export function DailyDerbyPersonalResult({ result }: { result: PersonalResult }) {
  return (
    <div className={s.rWrap}>
      <div className={s.rKicker}>Your Result</div>

      {result.kind === 'SOLD' && (
        <div className={s.rCard}>
          <Row delay={0.1}>
            <Art dnaHash={result.dnaHash} name={result.horseName} size="main" />
          </Row>
          <Row delay={0.5}>
            <div className={s.rName}>{result.horseName}</div>
          </Row>
          <Row delay={0.9}>
            <div className={s.rChips}>
              <span className={`${s.rChip} ${s.rChipGood}`}>SURVIVED</span>
              <span className={s.rChip}>DAY {result.fromDay} → DAY {result.fromDay + 1}</span>
              <span className={`${s.rChip} ${s.rChipGood}`}>SOLD</span>
            </div>
          </Row>
          <Row delay={1.3}>
            <div className={s.rBig}>
              {result.soldPrice}
              <span className={s.rBigUnit}> USDT</span>
            </div>
            <div className={s.rBigLabel}>Sold Price</div>
          </Row>
          <Row delay={1.8}>
            <div className={s.rDivider}>
              <span>New Horse Assigned</span>
            </div>
            <div className={s.rNewRow}>
              <Art dnaHash={result.newDnaHash} name={result.newHorseName} size="small" />
              <div>
                <div className={s.rNewName}>{result.newHorseName}</div>
                <div className={s.rNewDay}>DAY {result.newHorseDay}</div>
              </div>
            </div>
          </Row>
        </div>
      )}

      {result.kind === 'SURVIVED' && (
        <div className={s.rCard}>
          <Row delay={0.1}>
            <Art dnaHash={result.dnaHash} name={result.horseName} size="main" />
          </Row>
          <Row delay={0.5}>
            <div className={s.rName}>{result.horseName}</div>
          </Row>
          <Row delay={0.9}>
            <div className={s.rChips}>
              <span className={`${s.rChip} ${s.rChipGood}`}>SURVIVED</span>
              <span className={s.rChip}>DAY {result.fromDay} → DAY {result.fromDay + 1}</span>
            </div>
          </Row>
          <Row delay={1.3}>
            <div className={s.rBig}>
              {PRICE_TABLE_V1[Math.min(result.fromDay + 1, 6)]}
              <span className={s.rBigUnit}> USDT</span>
            </div>
            <div className={s.rBigLabel}>Current Value</div>
          </Row>
          <Row delay={1.8}>
            <div className={s.rNote}>Tomorrow, the derby runs again. 20:00 (GMT+8)</div>
          </Row>
        </div>
      )}

      {result.kind === 'BURNED' && (
        <div className={`${s.rCard} ${s.rCardBurn}`}>
          <Row delay={0.1}>
            <Art dnaHash={result.dnaHash} name={result.horseName} size="main" variant={s.rArtBurned!} />
          </Row>
          <Row delay={0.5}>
            <div className={s.rName}>{result.horseName}</div>
          </Row>
          <Row delay={0.9}>
            <div className={s.rChips}>
              <span className={`${s.rChip} ${s.rChipBad}`}>BURNED</span>
            </div>
          </Row>
          <Row delay={1.4}>
            <div className={s.rBuffPanel}>
              <div className={s.rBuffTitle}>REVENGE BUFF READY</div>
              <div className={s.rBuffRarity}>{result.buffRarity}</div>
              <div className={s.rNote}>Auto-applies to your next horse&apos;s first race.</div>
            </div>
          </Row>
        </div>
      )}

      {result.kind === 'DAY7' && (
        <div className={`${s.rCard} ${s.rCardGold}`}>
          <Row delay={0.1}>
            <Art dnaHash={result.dnaHash} name={result.horseName} size="main" variant={s.rArtGold!} />
          </Row>
          <Row delay={0.5}>
            <div className={`${s.rName} ${s.rNameGold}`}>{result.horseName}</div>
          </Row>
          <Row delay={0.9}>
            <div className={s.rChips}>
              <span className={`${s.rChip} ${s.rChipGold}`}>DAY7 CLEARED</span>
            </div>
          </Row>
          <Row delay={1.3}>
            <div className={`${s.rBig} ${s.rBigGold}`}>
              {result.buybackTotal}
              <span className={s.rBigUnit}> USDT</span>
            </div>
            <div className={s.rBigLabel}>Buyback Started</div>
          </Row>
          <Row delay={1.8}>
            <div className={s.rNote}>
              Memorial NFT will be created after all payments are completed.
            </div>
          </Row>
        </div>
      )}
    </div>
  );
}
