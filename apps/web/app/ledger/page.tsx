import { serverApiOrLogin } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { APP_COPY } from '@/lib/i18n';
import { LedgerView } from '@/components/LedgerView';
import s from '../races.module.css';

/**
 * /ledger — 透明性台帳(オーナー承認 2026-07-10)。
 * BURN率の宣言の代わりに、毎晩の全記録(出走/生存/BURN/DAY7/成約/新規発行)を
 * カレンダー形式で公開し、CSVで持ち帰れるようにする。数値は全て実データ、
 * 率は表示しない(誰でも算出できる)。検証は各レースのコミット・リビールページへ。
 */
export default async function LedgerPage() {
  const lang = await getLang();
  const t = APP_COPY[lang].ledger;
  await serverApiOrLogin('/api/v1/me');
  return (
    <div className={s.wrap}>
      <div className={s.h1}>{t.title}</div>
      <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.4rem', lineHeight: 1.8 }}>
        {t.intro}
      </p>
      <LedgerView lang={lang} />
    </div>
  );
}
