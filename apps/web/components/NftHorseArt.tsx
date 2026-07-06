'use client';

import { useEffect, useRef } from 'react';
import type { NftLook } from '@/lib/nft-visual';

/**
 * NFTルック描画 — Manusフルカラーレイヤー(768px)を真HSVで色相変換して合成。
 * coat = bodyDeg 回転 / mane_tail = 承認バリアント / accents(金)・eye_glow = 固定。
 * レイヤーは排他分離(Manus検収済み)なので合成順は任意。検収シートA/Bと同じ
 * HSV変換(CSS filter の行列近似ではない)を用い、承認された見た目を厳密に再現する。
 */

const LAYERS = ['coat', 'mane_tail', 'accents', 'eye_glow'] as const;
const S = 768;

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImg(src: string): Promise<HTMLImageElement | null> {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

/** 真HSVでの色相変換 (rot/mono/desat)。ImageData を直接書き換える。 */
function transform(d: Uint8ClampedArray, mode: 'rot' | 'mono' | 'desat', value: number): void {
  const degNorm = value / 360;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! === 0) continue;
    const r = d[i]! / 255;
    const g = d[i + 1]! / 255;
    const b = d[i + 2]! / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const diff = mx - mn;
    let h = 0;
    if (diff > 1e-6) {
      if (mx === r) h = ((g - b) / diff) % 6;
      else if (mx === g) h = (b - r) / diff + 2;
      else h = (r - g) / diff + 4;
      h /= 6;
      if (h < 0) h += 1;
    }
    let s = mx > 1e-6 ? diff / mx : 0;
    const v = mx;
    if (mode === 'rot') h = (h + degNorm) % 1;
    else if (mode === 'mono') h = degNorm;
    else s *= 0.12; // desat = 銀白
    const k = Math.floor(h * 6) % 6;
    const f = h * 6 - Math.floor(h * 6);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let nr = v, ng = t, nb = p;
    if (k === 1) { nr = q; ng = v; nb = p; }
    else if (k === 2) { nr = p; ng = v; nb = t; }
    else if (k === 3) { nr = p; ng = q; nb = v; }
    else if (k === 4) { nr = t; ng = p; nb = v; }
    else if (k === 5) { nr = v; ng = p; nb = q; }
    d[i] = Math.round(nr * 255);
    d[i + 1] = Math.round(ng * 255);
    d[i + 2] = Math.round(nb * 255);
  }
}

export function NftHorseArt({ look, className }: { look: NftLook; className?: string | undefined }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const maneKey = `${look.mane.kind}:${'deg' in look.mane ? look.mane.deg : 'hue' in look.mane ? look.mane.hue : ''}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const imgs = await Promise.all(LAYERS.map((l) => loadImg(`/horses/nft/${look.arch}_${l}.png`)));
      if (cancelled) return;
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = S;
      canvas.height = S;
      const cx = canvas.getContext('2d');
      if (!cx) return;
      cx.clearRect(0, 0, S, S);
      const work = document.createElement('canvas');
      work.width = S;
      work.height = S;
      const wx = work.getContext('2d', { willReadFrequently: true })!;
      LAYERS.forEach((layer, li) => {
        const img = imgs[li];
        if (!img) return;
        const needs = layer === 'coat' ? look.bodyDeg !== 0 : layer === 'mane_tail';
        if (!needs) {
          cx.drawImage(img, 0, 0, S, S);
          return;
        }
        wx.clearRect(0, 0, S, S);
        wx.drawImage(img, 0, 0, S, S);
        const id = wx.getImageData(0, 0, S, S);
        if (layer === 'coat') {
          transform(id.data, 'rot', look.bodyDeg);
        } else {
          const m = look.mane;
          if (m.kind === 'rot') {
            if (m.deg !== 0) transform(id.data, 'rot', m.deg);
          } else if (m.kind === 'mono') {
            transform(id.data, 'mono', m.hue);
          } else {
            transform(id.data, 'desat', 0);
          }
        }
        wx.putImageData(id, 0, 0);
        cx.drawImage(work, 0, 0, S, S);
      });
    })();
    return () => {
      cancelled = true;
    };
    // maneKey が look.mane の内容を安定に表現する(オブジェクト参照の揺れで再描画しない)
  }, [look.arch, look.bodyDeg, maneKey]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
