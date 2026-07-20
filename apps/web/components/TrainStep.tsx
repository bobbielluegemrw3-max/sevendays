'use client';

import type { ReactNode } from 'react';
import s from '../app/train-step.module.css';

/**
 * 調教パネルの1ステップ(案B・2026-07-20 オーナー決定)。
 * ①調教を確定 → ②調教アイテムで上乗せ → ③次のレースに備える。
 * ①②は TrainingFormV2、③は ItemPrepPanelV3 が描くため、見た目を共有する。
 *
 *  - done   : 済み(緑の✓・1行サマリに畳む)
 *  - active : 今できること(操作UIを開く)
 *  - locked : まだできない(前段の完了待ち・薄く表示)
 */
export type StepState = 'done' | 'active' | 'locked';

export function TrainStep({
  n,
  title,
  state,
  first = false,
  optional = false,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  /** 先頭ステップは上罫線と上余白を持たない。 */
  first?: boolean;
  /** 見出しの後ろに「任意」を添える(アイテムの2段)。 */
  optional?: boolean;
  children?: ReactNode;
}) {
  const markCls =
    state === 'done' ? s.markDone : state === 'active' ? s.markActive : s.markLocked;
  return (
    <div
      className={`${s.step} ${first ? s.stepFirst : s.stepSep} ${state === 'locked' ? s.stepLocked : ''}`}
    >
      <span className={`${s.mark} ${markCls}`} aria-hidden="true">
        {state === 'done' ? '✓' : n}
      </span>
      <div className={s.body}>
        <span className={`${s.title} ${state === 'done' ? s.titleDone : ''}`}>
          {title}
          {optional ? <span className={s.opt}>任意</span> : null}
        </span>
        {children}
      </div>
    </div>
  );
}

/** 「使わない」「やっぱり使う」の控えめなリンクボタン。 */
export function StepLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={s.link} onClick={onClick}>
      {children}
    </button>
  );
}

export const stepStyles = s;
