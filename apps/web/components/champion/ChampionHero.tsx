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

    // 6頭に絞る+ルック重複排除: 同じ(アーキタイプ×回転角)の馬が2頭並ぶと
    // 「全く同じ馬」に見える(オーナー指摘 2026-07-08)。
    const pool = horses.length >= 6 ? horses : SAMPLE_CHAMPIONS;
    const seen = new Set<string>();
    const roster: HeroHorse[] = [];
    for (const h of pool) {
      const look = deriveNftLook(h.dna_hash, h.name);
      const k = `${look.arch}:${look.bodyDeg}`;
      if (seen.has(k)) continue;
      seen.add(k);
      roster.push(h);
      if (roster.length === 6) break;
    }
    for (const h of pool) {
      if (roster.length >= 6) break;
      if (!roster.includes(h)) roster.push(h);
    }

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
        gapScale: 2.2, // 縦の車間を広げ、たなびく鬣が後続に被らないように
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
            // NFTルックそのもの: アーキタイプ+承認済み回転角(bodyDeg)。
            // スプライトはカードと同じ角度で回す=マケプレと同じ公式パレット
            arch: deriveNftLook(h.dna_hash, h.name).arch,
            coatDeg: deriveNftLook(h.dna_hash, h.name).bodyDeg,
          };
        }),
      };
      try {
        const race = engine.generateRaceFromInput(input, { seed: seedRef.current });
        // 調整つまみ(URLパラメータ・省略時は既定値):
        //   ?spd=0.35(再生倍率) &stride=6(コマ送り完歩m・小さいほど脚が速い)
        //   &gold=1(金装甲の濃さ0-1) &tint=0.42(馬体への個体色の濃さ0-1)
        const q = new URLSearchParams(window.location.search);
        const num = (k: string, d: number) => {
          const v = Number(q.get(k));
          return Number.isFinite(v) && q.get(k) !== null && q.get(k) !== '' ? v : d;
        };
        el.loadRace(race, {
          time: 'void',
          season: 'winter',
          metallic: true,
          strideM: num('stride', 7),
          goldAlpha: num('gold', 0.55),
          tintAlpha: num('tint', 0.7),
        });
        // 0.7倍: 脚の回転(実速同期)が競馬らしく見える下限あたり
        el.setSpeed(num('spd', 0.7));
        // 'side'はコース全体の固定引きカメラ(馬が光点になる)。追走カメラで
        // 馬に寄る。スプライトは常にカメラを向くのでどのカットでも成立する
        el.setCamera('auto');
        el.setMiniMap(false);
        el.setCamZoom?.(1.0);
        el.start();
        // ヒーローは常にレース中盤から再生(ゲート発進の「カタカタ→加速」を見せない)
        el.seek?.(30);
        // 視覚QA用: ?heroseek=<秒> でレース途中へ直行(スクリーンショット検証の決定論化)
        const qa = new URLSearchParams(window.location.search).get('heroseek');
        if (qa && Number.isFinite(Number(qa))) el.seek?.(Number(qa));
      } catch (err) {
        console.error('ChampionHero race build failed:', err);
        setState('failed');
      }
    };

    addScript('/champions/keiba/engine.js?v=20260709h')
      .then(() => addScript('/champions/keiba/renderer.js?v=20260709h'))
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
