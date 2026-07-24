'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { POOL_PACKAGES_V2, POOL_PURCHASE_MIN_USDT } from '@sevendays/domain';
import { refreshSoft } from '@/lib/deferred-refresh';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { Button } from '@/components/ui/Button';
import { playUiSound } from '@/lib/ui-sound';
import s from '../app/market.module.css';
import { ErrorLine } from '@/components/ui/ErrorLine';

/**
 * プール購入パネル(Decision 103・V2)— 「◯◯$厩舎」。
 * パッケージバッジ(200〜10000)+自由入力で予算を選び、確認を経て
 * POST /purchase {amount}。生きているプールがあれば同じ操作が「金額変更」になる
 * (差額ロック/解放)。締切(次のレースのバッチロック)まで変更・キャンセル自由。
 * 数字は POOL_PACKAGES_V2 / POOL_PURCHASE_MIN_USDT 実定数のみ(架空値なし)。
 */

const MIN = Number(POOL_PURCHASE_MIN_USDT);

// 購入方針の選択肢(FUN_V3 §4)。§5-3/R1: リスクは定性のみ・BURN率や頭数の数値目安は出さない
// (実測が揃うまで断定表示しない)。方向性(質重視/バランス/量重視)だけを言葉で伝える。
const POLICY_OPTIONS: { key: 'STABLE' | 'OMAKASE' | 'QUANTITY'; title: string; sub: string }[] = [
  { key: 'STABLE', title: '安定重視', sub: '育った馬（総合値が高い）を優先。じっくり狙う迎え方。' },
  { key: 'OMAKASE', title: 'おまかせ', sub: '予算のまま自動で。育った馬も手頃な馬も混ざります。' },
  { key: 'QUANTITY', title: '頭数重視', sub: '手頃な馬を優先。同じ予算でより多くの馬を迎えます。' },
];
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
  // 購入方針(FUN_V3 §4)。§5-3: 頭数=実数・リスク=定性・BURN%は実測2週後まで出さない(R1)。
  const [policy, setPolicy] = useState<'STABLE' | 'OMAKASE' | 'QUANTITY'>('OMAKASE');
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
      body: { amount: String(parsed), policy },
    });
    setBusy(false);
    setConfirming(false);
    if (result.status !== 200) {
      // 失敗の音は ErrorLine が鳴らす(3-3)
      setError(errorMessage(result.body) ?? '予約に失敗しました。');
      return;
    }
    playUiSound('success');
    setDone(fmt(parsed));
    refreshSoft(router);
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
        {error ? <ErrorLine>{error}</ErrorLine> : null}
        <div className={s.poolRow}>
          {/* 1-2/3-4: 金がロックされる確定。押した瞬間に返事を返す */}
          <Button variant="primary" busy={busy} busyLabel="処理中…" sound="confirm" onClick={() => void submit()}>
            {pool ? '金額を変更する' : '予算をロックする'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
            戻る
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.poolBox}>
      <div className={s.poolHead}>
        {pool ? `現在のプール予約: ${fmt(current)} USDT(変更可)` : 'プール予約 — 予算いっぱい馬を迎える'}
      </div>
      <p className={s.poolNote}>
        予算額をロックすると、次のレース(朝8:00/夜20:00)のバッチで、マーケットの出品馬 →
        新規発行(102 USDT)の順に、予算のかぎり自動で割り当てられます。使い切れなかった余りは自動返金。
        総合値は割り当てられて初めて分かります — 同じ予算でも、迎える馬は一頭ごとに違います。
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
      {/* 購入方針(FUN_V3 §4)。§5-3: 頭数=実数(事前の数値目安は出さない)・リスク=定性・BURN%は2週後 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ font: '700 10.5px/1 var(--font-mono)', letterSpacing: '.12em', color: 'var(--faint)', textTransform: 'uppercase' }}>迎え方（購入方針）</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(148px,1fr))', gap: 7 }}>
          {POLICY_OPTIONS.map((o) => {
            const on = policy === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setPolicy(o.key)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  border: `1px solid ${on ? 'var(--cyan)' : 'var(--border)'}`,
                  background: on ? 'rgba(0,234,255,.06)' : 'rgba(10,8,22,.5)',
                  boxShadow: on ? '0 0 0 2px rgba(0,234,255,.25)' : 'none',
                }}
              >
                <div style={{ font: '800 13px/1.2 var(--font-display)', letterSpacing: '.03em', color: on ? 'var(--cyan)' : 'var(--text)' }}>{o.title}</div>
                <div style={{ marginTop: 4, font: '400 11px/1.5 var(--font-jp)', color: 'var(--muted)' }}>{o.sub}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className={s.poolRow}>
        <input
          className={s.poolInput}
          inputMode="numeric"
          placeholder={`金額を自由入力(最低${MIN}・上限は残高)`}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
        />
        <button className="primary" type="button" disabled={!valid} onClick={() => setConfirming(true)}>
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
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </div>
  );
}
