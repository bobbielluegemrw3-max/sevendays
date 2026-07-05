'use client';

import { useEffect, useRef } from 'react';
import type { CoatPattern, Rgb } from '@/lib/horse-visual';

/**
 * Renders one deterministic horse to a canvas from Manus's layer-separated
 * grayscale bases. The coat is painted with a *spatial* two-colour scheme (coat
 * + coatB distributed by `pattern` over the body — upper/lower, points, shoulder
 * patch, dapple, …) so each horse carries a real marking, not a flat recolour.
 * mane_tail is luminance-tinted to its own colour; eye_glow + accents composited
 * on top. Same inputs -> same pixels (verifiable).
 */

const LAYERS = ['coat', 'mane_tail', 'eye_glow', 'accents'] as const;
const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
const bboxCache = new Map<string, { x: number; y: number; w: number; h: number }>();

/** Tight bounding box of the horse body from the coat layer's alpha (in image px). */
function bodyBBox(baseId: string, img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const cached = bboxCache.get(baseId);
  if (cached) return cached;
  const w = img.width;
  const h = img.height;
  const t = document.createElement('canvas');
  t.width = w;
  t.height = h;
  const tx = t.getContext('2d')!;
  tx.drawImage(img, 0, 0);
  const d = tx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3]! > 20) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const box = found ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : { x: 0, y: 0, w, h };
  bboxCache.set(baseId, box);
  return box;
}

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

/** Single-colour luminance tint (used for the mane/tail). */
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
    if (l > 0.88) {
      const k = (l - 0.88) / 0.12;
      r += (255 - r) * k * 0.35;
      g += (255 - g) * k * 0.35;
      b += (255 - b) * k * 0.35;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  x.putImageData(id, 0, 0);
  return c;
}

// ---- spatial coat pattern helpers -------------------------------------------

function smoothEdge(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Integer hash -> [0,1). Deterministic value-noise source for dappling. */
function hash2(ix: number, iy: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const dd = hash2(ix + 1, iy + 1);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + dd * u * v;
}

/** Body-normalised position (nx: tail→head, ny: back→belly) -> blend 0=coat..1=coatB. */
function regionT(p: CoatPattern, nx: number, ny: number): number {
  switch (p.kind) {
    case 'solid':
      return 0;
    case 'upperLower':
      return smoothEdge(p.edge - p.soft, p.edge + p.soft, ny);
    case 'frontRear':
      return smoothEdge(p.edge - p.soft, p.edge + p.soft, nx);
    case 'gradient': {
      const d = nx * Math.cos(p.angle) + ny * Math.sin(p.angle);
      return smoothEdge(0.15, 0.85, d);
    }
    case 'socks':
      return smoothEdge(p.edge, p.edge + 0.12, ny);
    case 'points': {
      const legs = smoothEdge(p.edge, p.edge + 0.1, ny);
      const muzzle = smoothEdge(0.9, 0.98, nx) * (1 - smoothEdge(0.5, 0.62, ny));
      return Math.max(legs, muzzle);
    }
    case 'shoulder': {
      const dx = nx - p.cx;
      const dy = ny - p.cy;
      return 1 - smoothEdge(p.r * 0.6, p.r, Math.sqrt(dx * dx + dy * dy));
    }
    case 'dapple':
      return smoothEdge(p.thresh - 0.06, p.thresh + 0.06, vnoise(nx * p.scale, ny * p.scale));
  }
}

/**
 * Paint the coat with a spatial two-colour scheme: at each pixel, blend the
 * `a` (coat) and `b` (coatB) metallic ramps by the pattern's region weight, then
 * apply the grayscale luminance for metal shading. `box` is the body bbox in the
 * image's own pixels, used to normalise position.
 */
function paintCoat(
  img: HTMLImageElement,
  a: [Rgb, Rgb],
  b: [Rgb, Rgb],
  pattern: CoatPattern,
  box: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const s = img.width;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, s, s);
  const d = id.data;
  const bw = box.w || 1;
  const bh = box.h || 1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 4) continue;
    const px = (i >> 2) % s;
    const py = (i >> 2) / s | 0;
    const nx = Math.min(1, Math.max(0, (px - box.x) / bw));
    const ny = Math.min(1, Math.max(0, (py - box.y) / bh));
    const t = regionT(pattern, nx, ny);
    const sr = a[0][0] + (b[0][0] - a[0][0]) * t;
    const sg = a[0][1] + (b[0][1] - a[0][1]) * t;
    const sb = a[0][2] + (b[0][2] - a[0][2]) * t;
    const hr = a[1][0] + (b[1][0] - a[1][0]) * t;
    const hg = a[1][1] + (b[1][1] - a[1][1]) * t;
    const hb = a[1][2] + (b[1][2] - a[1][2]) * t;
    const l = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / 255;
    let r = sr + (hr - sr) * l;
    let g = sg + (hg - sg) * l;
    let bl = sb + (hb - sb) * l;
    if (l > 0.88) {
      const k = (l - 0.88) / 0.12;
      r += (255 - r) * k * 0.35;
      g += (255 - g) * k * 0.35;
      bl += (255 - bl) * k * 0.35;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = bl;
  }
  x.putImageData(id, 0, 0);
  return c;
}

export interface HorseArtProps {
  baseId: string;
  coat: [Rgb, Rgb];
  coatB: [Rgb, Rgb];
  pattern: CoatPattern;
  mane: [Rgb, Rgb];
  flip: boolean;
  className?: string | undefined;
}

export function HorseArt({ baseId, coat, coatB, pattern, mane, flip, className }: HorseArtProps) {
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

      const raw = coatImg ? bodyBBox(baseId, coatImg) : { x: 0, y: 0, w: S, h: S };

      const off = document.createElement('canvas');
      off.width = S;
      off.height = S;
      const ox = off.getContext('2d')!;
      if (maneImg) ox.drawImage(tint(maneImg, mane[0], mane[1]), 0, 0, S, S);
      if (coatImg) ox.drawImage(paintCoat(coatImg, coat, coatB, pattern, raw), 0, 0, S, S);
      if (eyeImg) ox.drawImage(eyeImg, 0, 0, S, S);
      if (accImg) ox.drawImage(accImg, 0, 0, S, S);

      // Frame every horse to a consistent body size/position (from the coat
      // bbox) so poses no longer float at different scales. Manes extend freely.
      cx.clearRect(0, 0, S, S);
      const bScale = coatImg ? S / coatImg.width : 1; // bbox is native px; off is S px
      const bx = raw.x * bScale;
      const by = raw.y * bScale;
      const bw = raw.w * bScale;
      const bh = raw.h * bScale;
      let scale = (S * 0.94) / bw; // body width -> 94% of the frame (big, impactful)
      if (bh * scale > S * 0.72) scale = (S * 0.72) / bh; // cap body height at 72%
      cx.translate(S * 0.5, S * 0.47);
      cx.scale(flip ? -scale : scale, scale);
      cx.translate(-(bx + bw / 2), -(by + bh / 2));
      cx.drawImage(off, 0, 0);
      cx.setTransform(1, 0, 0, 1, 0, 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [baseId, coat, coatB, pattern, mane, flip]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
