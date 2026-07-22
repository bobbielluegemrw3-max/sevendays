'use client';

import { NftHorseArt } from '@/components/NftHorseArt';
import {
  BODY_DEGS, MANE_VARIANTS, MATERIAL_TONES, PLATINUM_TINTS,
  isSingleArch, type Arch, type NftLook,
} from '@/lib/nft-visual';

/* ============================================================================
 * dev専用: 7アーキタイプの素の見た目。
 * カード/ヒーローの演出(ブレンドレイヤ・オーラ・壁紙の透過)を通さずに
 * NftHorseArt だけを描く。色の異常がアート側かページ側かを切り分けるため。
 * ========================================================================== */

const ARCHES: Arch[] = ['v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'];

function lookOf(arch: Arch, i: number): NftLook {
  const single = isSingleArch(arch);
  const tint = arch === 'v5' ? PLATINUM_TINTS[i % PLATINUM_TINTS.length]! : undefined;
  const matTone = single && arch !== 'v5' ? MATERIAL_TONES[i % MATERIAL_TONES.length]! : undefined;
  return {
    arch,
    bodyDeg: BODY_DEGS[i % BODY_DEGS.length]!,
    mane: MANE_VARIANTS[i % MANE_VARIANTS.length]!,
    hue: 200,
    ...(tint ? { tint } : {}),
    ...(matTone ? { matTone } : {}),
    frameLine: '', frameGlow: '', framePanel: '', frameGrad: '',
  } as NftLook;
}

export function NftPreviewGrid() {
  return (
    <div style={{ padding: 20, background: '#0a0813', minHeight: '100vh' }}>
      {ARCHES.map((arch) => (
        <div key={arch} style={{ marginBottom: 18 }}>
          <div style={{ font: '13px monospace', color: '#8f8ac2', letterSpacing: '0.1em', marginBottom: 4 }}>
            {arch}{isSingleArch(arch) ? ' (1枚絵)' : ' (レイヤー4枚)'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <NftHorseArt
                key={i}
                look={lookOf(arch, i)}
                size={340}
                className="nftCell"
              />
            ))}
          </div>
        </div>
      ))}
      <style>{`.nftCell { width: 170px; height: 170px; display: block; background: #12101d; border-radius: 10px; }`}</style>
    </div>
  );
}
