'use client';

import { useEffect, useRef } from 'react';
import type { Rgb } from '@/lib/horse-visual';

/**
 * Renders one deterministic horse to a canvas from Manus's layer-separated
 * grayscale bases: coat + mane_tail are luminance-tinted to independent colours,
 * eye_glow + accents composited on top, then optional horizontal mirror and a
 * few deterministic particles. Same inputs -> same pixels (verifiable).
 */

const LAYERS = ['coat', 'mane_tail', 'eye_glow', 'accents'] as const;
const imgCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImg(src: string): Promise<HTMLImageElement | null> {
  const hit = imgCache.get(src);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imgCache.set(src, p);
  return p;
}

function tint(img: HTMLImageElement, shadow: Rgb, hi: Rgb): HTMLCanvasElement {
  const s = img.width;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, s, s);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 4) continue;
    const l = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / 255;
    let r = shadow[0] + (hi[0] - shadow[0]) * l;
    let g = shadow[1] + (hi[1] - shadow[1]) * l;
    let b = shadow[2] + (hi[2] - shadow[2]) * l;
    if (l > 0.82) {
      const k = (l - 0.82) / 0.18;
      r += (255 - r) * k * 0.6;
      g += (255 - g) * k * 0.6;
      b += (255 - b) * k * 0.6;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  x.putImageData(id, 0, 0);
  return c;
}

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HorseArtProps {
  baseId: string;
  coat: [Rgb, Rgb];
  mane: [Rgb, Rgb];
  flip: boolean;
  seed: number;
  className?: string | undefined;
}

export function HorseArt({ baseId, coat, mane, flip, seed, className }: HorseArtProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const S = 512;
    void (async () => {
      const [coatImg, maneImg, eyeImg, accImg] = await Promise.all(
        LAYERS.map((l) => loadImg(`/horses/bases/${baseId}_${l}.png`)),
      );
      if (cancelled) return;
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = S;
      canvas.height = S;
      const cx = canvas.getContext('2d');
      if (!cx) return;

      const off = document.createElement('canvas');
      off.width = S;
      off.height = S;
      const ox = off.getContext('2d')!;
      if (maneImg) ox.drawImage(tint(maneImg, mane[0], mane[1]), 0, 0, S, S);
      if (coatImg) ox.drawImage(tint(coatImg, coat[0], coat[1]), 0, 0, S, S);
      if (eyeImg) ox.drawImage(eyeImg, 0, 0, S, S);
      if (accImg) ox.drawImage(accImg, 0, 0, S, S);

      // deterministic particles in the mane's highlight colour
      const rng = prng(seed ^ 0x9e3779b9);
      ox.globalCompositeOperation = 'lighter';
      const pc = `rgb(${mane[1][0]},${mane[1][1]},${mane[1][2]})`;
      const n = 8 + Math.floor(rng() * 12);
      for (let k = 0; k < n; k++) {
        ox.fillStyle = pc;
        ox.globalAlpha = 0.32 + rng() * 0.5;
        ox.beginPath();
        ox.arc(rng() * S, rng() * S * 0.75, 1 + rng() * 2.6, 0, 7);
        ox.fill();
      }
      ox.globalAlpha = 1;
      ox.globalCompositeOperation = 'source-over';

      cx.clearRect(0, 0, S, S);
      if (flip) {
        cx.translate(S, 0);
        cx.scale(-1, 1);
      }
      cx.drawImage(off, 0, 0);
      cx.setTransform(1, 0, 0, 1, 0, 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [baseId, coat, mane, flip, seed]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
