import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { burnSlotRangeV1 } from '@sevendays/domain';
import { getAccessToken } from '@/lib/server-api';
import { withSqlClient } from '@/lib/db';
import { Landing } from '@/components/Landing';
import { isLang, type Lang } from '@/lib/landing-i18n';

/**
 * Root is always the public landing page. Signed-in players are redirected to
 * /dashboard so the URL reflects the auth state (bookmarkable, analysable,
 * and the landing stays an anonymous-only page).
 */

/** 今夜の全体出走枠(Decision 093: 少頭数有利の可視化)。実データ・取得失敗でもLPは普通に出す。
 *  LPは匿名トラフィックの入口なのでプロセス内30秒キャッシュ(derby statusと同じ流儀)。 */
let fieldCache: { at: number; value: { entrants: number; min: number; max: number } | null } | null = null;

async function tonightField(): Promise<{ entrants: number; min: number; max: number } | null> {
  if (fieldCache && Date.now() - fieldCache.at < 30_000) return fieldCache.value;
  try {
    const entrants = await withSqlClient(async (client) => {
      const r = await client.query<{ entrants: number }>(
        `select count(*)::int as entrants from horses h
         where h.status = 'ACTIVE'
           and not exists (select 1 from market_listings ml
                           where ml.horse_id = h.id and ml.status = 'LISTED' and ml.source = 'MANUAL')`,
      );
      return r.rows[0]!.entrants;
    });
    const slots = burnSlotRangeV1(entrants);
    const value = entrants > 0 ? { entrants, min: slots.min, max: slots.max } : null;
    fieldCache = { at: Date.now(), value };
    return value;
  } catch {
    return null; // 失敗はキャッシュしない(次のリクエストで再試行)
  }
}

export default async function Home() {
  const token = await getAccessToken();
  if (token) redirect('/dashboard');
  // 言語(TOPページ): cookie sdd_lang を優先、なければブラウザのAccept-Languageで初期推定、既定は日本語。
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get('sdd_lang')?.value;
  let lang: Lang = 'ja';
  if (isLang(cookieLang)) lang = cookieLang;
  return <Landing tonightField={await tonightField()} lang={lang} />;
}
