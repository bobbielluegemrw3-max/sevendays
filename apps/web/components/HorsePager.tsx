'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/horse-detail.module.css';

/* ============================================================================
 * HorsePager — 馬詳細ページの馬アート左右に置く「前/次の馬へ」ページャ。
 * 厩舎(/horses)に戻らず前後の馬の詳細ページへ直接移動できる。
 *
 *  - ‹ › 矢印は「同じグループ内」だけを巡回(出走中の馬なら出走中だけ)。
 *    キーボード ← / → でも移動(入力欄にフォーカス中は無効)。
 *  - 「未調教の次へ →」: 今日まだ調教していない次の出走中の馬へ一気に飛ぶ。
 *    残り頭数バッジ付き。全頭調教済みなら「✓ 本日ぶん調教完了」を表示。
 *
 * 並び順は厩舎の表示順(グループ内 value_desc = 日数→レアリティ)と一致。
 * ========================================================================== */

export interface PagerNav {
  /** グループ名(出走中 / 出品中 / チャンピオン / 消滅 / 厩舎) */
  groupLabel: string;
  prev: { id: string; name: string } | null;
  next: { id: string; name: string } | null;
  index: number; // 1始まり(グループ内で何頭目か)
  total: number; // グループ内の頭数
  /** 未調教の次の出走中馬(なければ null)。出走中グループのみ算出。 */
  nextUntrained: { id: string; name: string } | null;
  /** 現在の馬を除く、未調教の出走中馬の残数。 */
  untrainedRemaining: number;
  /** 出走中グループが全頭調教済みか。 */
  allTrained: boolean;
}

export function HorsePager({ nav, t }: { nav: PagerNav; t: AppDict['horse'] }) {
  const router = useRouter();
  const { groupLabel, prev, next, index, total, nextUntrained, untrainedRemaining, allTrained } = nav;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      // scroll: false — 切替のたびに先頭へ戻るとヒーローが跳ねて見える(2026-07-19)
      if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); router.push(`/horses/${prev.id}`, { scroll: false }); }
      else if (e.key === 'ArrowRight' && next) { e.preventDefault(); router.push(`/horses/${next.id}`, { scroll: false }); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, router]);

  return (
    <div className={s.pager}>
      {prev ? (
        <Link
          href={`/horses/${prev.id}`}
          className={`${s.pagerBtn} ${s.pagerPrev}`}
          aria-label={fill(t.pgr_prev_tpl, { name: prev.name })}
          title={fill(t.pgr_prev_tpl, { name: prev.name })}
          prefetch
          scroll={false}
        >
          ‹
        </Link>
      ) : (
        <span className={`${s.pagerBtn} ${s.pagerPrev} ${s.pagerOff}`} aria-hidden="true">‹</span>
      )}

      <div className={s.pagerTop}>
        <span className={s.pagerPos}>
          {groupLabel} · {index} / {total}
        </span>
        {nextUntrained ? (
          <Link
            href={`/horses/${nextUntrained.id}`}
            className={s.pagerJump}
            title={fill(t.pgr_next_tpl, { name: nextUntrained.name })}
            prefetch
            scroll={false}
          >
            {t.pgr_jump}
            {untrainedRemaining > 0 ? <span className={s.pagerJumpN}>{fill(t.pgr_rest_tpl, { n: untrainedRemaining })}</span> : null}
          </Link>
        ) : allTrained ? (
          <span className={s.pagerDone}>{t.pgr_all_done}</span>
        ) : null}
      </div>

      {next ? (
        <Link
          href={`/horses/${next.id}`}
          className={`${s.pagerBtn} ${s.pagerNext}`}
          aria-label={fill(t.pgr_next_tpl, { name: next.name })}
          title={fill(t.pgr_next_tpl, { name: next.name })}
          prefetch
          scroll={false}
        >
          ›
        </Link>
      ) : (
        <span className={`${s.pagerBtn} ${s.pagerNext} ${s.pagerOff}`} aria-hidden="true">›</span>
      )}
    </div>
  );
}
