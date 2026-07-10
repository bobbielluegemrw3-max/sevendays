import { serverApiOrLogin } from '@/lib/server-api';
import { LedgerView } from '@/components/LedgerView';
import s from '../races.module.css';

/**
 * /ledger — 透明性台帳(オーナー承認 2026-07-10)。
 * BURN率の宣言の代わりに、毎晩の全記録(出走/生存/BURN/DAY7/成約/新規発行)を
 * カレンダー形式で公開し、CSVで持ち帰れるようにする。数値は全て実データ、
 * 率は表示しない(誰でも算出できる)。検証は各レースのコミット・リビールページへ。
 */
export default async function LedgerPage() {
  await serverApiOrLogin('/api/v1/me');
  return (
    <div className={s.wrap}>
      <div className={s.h1}>台帳 · LEDGER</div>
      <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.4rem', lineHeight: 1.8 }}>
        毎晩のレースと売買の全記録を、そのまま公開しています。ユーザーは匿名ID表示です。
        各日の「全馬の結果と検証」から、公開シードによる再計算(コミット・リビール)で
        結果が操作不能であることを誰でも確認できます。
      </p>
      <LedgerView />
    </div>
  );
}
