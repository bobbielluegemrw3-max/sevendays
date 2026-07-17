'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { POOL_PACKAGES_V2, POOL_PURCHASE_MIN_USDT } from '@sevendays/domain';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/market.module.css';

/**
 * プール購入パネル(Decision 103・V2)— 「◯◯$厩舎」。
 * パッケージバッジ(200〜10000)+自由入力で予算を選び、確認を経て
 * POST /purchase {amount}。生きているプールがあれば同じ操作が「金額変更」になる
 * (差額ロック/解放)。締切(次のレースのバッチロック)まで変更・キャンセル自由。
 * 数字は POOL_PACKAGES_V2 / POOL_PURCHASE_MIN_USDT 実定数のみ(架空値なし)。
 */

const MIN = Number(POOL_PURCHASE_MIN_USDT);
const fmt = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PoolReservePanel({
  available,
  pool,
  preview = false,
}: {
  /** USER_AVAILABLE 残高(GET /wallet)。 */
  available: string;
  /** 生きているプール(PENDING・バッチ未ロック)。あれば金額変更モード。 */
  pool: { id: string; locked_amount: string } | null;
  preview?: boolean;
}) {
  const router = useRouter();
  const availableNum = Number(available);
  const current = pool ? Number(pool.locked_amount) : 0;
  // 変更時は「現在ロック分+残高」まで増額できる(差額ロック方式)
  const maxAmount = Math.floor(availableNum + current);

  const [amount, setAmount] = useState<string>(pool ? String(current) : '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed >= MIN && parsed <= maxAmount;

  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    if (preview) {
      setBusy(false);
      setConfirming(false);
      setDone(fmt(parsed));
      return;
    }
    const result = await apiFetch('/api/v1/purchase', {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
      body: { amount: String(parsed) },
    });
    setBusy(false);
    setConfirming(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '予約に失敗しました。');
      return;
    }
    setDone(fmt(parsed));
    router.refresh();
  };

  if (done !== null) {
    return (
      <div className={s.poolBox}>
        <div className={s.poolHead}>YOUR POOL — {done} USDT</div>
        <p className={s.poolNote}>
          予算をロックしました。次のレースで出品馬→新規発行の順に予算いっぱい割り当てられ、
          余り({MIN} USDT未満)は自動で返金されます。締切までは金額変更・キャンセルできます。
        </p>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className={s.poolBox}>
        <div className={s.poolHead}>{pool ? 'プール金額を変更しますか?' : 'この予算で厩舎を作りますか?'}</div>
        <p className={s.poolNote}>
          {pool
            ? `ロック額を ${fmt(current)} → ${fmt(parsed)} USDT に変更します(差額のみ動きます)。`
            : `${fmt(parsed)} USDT をまるごとロックします。`}
          {' '}次のレースで出品馬(P2P)→新規発行(102 USDT)の順に予算いっぱい割当・
          余り({MIN} USDT未満)は自動返金。締切前ならいつでも変更・キャンセルできます。
        </p>
        {error ? <p className="error">{error}</p> : null}
        <div className={s.poolRow}>
          <button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? '処理中…' : pool ? '金額を変更する' : '予算をロックする'}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>
            戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.poolBox}>
      <div className={s.poolHead}>
        {pool ? `現在のプール: ${fmt(current)} USDT(変更可)` : '◯◯$厩舎 — 予算で丸ごと予約'}
      </div>
      <p className={s.poolNote}>
        予算を決めるだけ。次のレースで出品馬→新規発行の順に自動で厩舎が組まれます
        (同じ価格でも中身は千差万別 — 宝探しはそこから)。
      </p>
      <div className={s.poolBadges}>
        {POOL_PACKAGES_V2.map((p) => {
          const v = Number(p);
          const affordable = v <= maxAmount;
          return (
            <button
              key={p}
              type="button"
              className={`${s.poolBadge} ${String(parsed) === p ? s.poolBadgeOn : ''}`}
              disabled={!affordable}
              onClick={() => setAmount(p)}
            >
              {Number(p).toLocaleString('en-US')}$
            </button>
          );
        })}
      </div>
      <div className={s.poolRow}>
        <input
          className={s.poolInput}
          inputMode="numeric"
          placeholder={`自由入力(${MIN}〜${maxAmount.toLocaleString('en-US')})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
        />
        <button type="button" disabled={!valid} onClick={() => setConfirming(true)}>
          {pool ? '金額を変更' : '予約する'}
        </button>
      </div>
      {amount !== '' && !valid ? (
        <p className={s.poolNote}>
          {parsed < MIN
            ? `最低 ${MIN} USDT(いちばん安い馬1頭ぶん)から。`
            : `残高が足りません(最大 ${maxAmount.toLocaleString('en-US')} USDT)。`}
          {parsed > maxAmount ? <> <Link href="/wallet">入金する →</Link></> : null}
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
