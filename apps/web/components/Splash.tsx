'use client';
// 起動スプラッシュ(2026-07-13・ゴリラ予想「B案」方式の移植): 初回アクセス時に
// 一瞬だけ全面ブランド画面を表示してフェードアウト。sessionStorageで同一
// セッション中は1回のみ(ページ間の遷移では再表示しない)。
// ブラウザ機能に依存しないため Safari/Chrome/PWA起動すべてで確実に動き、
// iOSのPWA白フラッシュ(apple-touch-startup-image は 657a32e でリバート)も
// 直後にこれが覆うことで実質解消する。表示時間の調整は t1/t2 の2定数のみ。
import { useEffect, useState } from 'react';
import s from './splash.module.css';

export function Splash() {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('sdd-splash')) {
      setGone(true);
      return;
    }
    const t1 = setTimeout(() => setFading(true), 900); // フェード開始
    const t2 = setTimeout(() => {
      setGone(true);
      sessionStorage.setItem('sdd-splash', '1');
    }, 1320);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div aria-hidden className={fading ? `${s.splash} ${s.fading}` : s.splash}>
      <div className={s.glow} />
      <div className={s.brand}>
        <span className={s.brandBar} />
        <span className={s.brandLock}>
          <span className={s.brandL1}>SEVEN&nbsp;DAYS</span>
          <span className={s.brandL2}>DERBY</span>
        </span>
      </div>
      <div className={s.tagline}>7日間のサバイバルレース — 毎晩20:00、全馬一斉に発走。</div>
      <div className={s.dots}>
        <span className={s.dot} />
        <span className={s.dot} style={{ animationDelay: '.18s' }} />
        <span className={s.dot} style={{ animationDelay: '.36s' }} />
      </div>
    </div>
  );
}
