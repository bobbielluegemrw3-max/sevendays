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

export function ChampionHero({ horses, demo = false }: { horses: HeroHorse[]; demo?: boolean }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cvRef = useRef<HTMLElement | null>(null);
  const seedRef = useRef(7);
  const [state, setState] = useState<'idle' | 'loading' | 'running' | 'failed'>('idle');
  // 足音(Raceページと同じ hoofbeats.mp3)。自動再生はブラウザが禁止のため
  // 既定OFF・ボタン操作(ユーザージェスチャー)でONにする
  const [soundOn, setSoundOn] = useState(false);
  const [finishFlash, setFinishFlash] = useState(false);
  const hoofsRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (soundOn) {
      if (!hoofsRef.current) {
        const audio = new Audio('/sounds/hoofbeats.mp3');
        audio.loop = true;
        audio.volume = 0.45;
        hoofsRef.current = audio;
      }
      void hoofsRef.current.play().catch(() => setSoundOn(false));
    } else {
      hoofsRef.current?.pause();
    }
    return () => hoofsRef.current?.pause();
  }, [soundOn]);

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

    // 6頭選抜: ①色相ファミリー(60°刻み6系統)から1頭ずつ=全馬が別系統の色
    // ②同一ルック(アーキタイプ×回転角)の重複禁止(オーナー指摘 2026-07-08)。
    // マスターはシアン(190°)なので実効色相 = (190 + bodyDeg) % 360。
    const pool = horses.length >= 6 ? horses : SAMPLE_CHAMPIONS;
    const seenLook = new Set<string>();
    const seenFamily = new Set<number>();
    const roster: HeroHorse[] = [];
    const pick = (requireNewFamily: boolean) => {
      for (const h of pool) {
        if (roster.length >= 6) return;
        const look = deriveNftLook(h.dna_hash, h.name);
        const lookKey = `${look.arch}:${look.bodyDeg}`;
        if (seenLook.has(lookKey)) continue;
        const family = Math.floor((((190 + look.bodyDeg) % 360) / 60)) % 6;
        if (requireNewFamily && seenFamily.has(family)) continue;
        seenLook.add(lookKey);
        seenFamily.add(family);
        roster.push(h);
      }
    };
    pick(true);   // まず全色系統を揃える
    pick(false);  // 足りなければルック違いで補充
    // デモ走行(実チャンピオン不在)はdna任せだと色が偏る — 6系統を明示割当。
    // 実効色相=(190+deg)%360 が 0/60/120/180/240/300 になる回転角。
    const DEMO_DEGS = [170, 230, 290, 350, 50, 110];
    const DEMO_ARCHS = ['v2', 'v3', 'v4', 'v2', 'v3', 'v4'] as const;

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
            arch: demo ? DEMO_ARCHS[i % 6] : deriveNftLook(h.dna_hash, h.name).arch,
            coatDeg: demo ? DEMO_DEGS[i % 6] : deriveNftLook(h.dna_hash, h.name).bodyDeg,
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
        // ループ構成: 「最終直線→ゴール」だけを見せる(発進のもたつきなし、
        // 毎周ゴール演出で締まる)。残り38秒地点へシーク
        const dur = (el as unknown as { race?: { duration?: number } }).race?.duration ?? 90;
        el.seek?.(Math.max(0, dur - 38));
        // 視覚QA用: ?heroseek=<秒> でレース途中へ直行(スクリーンショット検証の決定論化)
        const qa = new URLSearchParams(window.location.search).get('heroseek');
        if (qa && Number.isFinite(Number(qa))) el.seek?.(Number(qa));
      } catch (err) {
        console.error('ChampionHero race build failed:', err);
        setState('failed');
      }
    };

    addScript('/champions/keiba/engine.js?v=20260709w')
      .then(() => addScript('/champions/keiba/renderer.js?v=20260709w'))
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
          el.addEventListener('sdready', () => setState('running'));
          el.addEventListener('finished', () => {
            // ゴール演出(金のフラッシュ+FINISH)→ 次のシードで最終直線から再開
            setFinishFlash(true);
            seedRef.current += 1;
            setTimeout(() => {
              setFinishFlash(false);
              buildAndRun();
            }, 2600);
          });
          wrap.appendChild(el);
          cvRef.current = el;
        }
        buildAndRun();
        // sdready(スプライト準備完了)までLOADING表示を維持。万一イベントが
        // 来なくても15秒で開放(フォールバック)
        setTimeout(() => setState((v) => (v === 'loading' ? 'running' : v)), 15000);
      })
      .catch(() => { if (!cancelled) setState('failed'); });
    return () => { cancelled = true; };
  }, [state, horses, demo]);

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
      {finishFlash && (
        <div className={s.heroFinish} aria-hidden="true">
          <div className={s.heroFinishText}>FINISH</div>
        </div>
      )}
      <button
        type="button"
        className={s.heroSound}
        aria-label={soundOn ? 'サウンドをオフ' : 'サウンドをオン'}
        onClick={() => setSoundOn((v) => !v)}
      >
        {soundOn ? '♪ SOUND ON' : '♪ SOUND OFF'}
      </button>
      <div className={s.heroOverlay}>
        <div className={s.heroKicker}>WEEKLY COMPETITION</div>
        <div className={s.heroTitle}>CHAMPION LEAGUE</div>
        <div className={s.heroComing}>COMING SOON</div>
        <div className={s.heroNote}>アクティブユーザー 10,000人 到達で開幕</div>
      </div>
    </div>
  );
}
