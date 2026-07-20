'use client';

import { startTransition } from 'react';
import type { useRouter } from 'next/navigation';

type AppRouter = ReturnType<typeof useRouter>;

/**
 * 演出後の低優先サーバー再取得(2026-07-20 オーナー指摘: 使用時のかくつき)。
 *
 * router.refresh() はページ全体のRSC再レンダー(DB再クエリ込み)で、演出の
 * 真っ最中に走るとアニメーションを引っかける。ミューテーション直後の見た目は
 * クライアント側のローカル状態+FXイベントが既に正しい値を示しているため
 * (Decision 112: サーバー実値を演出に渡している)、台帳との同期は演出が
 * 終わってから startTransition(低優先)で行えばよい。
 */
export function refreshAfterFx(router: AppRouter, delayMs: number): void {
  setTimeout(() => {
    startTransition(() => router.refresh());
  }, delayMs);
}

/** 演出のないミューテーション用: 即時だが低優先で再取得する。 */
export function refreshSoft(router: AppRouter): void {
  startTransition(() => router.refresh());
}
