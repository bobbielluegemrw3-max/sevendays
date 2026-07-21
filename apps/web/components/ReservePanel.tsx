'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppSelect } from '@/components/AppSelect';
import {
  MAX_CONCURRENT_PURCHASE_SESSIONS,
  PURCHASE_LOCK_AMOUNT,
  PURCHASE_MAX_PER_REQUEST,
} from '@sevendays/domain';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/market.module.css';
import d from '../app/support.module.css';
import { ErrorLine } from '@/components/ui/ErrorLine';

/**
 * 購入予約パネル(Decision 085)— /market の第2幕。
 * ウォレット残高から「いま予約できる最大頭数」を計算して見せ、プルダウンで
 * 頭数を選び、合計ロック額の確認ダイアログを経て POST /purchase {count} を
 * 1回だけ呼ぶ。残高不足なら予約ボタンの代わりに入金導線(/wallet)を出す。
 * 完了後はフォームを畳んで「20:00に処理されます」の待機案内に切り替える。
 */

const LOCK = Number(PURCHASE_LOCK_AMOUNT);
const fmt = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ReservePanel({
  available,
  pendingCount,
  preview = false,
}: {
  /** USER_AVAILABLE 残高(GET /wallet)。 */
  available: string;
  /** 割当待ち(PENDING_ASSIGNMENT)の自分の予約件数。 */
  pendingCount: number;
  preview?: boolean;
}) {
  const router = useRouter();
  const availableNum = Number(available);
  const maxByBalance = Math.max(0, Math.floor(availableNum / LOCK));
  const slots = Math.max(0, MAX_CONCURRENT_PURCHASE_SESSIONS - pendingCount);
  // Decision 096: 同時上限は実質撤廃(残高が実際の制約)。1回の操作は
  // PURCHASE_MAX_PER_REQUESTまで — それ以上は続けてもう一度予約すればよい。
  const maxN = Math.min(maxByBalance, slots, PURCHASE_MAX_PER_REQUEST);

  const [count, setCount] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const chosen = Math.min(count, Math.max(1, maxN));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (preview) {
      setBusy(false);
      setConfirming(false);
      setDoneCount(chosen);
      return;
    }
    const result = await apiFetch('/api/v1/purchase', {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
      body: { count: chosen },
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '購入予約に失敗しました。');
      setConfirming(false);
      return;
    }
    setConfirming(false);
    setDoneCount(chosen);
    router.refresh();
  };

  return (
    <section id="reserve" className={s.reserve}>
      <div className={s.reserveHead}>
        <span className={s.reserveTitle}>購入予約 — 馬を迎える</span>
        <span className={s.reserveBalance}>
          残高 <b>{fmt(availableNum)}</b> USDT
          <Link href="/wallet" className={s.reserveDeposit}>入金 →</Link>
        </span>
      </div>

      {doneCount !== null ? (
        /* ---- 第3幕: 受付完了・待機案内 ---- */
        <div className={s.reserveDone}>
          <div className={s.reserveDoneTitle}>✓ 購入予約を受け付けました({doneCount}頭)</div>
          <p className={s.reserveDoneText}>
            20:00のレース終了後、スマートマーケットプレイスシステムが購入予約を処理します。
            他のオーナーとのP2P取引、または新規発行馬の購入となります。
            結果が確定するまで、今しばらくお待ちください。
          </p>
          <p className={s.reserveDoneSub}>
            受付メールをお送りしました。20:00の精算前であれば、下の予約一覧からキャンセル(全額返金)できます。
          </p>
          <div className={s.reserveDoneLinks}>
            <a href="#sessions" className={s.reserveLink}>予約状況を見る ↓</a>
            <Link href="/wallet" className={s.reserveLink}>取引履歴 →</Link>
            <Link href="/races" className={s.reserveLink}>今夜のショー →</Link>
          </div>
        </div>
      ) : (
        <>
          {/* ---- 仕組み(3ステップ・短文) ---- */}
          <div className={s.reserveSteps}>
            <div className={s.reserveStep}>
              <span className={s.reserveStepK}>① ロック</span>
              1頭につき最大 <b>{fmt(LOCK)}</b> USDT を確保
            </div>
            <div className={s.reserveStep}>
              <span className={s.reserveStepK}>② マッチング</span>
              今夜20:00、出品馬(Day1〜6)または新規発行(請求102)
            </div>
            <div className={s.reserveStep}>
              <span className={`${s.reserveStepK} ${s.reserveStepGood}`}>③ 返金</span>
              割当価格との差額は自動返金
            </div>
          </div>

          {maxN > 0 ? (
            <div className={s.reserveAction}>
              <span className={s.reserveMax}>いま予約できるのは <b>最大 {maxN} 頭</b></span>
              <label className={s.reserveSelectWrap}>
                <AppSelect
                  className={s.reserveSelect}
                  value={String(chosen)}
                  onChange={(v) => setCount(Number(v))}
                  ariaLabel="予約する頭数"
                  options={Array.from({ length: maxN }, (_, i) => i + 1).map((n) => ({
                    value: String(n),
                    label: `${n} 頭`,
                  }))}
                />
              </label>
              <button type="button" className={s.reserveCta} onClick={() => setConfirming(true)}>
                購入予約する
              </button>
            </div>
          ) : slots === 0 ? (
            <div className={s.reserveBlocked}>
              予約が上限に達しています。今夜20:00の処理をお待ちください。
            </div>
          ) : (
            <div className={s.reserveAction}>
              <span className={s.reserveMax}>
                予約には1頭につき最大 {fmt(LOCK)} USDT が必要です(不足 {fmt(LOCK - availableNum)} USDT)
              </span>
              <Link href="/wallet" className={s.reserveCta}>ウォレットへ入金 →</Link>
            </div>
          )}
          {pendingCount > 0 ? (
            <div className={s.reservePendingNote}>現在 {pendingCount} 件が割当待ちです(今夜20:00に処理)。</div>
          ) : null}
          {error ? <ErrorLine>{error}</ErrorLine> : null}
        </>
      )}

      {/* ---- 確認ダイアログ: 合計ロック額を明示してから実行 ---- */}
      {confirming ? (
        <div className={d.overlay} role="dialog" aria-modal="true">
          <div className={d.dialog}>
            <div className={d.dialogTitle}>購入予約の確認</div>
            <p className={s.reserveConfirmText}>
              <b>{chosen}頭</b> の購入予約をします。合計 <b>{fmt(LOCK * chosen)} USDT</b> をロックします
              (割当価格との差額は自動返金)。
            </p>
            <p className={s.reserveConfirmSub}>
              今夜20:00の精算前であればキャンセル(全額返金)できます。
            </p>
            <div className={d.dialogActions}>
              <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                やめる
              </button>
              <button className="primary" type="button" onClick={() => void submit()} disabled={busy}>
                {busy ? '予約中…' : '予約を確定する'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
