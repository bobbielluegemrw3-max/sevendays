'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import s from './app-select.module.css';

/* ============================================================================
 * AppSelect — ネイティブ<select>の置き換え(2026-07-16 オーナー依頼)。
 * モバイルのネイティブピッカーは貧相なため、一般的なアプリと同じUXにする:
 *   - モバイル(≤560px): 画面下からのボトムシート(ハンドル+見出し+チェック付き一覧)
 *   - デスクトップ: トリガー直下のアンカー式メニュー(LanguageSwitcherと同系)
 *
 * 使い方: 既存selectの className をそのまま trigger(button)に引き継ぐ。
 *   - className あり → そのクラスが見た目を完全定義している前提(既存の .select 等)
 *   - className なし → s.triggerSolo(globals.cssのselect既定と同じ見た目)
 * options の group を指定するとメニュー内にグループ見出しを描画(旧optgroup)。
 * A11y: role=listbox/option・Escで閉じる・背面タップで閉じる・閉じたらトリガーへ
 * フォーカス返却。選択で即closeする単純パネルなのでフォーカストラップは持たない。
 * ========================================================================== */

export interface AppSelectOption {
  value: string;
  label: string;
  /** グループ見出し(旧optgroup)。連続する同名groupの先頭にだけ見出しが出る。 */
  group?: string;
}

interface MenuPos {
  top?: number;
  bottom?: number;
  left: number;
  minWidth: number;
}

export function AppSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled = false,
}: {
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  /** a11yラベル兼モバイルシートの見出し。 */
  ariaLabel: string;
  /** 既存selectのクラスをそのまま渡す(見た目を完全定義していること)。 */
  className?: string | undefined;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const close = useCallback(() => {
    setOpen(false);
    btnRef.current?.focus({ preventScroll: true });
  }, []);

  const openMenu = () => {
    const isMobile = window.matchMedia('(max-width: 560px)').matches;
    setMobile(isMobile);
    if (!isMobile && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuW = Math.max(r.width, 180);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - menuW - 8));
      const openUp = r.bottom + 300 > window.innerHeight && r.top > window.innerHeight - r.bottom;
      setPos(
        openUp
          ? { bottom: window.innerHeight - r.top + 6, left, minWidth: r.width }
          : { top: r.bottom + 6, left, minWidth: r.width },
      );
    } else {
      setPos(null);
    }
    setOpen(true);
  };

  // 開いている間: Escで閉じる・(デスクトップ)外部スクロール/リサイズで閉じる・
  // (モバイル)背面スクロールをロック。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // 開く直前のスクロール(慣性・scrollIntoView等)はイベントが非同期で
    // 開いた後に届くことがある — 開直後150msは無視して誤クローズを防ぐ。
    const openedAt = performance.now();
    const onScroll = (e: Event) => {
      if (performance.now() - openedAt < 150) return;
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    if (!mobile) {
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', close);
    } else {
      document.documentElement.style.overflow = 'hidden';
    }
    // 開いたら選択中の項目へフォーカス(キーボード/スクリーンリーダー動線)。
    // preventScroll必須: フォーカススクロールが上の「外部スクロールで閉じる」を
    // 誤発動させる。モバイルはタッチ主体なのでフォーカス移動しない(輪郭も出ない)。
    if (!mobile) {
      menuRef.current
        ?.querySelector<HTMLButtonElement>(`.${s.itemOn}`)
        ?.focus({ preventScroll: true });
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      document.documentElement.style.overflow = '';
    };
  }, [open, mobile, close]);

  const choose = (v: string) => {
    setOpen(false);
    btnRef.current?.focus({ preventScroll: true });
    if (v !== value) onChange(v);
  };

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${s.triggerBase} ${className ?? s.triggerSolo}`}
        onClick={() => (open ? close() : openMenu())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={s.triggerLabel}>{selected?.label ?? ''}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`${s.chev} ${open ? s.chevOpen : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div className={s.layer}>
              <div className={s.backdrop} onClick={close} />
              <ul
                ref={menuRef}
                className={s.menu}
                role="listbox"
                aria-label={ariaLabel}
                style={pos ? { top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: pos.minWidth } : undefined}
              >
                <li className={s.sheetHead} aria-hidden="true">
                  <div className={s.sheetHandle} />
                  <div className={s.sheetTitle}>{ariaLabel}</div>
                </li>
                {options.map((o) => {
                  const head = o.group && o.group !== lastGroup ? o.group : null;
                  lastGroup = o.group;
                  const on = o.value === value;
                  return (
                    <li key={o.value} role="option" aria-selected={on}>
                      {head ? <div className={s.groupHead}>{head}</div> : null}
                      <button
                        type="button"
                        className={`${s.item} ${on ? s.itemOn : ''}`}
                        onClick={() => choose(o.value)}
                      >
                        <span className={s.check} aria-hidden="true">
                          {on ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : null}
                        </span>
                        <span className={s.itemLabel}>{o.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
