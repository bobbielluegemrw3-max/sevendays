'use client';

import { useEffect, useRef, useState } from 'react';
import type { AppDict } from '@/lib/i18n-shared';
import s from '../../app/champion.module.css';

/**
 * CHAMPION LEAGUE ヒーロー(2026-07-12): 旧WebGL描画(engine/renderer/three.js、
 * 初回ロード数秒〜15秒)を、同じ画面をフレーム単位で録画した10秒シームレス
 * ループ動画に置換(オーナー決定 — Seedance生成は品質不足でボツ)。
 * ポスター画像が即表示 → 動画4.4MB(Cloudflare CDNキャッシュ)。
 * 将来より高品質な映像に差し替える場合も hero-loop.mp4 の交換だけで済む。
 * 旧描画資産は /champions/keiba/ に保存(録画の再生成手順は下記)。
 * 再生成: /dev/champion-preview を puppeteer で seek() ステップ録画 →
 * ffmpeg xfade でループ化(1920×1080キャプチャ→720pエンコード)。
 */
export function ChampionHero({ t }: { t: AppDict['champion'] }) {
  // 足音(Raceページと同じ hoofbeats.mp3)。自動再生はブラウザが禁止のため
  // 既定OFF・ボタン操作(ユーザージェスチャー)でONにする
  const [soundOn, setSoundOn] = useState(false);
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

  return (
    <div className={s.hero}>
      <div className={s.heroCanvas}>
        {/* 自動再生不可の環境(iOS低電力モード等)はポスターが表示され続ける */}
        <video
          className={s.heroVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/champions/hero-poster.webp"
          aria-hidden="true"
        >
          <source src="/champions/hero-loop.mp4" type="video/mp4" />
        </video>
      </div>
      <button
        type="button"
        className={s.heroSound}
        aria-label={soundOn ? t.sound_on_aria : t.sound_off_aria}
        onClick={() => setSoundOn((v) => !v)}
      >
        {soundOn ? '♪ SOUND ON' : '♪ SOUND OFF'}
      </button>
      <div className={s.heroOverlay}>
        <div className={s.heroImm}>IMMORTALITY</div>
        <h1 className={s.heroH1}>
          {t.hero_title_a}
          <br />
          <span className={s.heroH1Gold}>{t.hero_title_b}</span>
        </h1>
        <div className={s.heroPill}>
          <span className={s.heroPillName}>CHAMPION</span>
          <span className={s.heroPillDiv} />
          <span className={s.heroPillVal}>{t.pill_val}</span>
        </div>
        {/* 消滅(多くの馬が去る) → 不滅(一頭が残る) の対比。赤は危険色として最小限。 */}
        <div className={s.heroContrast}>
          <div className={s.heroColR}>
            <div className={s.heroCKleave}>{t.leave_k}</div>
            <div className={s.heroCVleave}>{t.leave_v}</div>
          </div>
          <span className={s.heroArrow}>→</span>
          <div className={s.heroColL}>
            <div className={s.heroCKstay}>{t.stay_k}</div>
            <div className={s.heroCVstay}>{t.stay_v}</div>
          </div>
        </div>
        <p className={s.heroSub}>{t.hero_sub2}</p>
      </div>
    </div>
  );
}
