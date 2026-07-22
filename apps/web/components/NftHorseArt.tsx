'use client';

import { useEffect, useRef } from 'react';
import { isSingleArch, type NftLook } from '@/lib/nft-visual';

/**
 * NFTルック描画 — Manusフルカラーレイヤー(768px)を真HSVで色相変換して合成。
 * coat = bodyDeg 回転 / mane_tail = 承認バリアント / accents(金)・eye_glow = 固定。
 * レイヤーは排他分離(Manus検収済み)なので合成順は任意。検収シートA/Bと同じ
 * HSV変換(CSS filter の行列近似ではない)を用い、承認された見た目を厳密に再現する。
 */

const LAYERS = ['coat', 'mane_tail', 'accents', 'eye_glow'] as const;

/**
 * アセットの版番号(2026-07-22)。
 * 画像はパスが固定なので、中身を直しても URL が変わらず、ブラウザとCDNが
 * 古いファイルを最大4時間(Cache-Control: max-age=14400)持ち続ける。
 * 実際に「直したのに何も変わっていない」が起きた。
 * **public/horses/nft/ の画像を差し替えたら、必ずこの数字を上げること。**
 */
const ART_VERSION = 2;
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
/**
 * 色変換。
 *  rot   … 色相を回す(金属専用。既存3型と新3型 v6/v7/v8)
 *  mono  … 色相を固定色へ
 *  desat … 銀白へ
 *  tint  … **彩度を足して**色を乗せ、明度で濃淡を作る(2026-07-22)。
 *          銀(彩度ゼロ)は色相を回しても変わらないので、プラチナ型はこれを使う。
 *          value = 色相、tintSat/tintVal で濃さと明るさ。
 */
function transform(
  d: Uint8ClampedArray,
  mode: 'rot' | 'mono' | 'desat' | 'tint' | 'tone',
  value: number,
  tintSat = 0,
  tintVal = 1,
): void {
  // 表示ヘルパーは絶対に落ちない/壊れない。不正値は変換しないで返す
  // (2026-07-22: undefined が入って NaN になり、馬がマゼンタに化けた)
  if (!Number.isFinite(value) || !Number.isFinite(tintSat) || !Number.isFinite(tintVal)) return;
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
    let v2 = v;
    if (mode === 'rot') h = (h + degNorm) % 1;
    else if (mode === 'mono') h = degNorm;
    else if (mode === 'tint') { h = degNorm; s = Math.min(1, Math.max(s, tintSat)); v2 = Math.min(1, v * tintVal); }
    // tone: 素材の色相はそのまま(value=わずかな揺らぎ)。彩度と明度だけ倍率で振る
    else if (mode === 'tone') { h = (h + degNorm + 1) % 1; s = Math.min(1, s * tintSat); v2 = Math.min(1, v * tintVal); }
    else s *= 0.12; // desat = 銀白
    const k = Math.floor(h * 6) % 6;
    const f = h * 6 - Math.floor(h * 6);
    const p = v2 * (1 - s);
    const q = v2 * (1 - f * s);
    const t = v2 * (1 - (1 - f) * s);
    let nr = v2, ng = t, nb = p;
    if (k === 1) { nr = q; ng = v2; nb = p; }
    else if (k === 2) { nr = p; ng = v2; nb = t; }
    else if (k === 3) { nr = p; ng = q; nb = v2; }
    else if (k === 4) { nr = t; ng = p; nb = v2; }
    else if (k === 5) { nr = v2; ng = p; nb = q; }
    d[i] = Math.round(nr * 255);
    d[i + 1] = Math.round(ng * 255);
    d[i + 2] = Math.round(nb * 255);
  }
}

/** 隠し演出「全身原色」(EASTER_EGG_PLAN)の染め色。DOMの色付き四角ではなく
 *  キャンバスの画素へ直接適用する — 四角のままだと、絵を壁紙にした新カードで
 *  ただの色ブロックとして露出する(2026-07-22 実画面で確認)。 */
const SKIN_TINT: Record<string, { hue: number; sat: number; val: number }> = {
  red: { hue: 2, sat: 0.78, val: 1.0 },
  blue: { hue: 223, sat: 0.72, val: 1.0 },
  yellow: { hue: 48, sat: 0.85, val: 1.05 },
  green: { hue: 145, sat: 0.7, val: 1.0 },
  black: { hue: 240, sat: 0.1, val: 0.32 },
};

