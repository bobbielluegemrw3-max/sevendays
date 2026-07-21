'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { localDate } from '@/lib/format-time';
import s from '../app/admin.module.css';
import { ErrorLine } from '@/components/ui/ErrorLine';

/* /admin/promo — セミナー特典馬(Decision 095)。
 * 在庫(運営厩舎)・引換コード生成/一覧・直接配布。Ops Console意匠準拠。 */

export interface AdminPromo {
  stable_email: string;
  stock_count: number;
  stock: { id: string; name: string; current_day: number }[];
  codes: {
    code: string;
    campaign: string;
    expires_at: string | null;
    redeemed_at: string | null;
    redeemed_email: string | null;
    horse_name: string | null;
    created_at: string;
  }[];
}

function dl(filename: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function AdminPromoView({ data }: { data: AdminPromo }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState('');
  const [count, setCount] = useState(10);
  const [expires, setExpires] = useState(30);
  const [generated, setGenerated] = useState<string[] | null>(null);
  const [giftEmail, setGiftEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (busy || !campaign.trim()) return;
    setBusy(true); setError(null); setNotice(null);
    const r = await apiFetch<{ codes: string[] }>('/api/v1/admin/promo/codes', {
      method: 'POST',
      body: { campaign: campaign.trim(), count, expires_in_days: expires },
    });
    setBusy(false);
    if (r.status === 200) {
      setGenerated((r.body as { codes: string[] }).codes);
      router.refresh();
    } else setError(errorMessage(r.body) ?? 'コード生成に失敗しました。');
  };

  const gift = async () => {
    if (busy || !giftEmail.includes('@')) return;
    setBusy(true); setError(null); setNotice(null);
    const r = await apiFetch<{ horse_name: string }>('/api/v1/admin/promo/gift', {
      method: 'POST',
      body: { recipient_email: giftEmail.trim() },
    });
    setBusy(false);
    if (r.status === 200) {
      setNotice(`${(r.body as { horse_name: string }).horse_name} を ${giftEmail.trim()} へ配布しました。`);
      setGiftEmail('');
      router.refresh();
    } else setError(errorMessage(r.body) ?? '配布に失敗しました。');
  };

  const unredeemed = data.codes.filter((c) => !c.redeemed_at).length;

  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>プロモ配布</h1>
        </div>
      </div>

      <div className={s.statRow}>
        <div className={s.stat}>
          <div className={s.statK}>配布可能な在庫</div>
          <div className={s.statV}>{data.stock_count}<span className={s.u}>頭</span></div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>未使用コード</div>
          <div className={s.statV}>{unredeemed}<span className={s.u}>枚</span></div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>引換済み</div>
          <div className={s.statV}>{data.codes.length - unredeemed}<span className={s.u}>件</span></div>
        </div>
        <div className={s.stat}>
          <div className={s.statK}>運営厩舎</div>
          <div className={s.statV} style={{ fontSize: '0.8rem' }}>{data.stable_email}</div>
        </div>
      </div>

      {notice ? <p className="ok">{notice}</p> : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}

      <div className={s.sec}>在庫の仕込み方(運用メモ)</div>
      <div className={s.empty}>
        運営厩舎アカウントで通常の購入予約をする → その夜20:00に誕生 → <b>翌日から配布可能</b>。
        予約数の上限は実質なし(残高が制約・1操作100頭まで、Decision 096)。セミナー人数に合わせて
        前日までに仕込むこと。配布は若いDAYの馬から。余った在庫は運営の馬として走り続けます
        (Day7走破で200 USDTが運営に戻る=自己清算)。
      </div>

      <div className={s.sec}>直接配布(セミナー現地・上限なし・監査記録あり)</div>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="email"
          placeholder="参加者のメールアドレス"
          value={giftEmail}
          onChange={(e) => setGiftEmail(e.target.value)}
          style={{ minWidth: 260 }}
          disabled={busy}
        />
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => void gift()} disabled={busy || !giftEmail.includes('@')}>
          1頭を配布する
        </button>
      </div>

      <div className={s.sec}>引換コード生成(参加者セルフ引換用)</div>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="キャンペーン名(例: KL-seminar-08)"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          style={{ minWidth: 220 }}
          disabled={busy}
        />
        <input
          type="number"
          min={1}
          max={500}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          style={{ width: 90 }}
          disabled={busy}
          aria-label="枚数"
        />
        <span className={s.u}>枚 · 有効期限</span>
        <input
          type="number"
          min={1}
          max={365}
          value={expires}
          onChange={(e) => setExpires(Number(e.target.value))}
          style={{ width: 80 }}
          disabled={busy}
          aria-label="有効日数"
        />
        <span className={s.u}>日</span>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => void generate()} disabled={busy || !campaign.trim()}>
          コードを生成
        </button>
      </div>
      {generated ? (
        <div style={{ marginTop: 10 }}>
          <div className={s.badges}>
            {generated.map((c) => (
              <span key={c} className={s.tag}>{c}</span>
            ))}
          </div>
          <button
            type="button"
            className={s.btn}
            style={{ marginTop: 8 }}
            onClick={() => dl(`promo-${campaign.trim() || 'codes'}.csv`, `code\n${generated.join('\n')}\n`)}
          >
            CSVをダウンロード
          </button>
        </div>
      ) : null}

      <div className={s.sec}>コード一覧(最新500)</div>
      {data.codes.length === 0 ? (
        <div className={s.empty}>コードはまだありません。</div>
      ) : (
        <>
          <div className={`${s.tableWrap} ${s.desktopTable}`}>
            <table className={s.tbl}>
              <thead>
                <tr>
                  <th>コード</th><th>キャンペーン</th><th>状態</th><th>引換者</th><th>配布馬</th><th>期限</th>
                </tr>
              </thead>
              <tbody>
                {data.codes.map((c) => (
                  <tr key={c.code}>
                    <td className={s.mono}>{c.code}</td>
                    <td>{c.campaign}</td>
                    <td>
                      {c.redeemed_at
                        ? <span className={`${s.st} ${s.stGood}`}>引換済み</span>
                        : <span className={`${s.st} ${s.stNeutral}`}>未使用</span>}
                    </td>
                    <td className={s.mono}>{c.redeemed_email ?? '—'}</td>
                    <td>{c.horse_name ?? '—'}</td>
                    <td className={s.mono}>{c.expires_at ? localDate(c.expires_at) : '無期限'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {data.codes.map((c) => (
              <div key={c.code} className={s.mc}>
                <div className={s.mcTop}>
                  <span className={s.mcName}>{c.code}</span>
                  {c.redeemed_at
                    ? <span className={`${s.st} ${s.stGood}`}>引換済み</span>
                    : <span className={`${s.st} ${s.stNeutral}`}>未使用</span>}
                </div>
                <div className={s.mcGrid}>
                  <div className={s.mcCell}><span className={s.k}>CAMPAIGN</span><span className={s.v}>{c.campaign}</span></div>
                  <div className={s.mcCell}><span className={s.k}>配布馬</span><span className={s.v}>{c.horse_name ?? '—'}</span></div>
                  <div className={s.mcCell}><span className={s.k}>引換者</span><span className={s.v}>{c.redeemed_email ?? '—'}</span></div>
                  <div className={s.mcCell}><span className={s.k}>期限</span><span className={s.v}>{c.expires_at ? localDate(c.expires_at) : '無期限'}</span></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
