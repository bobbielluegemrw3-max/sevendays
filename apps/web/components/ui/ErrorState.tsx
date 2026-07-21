import type { ReactNode } from 'react';
import s from './error-state.module.css';

/* 共通エラー表示(UI基盤 3-3)。
 *
 * 監査時点で「失敗の見せ方」が約30コンポーネントで自作されており、失敗を
 * 成功と同じ灰色で出している箇所や `window.alert()` まであった。ここに
 * 「アイコン + 何が起きたか + 次の一手」の型を1つ作り、以後はこれを配る。
 *
 * 方針:
 *  - **原因だけを出して終わらない。** 必ず次の一手(action)を置く
 *  - `aria-live` で読み上げに届ける。既定は assertive(操作の結果=即時)、
 *    画面全体の失敗表示など最初から出ているものは polite に落とす
 *  - 装飾は足さない。器は既存のパネル語彙(--radius / --border)のまま
 *  - サーバー/クライアントどちらからも使える(状態を持たない)
 */
export function ErrorState({
  title,
  body,
  detail,
  tone = 'error',
  live = 'assertive',
  children,
  className,
}: {
  title: string;
  body?: string | undefined;
  /** 参照ID(digest)など、問い合わせ時に使う手がかり。 */
  detail?: string | undefined;
  /** error = 失敗(赤) / notice = 見つからない等(中立)。 */
  tone?: 'error' | 'notice';
  live?: 'assertive' | 'polite';
  /** 次の一手(ボタン・リンク)。 */
  children?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={`${s.box} ${tone === 'error' ? s.error : s.notice} ${className ?? ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={live}
    >
      <span className={s.icon} aria-hidden="true">
        {tone === 'error' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5" />
            <path d="M12 16.4v.1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5 21 21" />
          </svg>
        )}
      </span>
      <div className={s.main}>
        <div className={s.title}>{title}</div>
        {body ? <p className={s.body}>{body}</p> : null}
        {children ? <div className={s.actions}>{children}</div> : null}
        {detail ? <div className={s.detail}>{detail}</div> : null}
      </div>
    </div>
  );
}
