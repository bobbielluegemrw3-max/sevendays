import { deriveNftLook } from '@/lib/nft-visual';

/**
 * 実NFT馬のギャロップコマをベイクする(Daily Derby 審判演出用)。
 * チャンピオンヒーローの renderer.js `_spriteFramesFor` の移植:
 *   - 真HSVの色相回転(承認済み bodyDeg — カードと同じ公式パレット)
 *   - アルファ固化(液体クローム系の透け対策)
 *   - 連結成分解析で浮遊グリッチ線を除去(鬣は無傷)
 *   - 金装甲レイヤーは回転させず不透明で重ねる
 * 教訓の出典: CHAMPION_HERO_POSTMORTEM.md
 */

const FRAME_COUNT = 12;
const BAKE_SIZE = 320;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function bakeFrame(
  coat: HTMLImageElement,
  gold: HTMLImageElement | null,
  rotDeg: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = BAKE_SIZE;
  c.height = BAKE_SIZE;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(coat, 0, 0, BAKE_SIZE, BAKE_SIZE);

  const id = g.getImageData(0, 0, BAKE_SIZE, BAKE_SIZE);
  const d = id.data;
  const rotNorm = (((rotDeg % 360) + 360) % 360) / 360;
  const rotate = rotNorm > 0.002 && rotNorm < 0.998;
  for (let px = 0; px < d.length; px += 4) {
    if (d[px + 3] === 0) continue;
    if (rotate) {
      const r = d[px]! / 255;
      const gg = d[px + 1]! / 255;
      const b = d[px + 2]! / 255;
      const mx = Math.max(r, gg, b);
      const mn = Math.min(r, gg, b);
      const diff = mx - mn;
      if (diff > 1e-6) {
        let hh = 0;
        if (mx === r) hh = ((gg - b) / diff) % 6;
        else if (mx === gg) hh = (b - r) / diff + 2;
        else hh = (r - gg) / diff + 4;
        hh /= 6;
        if (hh < 0) hh += 1;
        const sat = Math.min(1, (mx > 1e-6 ? diff / mx : 0) * 1.05);
        const v = mx;
        hh = (hh + rotNorm) % 1;
        const k = Math.floor(hh * 6) % 6;
        const f = hh * 6 - Math.floor(hh * 6);
        const p0 = v * (1 - sat);
        const q0 = v * (1 - f * sat);
        const t0 = v * (1 - (1 - f) * sat);
        let nr = v;
        let ng = t0;
        let nb = p0;
        if (k === 1) { nr = q0; ng = v; nb = p0; }
        else if (k === 2) { nr = p0; ng = v; nb = t0; }
        else if (k === 3) { nr = p0; ng = q0; nb = v; }
        else if (k === 4) { nr = t0; ng = p0; nb = v; }
        else if (k === 5) { nr = v; ng = p0; nb = q0; }
        d[px] = Math.round(nr * 255);
        d[px + 1] = Math.round(ng * 255);
        d[px + 2] = Math.round(nb * 255);
      }
    }
    // アルファ固化(体=完全不透明・淡いたなびきは残す)
    const a = d[px + 3]!;
    if (a >= 60) d[px + 3] = 255;
    else if (a >= 25) d[px + 3] = Math.min(255, Math.round(a * 2.5));
  }

  // 浮遊グリッチ線の除去(最大連結成分=馬本体だけ残す)
  {
    const N = BAKE_SIZE * BAKE_SIZE;
    const label = new Int32Array(N);
    const stack = new Int32Array(N);
    let nextLabel = 0;
    let bestLabel = 0;
    let bestSize = 0;
    for (let i0 = 0; i0 < N; i0++) {
      if (label[i0] !== 0 || d[i0 * 4 + 3]! < 25) continue;
      nextLabel += 1;
      let sp = 0;
      let size = 0;
      stack[sp++] = i0;
      label[i0] = nextLabel;
      while (sp > 0) {
        const i = stack[--sp]!;
        size += 1;
        const x = i % BAKE_SIZE;
        const y = (i / BAKE_SIZE) | 0;
        if (x > 0 && label[i - 1] === 0 && d[(i - 1) * 4 + 3]! >= 25) { label[i - 1] = nextLabel; stack[sp++] = i - 1; }
        if (x < BAKE_SIZE - 1 && label[i + 1] === 0 && d[(i + 1) * 4 + 3]! >= 25) { label[i + 1] = nextLabel; stack[sp++] = i + 1; }
        if (y > 0 && label[i - BAKE_SIZE] === 0 && d[(i - BAKE_SIZE) * 4 + 3]! >= 25) { label[i - BAKE_SIZE] = nextLabel; stack[sp++] = i - BAKE_SIZE; }
        if (y < BAKE_SIZE - 1 && label[i + BAKE_SIZE] === 0 && d[(i + BAKE_SIZE) * 4 + 3]! >= 25) { label[i + BAKE_SIZE] = nextLabel; stack[sp++] = i + BAKE_SIZE; }
      }
      if (size > bestSize) { bestSize = size; bestLabel = nextLabel; }
    }
    for (let i = 0; i < N; i++) {
      if (label[i] !== 0 && label[i] !== bestLabel) d[i * 4 + 3] = 0;
    }
  }
  g.putImageData(id, 0, 0);

  // 金装甲は回転させず不透明で重ねる(NFTのaccents層と同じ思想)
  if (gold) g.drawImage(gold, 0, 0, BAKE_SIZE, BAKE_SIZE);
  return c;
}

/** dna(無ければ馬名から擬似dna)でルックを決め、12コマをベイクして返す。 */
export async function bakeGallopFrames(
  dnaHash: string | undefined,
  name: string,
): Promise<HTMLCanvasElement[] | null> {
  const dna = dnaHash ?? `0x${Array.from(name).map((ch) => ch.charCodeAt(0).toString(16)).join('').padEnd(64, 'a').slice(0, 64)}`;
  const look = deriveNftLook(dna, name);
  const loads: Promise<[HTMLImageElement | null, HTMLImageElement | null]>[] = [];
  for (let i = 1; i <= FRAME_COUNT; i++) {
    const nn = String(i).padStart(2, '0');
    loads.push(
      Promise.all([
        loadImage(`/champions/keiba/tex/gallop_${look.arch}_${nn}_coat.webp`),
        loadImage(`/champions/keiba/tex/gallop_${look.arch}_${nn}_gold.webp`),
      ]),
    );
  }
  const pairs = await Promise.all(loads);
  if (pairs.some(([coat]) => coat === null)) return null;
  return pairs.map(([coat, gold]) => bakeFrame(coat!, gold, look.bodyDeg));
}
