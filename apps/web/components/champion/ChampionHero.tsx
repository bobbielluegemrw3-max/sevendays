'use client';

import { useEffect, useRef, useState } from 'react';
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
export function ChampionHero() {
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
