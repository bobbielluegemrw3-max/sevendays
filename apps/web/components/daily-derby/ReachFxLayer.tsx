'use client';

import { useEffect, useRef } from 'react';

/* ============================================================================
 * ReachFxLayer — レース審判「リーチ演出」の canvas オーバーレイ。
 * デザイナーモック(Race Verdict Reach.dc.html)の draw() を忠実移植。
 * ★元の帯レース盤(BandRaceAct + .br* CSS)には一切触れない。その上に薄く重ねる
 *   FX層(空気=キーライト / 凍結 / 破裂の衝撃波)だけを担う。pointer-events:none。
 *
 * 増分1: 空気(danger基準で赤へ寄る)＋破裂＋凍結描画エンジン。実状態で駆動。
 * 増分2(予定): 期待tier色(featured馬の総合値/帯)の結線＋フリーズの間合い(band-race.ts)。
 * ========================================================================== */

const GOLD: [number, number, number] = [255, 213, 120];
const RED: [number, number, number] = [255, 70, 52];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export interface ReachFxState {
  /** 演出中か(帯レース〜審判)。false でレイヤー非表示。 */
  active: boolean;
  /** 'reveal' | 'line' | 'verdict' | 'payoff' 等。payoff で破裂。 */
  phase: string;
  /** 生存ラインへの近さ 0..1(myRank/lineRank)。ライン際で赤へ寄る。 */
  danger: number;
  /** 決着(payoff の色)。 */
  fate: 'SAFE' | 'BURN' | null;
  /** 凍結中(裏切りの合図)。 */
  frozen?: boolean;
  /** 期待薄のさらに下=7秒暗黒モード。 */
  t5?: boolean;
  /** 期待tier のキーライト(増分2で結線・既定=金)。 */
  tierRgb?: [number, number, number];
}

export function ReachFxLayer({ stateRef }: { stateRef: React.MutableRefObject<ReachFxState> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const dust = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, r: 0.6 + Math.random() * 1.4, sp: 0.02 + Math.random() * 0.06 }));
    let W = 0, H = 0, raf = 0, payoffAt = 0, fz0 = 0, impact = 0, prevPhase = '';

    const resize = () => {
      const r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const st = stateRef.current;
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      if (!st.active) { payoffAt = 0; fz0 = 0; return; }

      const payoff = st.phase === 'payoff';
      const frozen = !!st.frozen;
      const fate = st.fate;
      const danger = clamp(st.danger, 0, 1);
      const tier = st.tierRgb ?? GOLD;
      if (st.phase !== prevPhase) { if (st.phase === 'reveal' || st.phase === 'line') impact = Math.max(impact, 0); prevPhase = st.phase; }

      // 空気 grade: tier色ベース→ラインへ近づくほど赤へ。payoffは決着色、frozenは無彩。
      let key: [number, number, number];
      if (payoff) key = fate === 'SAFE' ? GOLD : RED;
      else if (frozen) key = [150, 155, 165];
      else { const d = danger * 0.6; key = [Math.round(tier[0] * (1 - d) + 255 * d), Math.round(tier[1] * (1 - d) + 70 * d), Math.round(tier[2] * (1 - d) + 52 * d)]; }

      const bg = ctx.createRadialGradient(W * 0.5, H * 0.44, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
      bg.addColorStop(0, rgba(key, payoff ? 0.17 : 0.11)); bg.addColorStop(1, 'rgba(4,4,6,0)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // dust
      ctx.globalCompositeOperation = 'lighter';
      for (const d of dust) { if (!frozen && !reduce) { d.y -= d.sp * 0.0011; if (d.y < 0) d.y = 1; } const a = 0.05 * d.z * (frozen ? 0.4 : 1); ctx.fillStyle = rgba(frozen ? [160, 165, 175] : key, a); ctx.beginPath(); ctx.arc(d.x * W, d.y * H, d.r * d.z, 0, 6.28); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';

      // 破裂(枠外からの衝撃波・馬が浮上を始めてから)
      if (payoff && !reduce) {
        const cx = W * 0.5, cy = H * 0.5; if (!payoffAt) payoffAt = now;
        const bl = clamp((now - payoffAt) / 900, 0, 1); const survive = fate === 'SAFE'; const gc = survive ? GOLD : RED;
        if (bl > 0.2) {
          const g = easeOut(clamp((bl - 0.2) / 0.8, 0, 1));
          ctx.globalCompositeOperation = 'lighter';
          const gr = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(W, H) * 0.44); gr.addColorStop(0, rgba(gc, 0.3 * g)); gr.addColorStop(1, rgba(gc, 0)); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
          const r0 = Math.min(W, H) * 0.24;
          ctx.strokeStyle = rgba(gc, (1 - bl) * 0.5); ctx.lineWidth = 7 * (1 - bl) + 1; ctx.beginPath(); ctx.arc(cx, cy, r0 + g * Math.max(W, H) * 0.4, 0, 6.28); ctx.stroke();
          ctx.strokeStyle = rgba(gc, (1 - bl) * 0.24); ctx.lineWidth = 3 * (1 - bl) + 1; ctx.beginPath(); ctx.arc(cx, cy, r0 + easeOut(clamp(bl * 1.4, 0, 1)) * Math.max(W, H) * 0.5, 0, 6.28); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
      } else payoffAt = 0;

      // 凍結
      if (frozen && !reduce) {
        if (!fz0) fz0 = now;
        if (st.t5) { const fp = clamp((now - fz0) / 420, 0, 1); ctx.fillStyle = rgba([0, 0, 0], 0.995 * fp); ctx.fillRect(0, 0, W, H); ctx.fillStyle = rgba([0, 0, 0], 0.985 * fp); ctx.fillRect(0, 0, W, H); }
        else { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, W, H); ctx.restore(); ctx.strokeStyle = 'rgba(210,225,245,1)'; for (let y = 0; y < H; y += 3) { ctx.globalAlpha = 0.04; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } ctx.globalAlpha = 1; }
      } else fz0 = 0;

      if (impact > 0.01 && !reduce) { ctx.fillStyle = rgba([255, 255, 255], impact * 0.85); ctx.fillRect(0, 0, W, H); impact *= 0.74; }

      // vignette
      const vg = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.22, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
      const vgA = frozen ? 0.85 : payoff && fate === 'BURN' ? 0.7 : 0.36 + danger * 0.2; vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(2,2,5,${vgA})`); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [stateRef]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }} />;
}
