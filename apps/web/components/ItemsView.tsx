'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import {
  BAND_LABEL,
  BAND_ORDER,
  type CatalogItem,
  type InventoryData,
} from '@/lib/items';
import s from '../app/items.module.css';

/**
 * /items — アイテムショップ+インベントリ+ギフト(Decision 078/079)。
 * 効果は全て公開ルール。「今日の設定(1〜6)」はレース後に公開される。
 */
export function ItemsView({
  catalog,
  inventory,
  preview = false,
}: {
  catalog: CatalogItem[];
  inventory: InventoryData;
  preview?: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [giftEmail, setGiftEmail] = useState('');
  const [giftKey, setGiftKey] = useState('');

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
    const r = await apiFetch('/api/v1/items/gift', {
      method: 'POST',
      body: { recipient_email: giftEmail, item_key: giftKey },
    });
    setBusyKey(null);
    if (r.status !== 200) {
      setError(errorMessage(r.body) ?? 'ギフトの送付に失敗しました');
      return;
    }
    setMessage(`${byKey.get(giftKey)?.name_ja ?? giftKey} を ${giftEmail} に送りました。`);
    setGiftEmail('');
    setGiftKey('');
    router.refresh();
  }

  return (
    <>
      <section className="panel">
        <h1>ITEMS</h1>
        <p className={s.intro}>
          アイテムは馬のパラメータ(タイプ・調子・疲労・Day)との相性で効きます。
          1頭のレースに使えるのは1個まで。効果の日替わり係数「設定(1〜6)」は
          レースシードから決まり、レース後に公開されます — 誰にも(運営にも)事前には分かりません。
        </p>
        <div className={s.settingNote}>
          SETTING 1(×0.5)… 3・4(標準)… 6(×1.5)。出現率 10/15/25/25/15/10%。
          使った馬がBurnされた場合、アイテム代金は全額サポートボーナスの財源になります。
        </div>
      </section>

      <section className="panel">
        <h2>マイアイテム</h2>
        {inventory.available.length === 0 && inventory.pending.length === 0 ? (
          <p className="faint">まだアイテムを持っていません。下のカタログからどうぞ。</p>
        ) : (
          <>
            {inventory.available.map((e) => (
              <div key={e.item_key} className={s.invRow}>
                <img className={s.thumb} src={`/items/${e.item_key}.webp`} alt="" width={42} height={42} loading="lazy" />
                <span className={s.invName}>{byKey.get(e.item_key)?.name_ja ?? e.item_key}</span>
                <span className={s.invCount}>× {e.n}</span>
                <span className={s.invSpacer} />
                <span className="faint" style={{ fontSize: '0.75rem' }}>
                  {byKey.get(e.item_key)?.description_ja}
                </span>
              </div>
            ))}
            {inventory.pending.map((p) => (
              <div key={p.usage_id} className={s.pendingRow}>
                <img className={s.thumb} src={`/items/${p.item_key}.webp`} alt="" width={42} height={42} loading="lazy" />
                <span className={s.pendingBadge}>適用予定</span>
                <b>{byKey.get(p.item_key)?.name_ja ?? p.item_key}</b>
                <span>→ {p.horse_name}</span>
                <span className="faint">{p.effective_race_date} のレース</span>
              </div>
            ))}
          </>
        )}

        {giftable.length > 0 ? (
          <>
            <h3 style={{ marginTop: '1.1rem' }}>仲間に贈る</h3>
            <form className={s.giftForm} onSubmit={(e) => void sendGift(e)}>
              <label>
                相手のメールアドレス
                <input
                  type="email"
                  value={giftEmail}
                  onChange={(e) => setGiftEmail(e.target.value)}
                  placeholder="friend@example.com"
                  required
                />
              </label>
              <label>
                贈るアイテム
                <select value={giftKey} onChange={(e) => setGiftKey(e.target.value)} required>
                  <option value="">選択…</option>
                  {giftable.map((e) => (
                    <option key={e.item_key} value={e.item_key}>
                      {byKey.get(e.item_key)?.name_ja ?? e.item_key}(所持 {e.n})
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={busyKey === 'gift' || !giftKey || !giftEmail}>
                贈る
              </button>
            </form>
            <div className={s.giftNote}>
              送付は即時確定で取り消せません。登録済みのメールアドレス宛にのみ届きます(1日20回まで)。
            </div>
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="ok">{message}</p> : null}
      </section>

      <section className="panel">
        <h2>カタログ</h2>
        {BAND_ORDER.map((band) => {
          const group = catalog.filter((c) => c.band === band);
          if (group.length === 0) return null;
          return (
            <div key={band}>
              <div className={s.bandTitle}>
                {BAND_LABEL[band]}
                <span className={s.bandRange}>{BAND_RANGE[band]}</span>
              </div>
              <div className={s.grid}>
                {group.map((item) => {
                  const owned = ownedByKey.get(item.key) ?? 0;
                  return (
                    <div key={item.key} className={`${s.card} ${s[`card${item.band}`] ?? ''}`}>
                      <img
                        className={s.cardArt}
                        src={`/items/${item.key}.webp`}
                        alt={item.name_ja}
                        loading="lazy"
                      />
                      <div className={s.cardHead}>
                        <div>
                          <div className={s.cardName}>{item.name_ja}</div>
                          <div className={s.cardNameEn}>{item.name_en}</div>
                        </div>
                        {item.sellable ? (
                          <div className={s.cardPrice}>
                            {item.price}
                            <span className="unit">USDT</span>
                          </div>
                        ) : null}
                      </div>
                      <div className={s.cardDesc}>{item.description_ja}</div>
                      <div className={s.cardMeta}>
                        {owned > 0 ? <span className={s.ownTag}>所持 {owned}</span> : null}
                        {item.usable_day_min !== null ? (
                          <span className={s.dayTag}>
                            Day{item.usable_day_min}〜{item.usable_day_max}限定
                          </span>
                        ) : null}
                        {!item.sellable ? <span className={s.dropTag}>Burn時にのみ授与</span> : null}
                      </div>
                      {item.sellable ? (
                        <div className={s.cardActions}>
                          <button
                            type="button"
                            disabled={busyKey === item.key}
                            onClick={() => void buy(item)}
                          >
                            購入する
                          </button>
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
    </>
  );
}