export function NftHorseArt({
  look, className, size, colorVariant,
}: {
  look: NftLook;
  className?: string | undefined;
  size?: number;
  /** 全身原色ルック(隠し演出)。指定時は最後にキャンバス全体を染める。 */
  colorVariant?: string | null | undefined;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const maneKey = `${look.mane.kind}:${'deg' in look.mane ? look.mane.deg : 'hue' in look.mane ? look.mane.hue : ''}`;
  const tintKey = look.tint
    ? `t${look.tint.hue}:${look.tint.sat}:${look.tint.val}`
    : look.matTone
      ? `n${look.matTone.jitter}:${look.matTone.sat}:${look.matTone.val}`
      : '';

  useEffect(() => {
    // サムネイル用途はここで縮小して描く(768のままCSS縮小するとGPUバイリニアで
    // 滲む — 2026-07-18 オーナー指摘)。呼び出し側は「表示px×2(Retina)」を渡す。
    const R = size ?? S;
    let cancelled = false;
    void (async () => {
      // 1枚絵アーキタイプ(v5〜v8)は分離レイヤーを持たない。金属なので絵ごと
      // 変換して成立する(NFT_ART_HANDOVER §0-A: 回転が壊すのは非金属だけ)
      const single = isSingleArch(look.arch);
      const imgs = single
        ? [await loadImg(`/horses/nft/${look.arch}_full.png?v=${ART_VERSION}`)]
        : await Promise.all(LAYERS.map((l) => loadImg(`/horses/nft/${look.arch}_${l}.png?v=${ART_VERSION}`)));
      if (cancelled) return;
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = R;
      canvas.height = R;
      const cx = canvas.getContext('2d');
      if (!cx) return;
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = 'high';
      cx.clearRect(0, 0, R, R);
      const work = document.createElement('canvas');
      work.width = R;
      work.height = R;
      const wx = work.getContext('2d', { willReadFrequently: true })!;
      wx.imageSmoothingEnabled = true;
      wx.imageSmoothingQuality = 'high';
      if (single) {
        const img = imgs[0];
        if (!img) return;
        wx.clearRect(0, 0, R, R);
        wx.drawImage(img, 0, 0, R, R);
        const id = wx.getImageData(0, 0, R, R);
        if (look.tint) {
          // 銀は色相回転が効かない。彩度を足して色を乗せる
          transform(id.data, 'tint', look.tint.hue, look.tint.sat, look.tint.val);
        } else if (look.matTone) {
          // ★ 色相は回さない。銅は橙だから銅であり、紫の銅は存在しない
          //   (2026-07-22 夜・実機で紫の銅が玩具に見えた)
          transform(id.data, 'tone', look.matTone.jitter, look.matTone.sat, look.matTone.val);
        }
        wx.putImageData(id, 0, 0);
        cx.drawImage(work, 0, 0, R, R);
        return;
      }
      LAYERS.forEach((layer, li) => {
        const img = imgs[li];
        if (!img) return;
        const needs = layer === 'coat' ? look.bodyDeg !== 0 : layer === 'mane_tail';
        if (!needs) {
          cx.drawImage(img, 0, 0, R, R);
          return;
        }
        wx.clearRect(0, 0, R, R);
        wx.drawImage(img, 0, 0, R, R);
        const id = wx.getImageData(0, 0, R, R);
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
        cx.drawImage(work, 0, 0, R, R);
      });
      // 全身原色(隠し演出)は最後に一度だけ。馬の画素にだけ乗るので四角にならない
      const skin = colorVariant ? SKIN_TINT[colorVariant] : undefined;
      if (skin) {
        const id = cx.getImageData(0, 0, R, R);
        transform(id.data, 'tint', skin.hue, skin.sat, skin.val);
        cx.putImageData(id, 0, 0);
      }
    })();
    return () => {
      cancelled = true;
    };
    // maneKey が look.mane の内容を安定に表現する(オブジェクト参照の揺れで再描画しない)
  }, [look.arch, look.bodyDeg, maneKey, tintKey, size, colorVariant]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
