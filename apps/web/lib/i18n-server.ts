import { cookies } from 'next/headers';
import { isLang, type Lang } from '@/lib/i18n';

/* サーバー専用: cookie `sdd_lang` から選択言語を得る。next/headers を使うため
 * クライアントから import してはいけない(辞書側 lib/i18n.ts と分離)。
 * (server-only パッケージ未導入のため import ガードは付けない — 分離で担保) */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get('sdd_lang')?.value;
  return isLang(v) ? v : 'ja';
}
