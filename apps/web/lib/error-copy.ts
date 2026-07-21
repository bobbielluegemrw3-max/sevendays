/* ============================================================================
 * エラー面の文言(UI基盤 3-3)。
 *
 * `app/error.tsx` / `app/global-error.tsx` は Next.js の仕様でクライアント
 * コンポーネントでなければならず、サーバー親から props で文言を受け取れない。
 * したがって APP_COPY(5言語辞書・raw 136KB)を import すると全ページの
 * クライアントバンドルに辞書が混入する(lib/i18n-shared.ts の分離則)。
 *
 * そのため「エラー面だけの小さな辞書」をここに置く。data のみ・server 専用の
 * API を使わないので、サーバー側(`app/not-found.tsx`)からも同じものを使える。
 * ========================================================================== */

import type { Lang } from '@/lib/i18n-shared';

export interface ErrorCopy {
  /** 実行時エラー(error.tsx / global-error.tsx) */
  err_title: string;
  err_body: string;
  err_retry: string;
  err_home: string;
  /** 原因の手がかり(Next.js の digest)。問い合わせ時に使う */
  err_ref: string;
  /** 404 */
  nf_title: string;
  nf_body: string;
  nf_home: string;
}

const JA: ErrorCopy = {
  err_title: '表示できませんでした',
  err_body: 'この画面の読み込みに失敗しました。通信が途切れたか、一時的な不具合です。あなたの馬・残高・レース結果には影響ありません。',
  err_retry: 'もう一度読み込む',
  err_home: 'ダッシュボードへ',
  err_ref: '参照ID',
  nf_title: 'ページが見つかりません',
  nf_body: 'このURLのページはありません。移動または削除された可能性があります。',
  nf_home: 'ダッシュボードへ',
};

export const ERROR_COPY: Record<Lang, ErrorCopy> = {
  ja: JA,
  en: {
    err_title: 'Could not display this page',
    err_body: 'Loading failed — the connection dropped or something went wrong on our side. Your horses, balance and race results are unaffected.',
    err_retry: 'Try again',
    err_home: 'Go to dashboard',
    err_ref: 'Reference',
    nf_title: 'Page not found',
    nf_body: 'There is no page at this URL. It may have moved or been removed.',
    nf_home: 'Go to dashboard',
  },
  zh: {
    err_title: '无法显示此页面',
    err_body: '加载失败 — 可能是网络中断或临时故障。您的马匹、余额与比赛结果均不受影响。',
    err_retry: '重新加载',
    err_home: '前往仪表板',
    err_ref: '参考编号',
    nf_title: '找不到页面',
    nf_body: '此网址没有对应的页面，可能已移动或被删除。',
    nf_home: '前往仪表板',
  },
  ko: {
    err_title: '표시할 수 없습니다',
    err_body: '이 화면을 불러오지 못했습니다. 연결이 끊겼거나 일시적인 문제입니다. 보유 말·잔액·레이스 결과에는 영향이 없습니다.',
    err_retry: '다시 불러오기',
    err_home: '대시보드로',
    err_ref: '참조 ID',
    nf_title: '페이지를 찾을 수 없습니다',
    nf_body: '이 URL에는 페이지가 없습니다. 이동되었거나 삭제되었을 수 있습니다.',
    nf_home: '대시보드로',
  },
  ms: {
    err_title: 'Tidak dapat memaparkan halaman ini',
    err_body: 'Gagal dimuatkan — sambungan terputus atau berlaku masalah sementara. Kuda, baki dan keputusan perlumbaan anda tidak terjejas.',
    err_retry: 'Cuba lagi',
    err_home: 'Ke papan pemuka',
    err_ref: 'Rujukan',
    nf_title: 'Halaman tidak dijumpai',
    nf_body: 'Tiada halaman pada URL ini. Ia mungkin telah dipindahkan atau dibuang.',
    nf_home: 'Ke papan pemuka',
  },
};

function isLang(v: string | undefined): v is Lang {
  return v === 'ja' || v === 'en' || v === 'zh' || v === 'ko' || v === 'ms';
}

/** クライアントから cookie `sdd_lang` を読む(サーバーの getLang と同じキー)。
 *  エラー面は親から lang を貰えないため、ここだけ自前で読む。 */
export function errorCopyFromCookie(): ErrorCopy {
  if (typeof document === 'undefined') return JA;
  const m = /(?:^|;\s*)sdd_lang=([^;]+)/.exec(document.cookie);
  const v = m?.[1];
  return isLang(v) ? ERROR_COPY[v] : JA;
}
