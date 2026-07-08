'use client';

import { useEffect, useRef, useState } from 'react';
import { deriveNftLook } from '@/lib/nft-visual';
import { SAMPLE_CHAMPIONS, type HeroHorse } from '@/lib/champion-fixtures';
import s from '../../app/champion.module.css';

/**
 * CHAMPION LEAGUE ヒーロー(ADR-011): 予想シアター(D-Logic)のレース描画技術を
 * 移植したループアニメーション。黒背景×金、メタリックなチャンピオン馬が
 * 走り続ける。three.js+GLB(読めない環境は2Dへ自動フォールバック)。
 *
 * - ベンダーJS: /champions/keiba/{engine,renderer}.js(オーナー自身の資産を移植)
 * - 決定論シードでレース生成 → finishedイベントで次のシードへ(無限ループ)
 * - IntersectionObserverで見えるまでロードしない(GLB 11MB対策)
 */

declare global {
  interface Window {
    KeibaEngine?: {
      generateRaceFromInput: (input: unknown, opts?: { seed?: number }) => unknown;
    };
  }
}

/** NFTルックのbodyDeg(色相)からメタリックなコートhexを作る(決定論)。 */
function metallicCoat(dnaHash: string, name: string): string {
  const look = deriveNftLook(dnaHash, name);
  const h = ((look.bodyDeg % 360) + 360) % 360;
  const c = 0.55; // 彩度控えめ=クローム感
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const seg = Math.floor(h / 60);
  const [r1, g1, b1] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg] ?? [c, x, 0];
  const m = 0.35; // 明度の底上げ(メタリックの地金)
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r1!)}${to(g1!)}${to(b1!)}`;
}

export function ChampionHero({ horses }: { horses: HeroHorse[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cvRef = useRef<HTMLElement | null>(null);
  const seedRef = useRef(7);
  const [state, setState] = useState<'idle' | 'loading' | 'running' | 'failed'>('idle');

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState((cur) => (cur === 'idle' ? 'loading' : cur));
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (state !== 'loading') return;
    let cancelled = false;
    const addScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        if (document.querySelector(`script[data-keiba="${src}"]`)) { resolve(); return; }
        const sc = document.createElement('script');
        sc.src = src;
        sc.async = true;
        sc.dataset.keiba = src;
        sc.onload = () => resolve();
        sc.onerror = () => reject(new Error(`load failed: ${src}`));
        document.body.appendChild(sc);
      });

    const roster = (horses.length >= 6 ? horses : SAMPLE_CHAMPIONS).slice(0, 12);

    const buildAndRun = () => {
      const engine = window.KeibaEngine;
      const el = cvRef.current as unknown as {
        loadRace: (race: unknown, env: unknown) => void;
        start: () => void;
        seek?: (t: number) => void;
        setSpeed: (v: number) => void;
        setCamera: (m: string) => void;
        setMiniMap: (b: boolean) => void;
        setCamZoom?: (z: number) => void;
      } | null;
      if (!engine || !el) return;
      const input = {
        venueName: 'SEVEN DAYS',
        raceName: 'CHAMPION LEAGUE',
        raceNo: 1,
        grade: 'G1',
        surface: '芝',
        distance: 2000,
        pace: '平均',
        horses: roster.map((h, i) => {
          const N = roster.length;
          const seed = seedRef.current;
          // 4つの通過順位(全て順列になる回転)+脚質 — エンジンの必須入力。
          const rot = (off: number) => ((i + off) % N) + 1;
          return {
            num: i + 1,
            name: h.name,
            jockey: '',
            style: ['逃げ', '先行', '差し', '追込'][i % 4],
            startRank: rot(seed),
            c3Rank: rot(seed + 2),
            c4Rank: rot(seed + 4),
            finishRank: rot(seed * 3 + 5),
            stability: 0.75,
            coat: metallicCoat(h.dna_hash, h.name),
          };
        }),
      };
      try {
        const race = engine.generateRaceFromInput(input, { seed: seedRef.current });
        el.loadRace(race, { time: 'void', season: 'winter', metallic: true });
        // 接写では等速に近いほど重厚(速いと小走りに見える)
        el.setSpeed(1.25);
        // 'side'はコース全体の固定引きカメラ(馬が光点になる)。追走カメラで
        // 馬に寄る。スプライトは常にカメラを向くのでどのカットでも成立する
        el.setCamera('auto');
        el.setMiniMap(false);
        el.setCamZoom?.(1.0);
        el.start();
        // 視覚QA用: ?heroseek=<秒> でレース途中へ直行(スクリーンショット検証の決定論化)
        const qa = new URLSearchParams(window.location.search).get('heroseek');
        if (qa && Number.isFinite(Number(qa))) el.seek?.(Number(qa));
      } catch (err) {
        console.error('ChampionHero race build failed:', err);
        setState('failed');
      }
    };

    addScript('/champions/keiba/engine.js?v=1')
      .then(() => addScript('/champions/keiba/renderer.js?v=1'))
      .then(() => {
        if (cancelled) return;
        const wrap = wrapRef.current;
        if (!wrap) return;
        if (!cvRef.current) {
          const el = document.createElement('race-canvas');
          el.style.position = 'absolute';
          el.style.inset = '0';
          el.style.width = '100%';
          el.style.height = '100%';
          el.addEventListener('finished', () => {
            // ループ: 次のシードで走り直す(着順もシャッフルされる)
            seedRef.current += 1;
            setTimeout(() => buildAndRun(), 1600);
          });
          wrap.appendChild(el);
          cvRef.current = el;
        }
        buildAndRun();
        setState('running');
      })
      .catch(() => { if (!cancelled) setState('failed'); });
    return () => { cancelled = true; };
  }, [state, horses]);

  return (
    <div className={s.hero}>
      <div ref={wrapRef} className={s.heroCanvas}>
        {/* Manus納品のアリーナ背景(GLキャンバスは透過なので背面に敷く) */}
        <img
          className={s.heroBackdrop}
          src="/champions/keiba/tex/arena_backdrop.webp"
          alt=""
          aria-hidden="true"
        />
        {state !== 'running' && (
          <div className={s.heroLoading}>
            {state === 'failed' ? 'CHAMPION LEAGUE' : 'LOADING CHAMPIONS…'}
          </div>
        )}
      </div>
      <div className={s.heroOverlay}>
        <div className={s.heroKicker}>WEEKLY COMPETITION</div>
        <div className={s.heroTitle}>CHAMPION LEAGUE</div>
        <div className={s.heroComing}>COMING SOON</div>
        <div className={s.heroNote}>アクティブユーザー 10,000人 到達で開幕</div>
      </div>
    </div>
  );
}
