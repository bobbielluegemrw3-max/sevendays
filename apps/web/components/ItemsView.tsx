'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import {
  BAND_LABEL,
  BAND_ORDER,
  TXN_META,
  type CatalogItem,
  type DailySetting,
  type InventoryData,
  type ItemTransaction,
} from '@/lib/items';
import {
  ITEM_SETTING_COEFFICIENT_V1,
  ITEM_SETTING_PROBABILITY_V1,
} from '@sevendays/domain';
import s from '../app/items.module.css';

/**
 * /items — アイテムショップ+インベントリ+ギフト+履歴(Decision 078/079) リデザイン。
 * 効果は全て公開ルール。日替わり係数「設定(1〜6)」はレースシードから決まり、
 * レース後に公開される(誰にも事前に分からない)。
 *
 * リデザイン: ①「今日の設定 1〜6」を確率+係数の可視バンドで説明 → ②マイアイテム
 * (絵つき) → ③ギフト(★個数を選べる=まとめ贈り) → ④帯フィルタつきカタログ
 * (★モバイルは2列・大きな画像) → ⑤アイテム履歴(★もらった/送った/使った/購入)。
 *
 * 変更点(API): ギフトは quantity を送る。履歴は transactions プロップ(任意)で受け、
 * GET /api/v1/items/transactions を page.tsx で結線する想定。それ以外の props/型/
 * buy の API・NftHorseArt・globals.css は不変。
 */
export function ItemsView({
  catalog,
  inventory,
  transactions = [],
  settingHistory = [],
  today,
  preview = false,
}: {
  catalog: CatalogItem[];
  inventory: InventoryData;
  /** アイテム履歴(新規・任意)。未結線なら履歴セクションは非表示。 */
  transactions?: ItemTransaction[];
  /** 公開済みの日々の設定結果(新規・任意・時系列)。空なら結果/カレンダーは非表示。 */
  settingHistory?: DailySetting[];
  /** 基準日 ISO(YYYY-MM-DD)。省略時は履歴の最新日を今日とみなす。 */
  today?: string;
  preview?: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [giftEmail, setGiftEmail] = useState('');
  const [giftKey, setGiftKey] = useState('');
  const [giftQty, setGiftQty] = useState(1);
  const [band, setBand] = useState<'ALL' | CatalogItem['band']>('ALL');

  const ownedByKey = useMemo(
    () => new Map(inventory.available.map((e) => [e.item_key, e.n])),
    [inventory],
  );
  const byKey = useMemo(() => new Map(catalog.map((c) => [c.key, c])), [catalog]);
  const giftable = inventory.available.filter((e) => byKey.get(e.item_key)?.giftable !== false);

  const BAND_RANGE: Record<string, string> = {
    BASIC: '1〜2 USDT',
    STANDARD: '3〜4 USDT',
    PREMIUM: '5〜7 USDT',
    BURN_DROP: 'Burn時にのみ授与',
  };

  const maxProb = Math.max(...ITEM_SETTING_PROBABILITY_V1.map(Number));
  const visibleBands = band === 'ALL' ? BAND_ORDER : [band];

  // ギフト個数: 選択中アイテムの所持数を上限に
  const giftMax = giftKey ? (ownedByKey.get(giftKey) ?? 1) : 1;
  const qty = Math.min(giftQty, Math.max(1, giftMax));

  // ---- 設定結果(本日/昨日)+ カレンダー ----
  const settingColor = (n: number): string =>
    n >= 5 ? 'var(--gold-bright)' : n >= 3 ? 'var(--cyan)' : 'var(--muted)';
  const settingTier = (n: number): string => (n >= 5 ? '高設定' : n >= 3 ? '標準' : '低設定');
  const sortedHistory = [...settingHistory].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sortedHistory[sortedHistory.length - 1];
  const todayISO = today ?? latest?.date ?? '';
  const todayRevealed = !!latest && latest.date === todayISO;
  const byDate = new Map(sortedHistory.map((e) => [e.date, e.setting]));
  const calBase = todayISO ? new Date(`${todayISO}T00:00:00Z`) : null;
  const calYear = calBase ? calBase.getUTCFullYear() : 0;
  const calMonth0 = calBase ? calBase.getUTCMonth() : 0;
  const calFirstDow = calBase ? new Date(Date.UTC(calYear, calMonth0, 1)).getUTCDay() : 0;
  const calDays = calBase ? new Date(Date.UTC(calYear, calMonth0 + 1, 0)).getUTCDate() : 0;
  const calTodayD = calBase ? calBase.getUTCDate() : -1;
  const calCells: Array<{ day: number; setting: number | undefined; isToday: boolean } | null> = [];
  for (let i = 0; i < calFirstDow; i++) calCells.push(null);
  for (let d = 1; d <= calDays; d++) {
    const iso = `${calYear}-${String(calMonth0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calCells.push({ day: d, setting: byDate.get(iso), isToday: d === calTodayD });
  }
  while (calCells.length % 7 !== 0) calCells.push(null);
  const calLabel = calBase ? `${calYear}年${calMonth0 + 1}月` : '';

  async function buy(item: CatalogItem) {
    if (preview) return;
    setBusyKey(item.key);
    setError(null);
    setMessage(null);
    const r = await apiFetch('/api/v1/items/purchase', {
      method: 'POST',
      body: { item_key: item.key, quantity: 1 },
    });
    setBusyKey(null);
    if (r.status !== 200) {
      setError(errorMessage(r.body) ?? '購入に失敗しました');
      return;
    }
    setMessage(`${item.name_ja} を購入しました。厩舎の馬詳細から使えます。`);
    router.refresh();
  }

  async function sendGift(e: React.FormEvent) {
    e.preventDefault();
    if (preview || !giftKey || !giftEmail) return;
    setBusyKey('gift');
    setError(null);
    setMessage(null);
    // ★ まとめ贈り: quantity を送る
    const r = await apiFetch('/api/v1/items/gift', {
      method: 'POST',
      body: { recipient_email: giftEmail, item_key: giftKey, quantity: qty },
    });
    setBusyKey(null);
    if (r.status !== 200) {
      setError(errorMessage(r.body) ?? 'ギフトの送付に失敗しました');
      return;
    }
    setMessage(`${byKey.get(giftKey)?.name_ja ?? giftKey} を ${qty}個 ${giftEmail} に送りました。`);
    setGiftEmail('');
    setGiftKey('');
    setGiftQty(1);
    router.refresh();
  }

  return (
    <>
      {/* ---- ① ヘッダ + 今日の設定 1〜6 ---- */}
      <section className="panel">
        <h1>ITEMS</h1>
        <p className={s.intro}>
          アイテムは馬のパラメータ(タイプ・調子・疲労・Day)との相性で効きます。
          1頭のレースに使えるのは1個まで。効果はすべて公開ルールです。
        </p>

        {/* 設定結果(本日/昨日) + 今夜は未確定 */}
        {latest ? (
          <div className={s.settingResult}>
            <div className={s.settingResultCard}>
              <div className={s.settingResultHead}>
                <span className={s.settingResultLabel}>{todayRevealed ? '本日の設定結果' : '昨日の設定結果'}</span>
                <span className={s.settingResultDate}>{latest.date.slice(5).replace('-', '/')}</span>
              </div>
              <div className={s.settingResultBody}>
                <span className={s.settingResultBig} style={{ color: settingColor(latest.setting) }}>{latest.setting}</span>
                <div>
                  <div className={s.settingResultCoeff}>×{ITEM_SETTING_COEFFICIENT_V1[latest.setting - 1]}</div>
                  <div className={s.settingResultTier}>{settingTier(latest.setting)}</div>
                </div>
              </div>
              <div className={s.settingResultNote}>
                {todayRevealed
                  ? '本日のレースで公開された設定です。今夜の設定は次のレースまで分かりません。'
                  : '前回のレースで公開された設定(参考)。今夜の設定は発走後の結果で公開されます。'}
              </div>
            </div>
            <div className={s.settingTonight}>
              <div className={s.settingTonightK}>今夜の設定</div>
              <div className={s.settingTonightQ}>?</div>
              <div className={s.settingTonightNote}>
                発走(20:00 GMT+8)まで、本人にも運営にも分かりません。昨日までの結果を参考にどうぞ。
              </div>
            </div>
          </div>
        ) : null}

        {/* 設定のしくみ(ルール表 — レース後に判明) */}
        <div className={s.setting}>
          <div className={s.settingHead}>
            <span className={s.settingTitle}>設定のしくみ 1〜6（レース後に判明）</span>
            <span className={s.settingLead}>
              下は各設定の係数と出現率＝抽選ルール。その日の数字ではありません
            </span>
          </div>
          <div className={s.settingGrid}>
            {ITEM_SETTING_COEFFICIENT_V1.map((coeff, i) => {
              const prob = Number(ITEM_SETTING_PROBABILITY_V1[i]) * 100;
              const hi = i >= 4;
              return (
                <div key={i} className={`${s.settingCell} ${hi ? s.settingHi : ''}`}>
                  <div className={s.settingN}>設定{i + 1}</div>
                  <div className={s.settingCoeff}>×{coeff}</div>
                  <div className={s.settingBar}><span style={{ width: `${(prob / maxProb) * 100}%` }} /></div>
                  <div className={s.settingProb}>出現 {prob}%</div>
                </div>
              );
            })}
          </div>
          <div className={s.settingNote}>
            設定が高いほどアイテム効果が強く出ます(×0.5〜×1.5)。使った馬がBurnされた場合、
            アイテム代金は全額サポートボーナスの財源になります。
          </div>
        </div>

        {/* 設定カレンダー */}
        {calBase ? (
          <div className={s.cal}>
            <div className={s.calHead}>
              <span className={s.calTitle}>設定カレンダー · {calLabel}</span>
              <span className={s.calLegend}>
                <span><b style={{ color: 'var(--muted)' }}>1–2</b> 低</span>
                <span><b style={{ color: 'var(--cyan)' }}>3–4</b> 標準</span>
                <span><b style={{ color: 'var(--gold-bright)' }}>5–6</b> 高</span>
              </span>
            </div>
            <div className={s.calGrid}>
              {['日', '月', '火', '水', '木', '金', '土'].map((w) => (
                <div key={w} className={s.calDow}>{w}</div>
              ))}
              {calCells.map((c, i) =>
                c === null ? (
                  <div key={`e${i}`} className={s.calEmpty} />
                ) : (
                  <div key={c.day} className={`${s.calCell} ${c.isToday ? s.calToday : ''}`}>
                    <span className={s.calDay}>{c.day}</span>
                    <span className={s.calNum} style={{ color: c.setting != null ? settingColor(c.setting) : 'var(--faint)' }}>
                      {c.setting != null ? c.setting : c.isToday && !todayRevealed ? '?' : ''}
                    </span>
                  </div>
                ),
              )}
            </div>
            <div className={s.calNote}>
              毎晩のレースで公開された設定の履歴。今日はどの設定になりそうか傾向の参考にどうぞ(抽選は毎回独立です)。
            </div>
          </div>
        ) : null}
      </section>

      {/* ---- ② マイアイテム ---- */}
      <section className="panel">
        <div className="section-head">
          <h2>マイアイテム</h2>
          <span className="muted">所持 {inventory.available.length}種 · 適用予定 {inventory.pending.length}件</span>
        </div>
        {inventory.available.length === 0 && inventory.pending.length === 0 ? (
          <p className="faint">まだアイテムを持っていません。下のカタログからどうぞ。</p>
        ) : (
          <>
            <div className={s.invGrid}>
              {inventory.available.map((e) => (
                <div key={e.item_key} className={s.invCard}>
                  <img className={s.thumb} src={`/items/${e.item_key}.webp`} alt="" width={46} height={46} loading="lazy" />
                  <div className={s.invBody}>
                    <div className={s.invName}>{byKey.get(e.item_key)?.name_ja ?? e.item_key}</div>
                    <div className={s.invDesc}>{byKey.get(e.item_key)?.description_ja}</div>
                  </div>
                  <span className={s.invCount}>× {e.n}</span>
                </div>
              ))}
            </div>
            {inventory.pending.length > 0 && (
              <div className={s.pendingList}>
                {inventory.pending.map((p) => (
                  <div key={p.usage_id} className={s.pendingRow}>
                    <img className={s.pendingThumb} src={`/items/${p.item_key}.webp`} alt="" width={34} height={34} loading="lazy" />
                    <span className={s.pendingBadge}>適用予定</span>
                    <b>{byKey.get(p.item_key)?.name_ja ?? p.item_key}</b>
                    <span className="muted">→ {p.horse_name}</span>
                    <span className={s.pendingDate}>{p.effective_race_date} のレース</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {giftable.length > 0 ? (
          <>
            <h3 className={s.giftHead}>仲間に贈る</h3>
            <form className={s.giftForm} onSubmit={(e) => void sendGift(e)}>
              <label>
                相手のメールアドレス
                <input type="email" value={giftEmail} onChange={(e) => setGiftEmail(e.target.value)} placeholder="friend@example.com" required />
              </label>
              <label>
                贈るアイテム
                <select value={giftKey} onChange={(e) => { setGiftKey(e.target.value); setGiftQty(1); }} required>
                  <option value="">選択…</option>
                  {giftable.map((e) => (
                    <option key={e.item_key} value={e.item_key}>
                      {byKey.get(e.item_key)?.name_ja ?? e.item_key}(所持 {e.n})
                    </option>
                  ))}
                </select>
              </label>
              {/* ★ まとめ贈り: 個数(所持数が上限) */}
              <label className={s.giftQty}>
                個数
                <select value={qty} onChange={(e) => setGiftQty(Number(e.target.value))} disabled={!giftKey}>
                  {Array.from({ length: Math.max(1, giftMax) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={busyKey === 'gift' || !giftKey || !giftEmail}>
                {giftKey && qty > 1 ? `${qty}個 贈る` : '贈る'}
              </button>
            </form>
            <div className={s.giftNote}>
              送付は即時確定で取り消せません。登録済みのメールアドレス宛にのみ届きます(1日20回まで)。
              同じアイテムをまとめて送るときは個数を選んでください。
            </div>
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="ok">{message}</p> : null}
      </section>

      {/* ---- ④ カタログ(帯フィルタ・モバイル2列) ---- */}
      <section className="panel">
        <div className="section-head">
          <h2>カタログ</h2>
          <div className={s.bandTabs}>
            <button type="button" className={band === 'ALL' ? s.bandTabOn : s.bandTab} onClick={() => setBand('ALL')}>すべて</button>
            {BAND_ORDER.map((b) => (
              <button key={b} type="button" className={band === b ? s.bandTabOn : s.bandTab} onClick={() => setBand(b)}>
                {BAND_LABEL[b]}
              </button>
            ))}
          </div>
        </div>
        {visibleBands.map((b) => {
          const group = catalog.filter((c) => c.band === b);
          if (group.length === 0) return null;
          return (
            <div key={b} className={s.bandGroup}>
              <div className={`${s.bandTitle} ${s[`accent${b}`] ?? ''}`}>
                {BAND_LABEL[b]}
                <span className={s.bandRange}>{BAND_RANGE[b]}</span>
              </div>
              <div className={s.grid}>
                {group.map((item) => {
                  const owned = ownedByKey.get(item.key) ?? 0;
                  return (
                    <div key={item.key} className={`${s.card} ${s[`card${item.band}`] ?? ''}`}>
                      <img className={s.cardArt} src={`/items/${item.key}.webp`} alt={item.name_ja} loading="lazy" />
                      <div className={s.cardHead}>
                        <div>
                          <div className={s.cardName}>{item.name_ja}</div>
                          <div className={s.cardNameEn}>{item.name_en}</div>
                        </div>
                        {item.sellable ? (
                          <div className={s.cardPrice}>{item.price}<span className="unit">USDT</span></div>
                        ) : null}
                      </div>
                      <div className={s.cardDesc}>{item.description_ja}</div>
                      <div className={s.cardMeta}>
                        {owned > 0 ? <span className={s.ownTag}>所持 {owned}</span> : null}
                        {item.usable_day_min !== null ? (
                          <span className={s.dayTag}>Day{item.usable_day_min}〜{item.usable_day_max}限定</span>
                        ) : null}
                        {!item.sellable ? <span className={s.dropTag}>Burn時にのみ授与</span> : null}
                      </div>
                      {item.sellable ? (
                        <div className={s.cardActions}>
                          <button type="button" disabled={busyKey === item.key} onClick={() => void buy(item)}>購入する</button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* ---- ⑤ アイテム履歴 ---- */}
      {transactions.length > 0 ? (
        <section className="panel">
          <div className="section-head">
            <h2>アイテム履歴</h2>
            <span className="muted">もらった · 送った · 使った · 購入</span>
          </div>
          <div className={s.txnList}>
            {transactions.map((t) => {
              const meta = TXN_META[t.kind];
              const detail =
                t.kind === 'USED' ? `→ ${t.horse_name ?? ''}`
                : t.kind === 'SENT' ? `${t.counterparty ?? ''} へ`
                : t.kind === 'RECEIVED' ? `${t.counterparty ?? 'Burnドロップ'} から`
                : 'ショップで購入';
              return (
                <div key={t.id} className={s.txnRow}>
                  <span className={`${s.txnChip} ${s[`txn${t.kind}`] ?? ''}`}>{meta.label}</span>
                  <img className={s.txnThumb} src={`/items/${t.item_key}.webp`} alt="" width={30} height={30} loading="lazy" />
                  <span className={s.txnName}>
                    {byKey.get(t.item_key)?.name_ja ?? t.item_key}
                    <span className={s.txnDetail}>{detail}</span>
                  </span>
                  <span className={`${s.txnQty} ${s[`txn${t.kind}`] ?? ''}`}>{meta.sign}{t.quantity}</span>
                  <span className={s.txnTime}>{t.created_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
