'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/dashboard.module.css';
import d from '../app/support.module.css';

/**
 * 売買自動化の設定UI(Decision 086)。
 * - TradeModeModal: 出品方式の必須選択(未選択ユーザーにブロッキング表示・スキップ不可)。
 *   事前チェック済みのデフォルトは置かず、ユーザーが明示的に選ぶ(法務要件)。
 *   比較表は事実のみ(Smartを勧めるが、キューの優先等の嘘は書かない)。
 * - TradeAutoTile: ダッシュボードと/marketの2箇所に置くトグル(いつでも変更可)。
 */

export interface TradeSettings {
  chosen: boolean;
  auto_list: boolean;
  auto_reserve: boolean;
  auto_reserve_max: number | null; // null = MAX(残高と枠の許す限り)
}

async function save(
  next: { auto_list: boolean; auto_reserve?: boolean; auto_reserve_max?: number | null },
): Promise<string | null> {
  const result = await apiFetch('/api/v1/trade-settings', { method: 'POST', body: next });
  return result.status === 200 ? null : (errorMessage(result.body) ?? '設定の保存に失敗しました。');
}

/* ============================== 必須選択モーダル ============================== */

export function TradeModeModal({ settings, preview = false }: { settings: TradeSettings; preview?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!settings.chosen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const choose = async (autoList: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (preview) {
      setBusy(false);
      setOpen(false);
      return;
    }
    const err = await save({ auto_list: autoList });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <div className={d.overlay} role="dialog" aria-modal="true">
      <div className={`${d.dialog} ${s.tmDialog}`}>
        <div className={d.dialogTitle}>馬の売り方を選んでください</div>
        <p className={s.tmLead}>
          あなたの馬をどうやってマーケットに出すかを選びます(あとからいつでも変更できます)。
        </p>
        <div className={s.tmGrid}>
          <div className={`${s.tmCard} ${s.tmCardSmart}`}>
            <div className={s.tmCardHead}>
              スマート出品 <span className={s.tmBadge}>おすすめ</span>
            </div>
            <ul className={s.tmList}>
              <li>経済エンジンが良いタイミングで自動出品(1晩最大1頭・当日価格)</li>
              <li><b>出品中もレースに出走します</b></li>
              <li>自動購入予約(売れたら翌晩の予約を自動作成)が使えます</li>
              <li>毎日の操作は不要</li>
            </ul>
            <button type="button" className={s.tmCta} disabled={busy} onClick={() => void choose(true)}>
              スマート出品ではじめる
            </button>
          </div>
          <div className={s.tmCard}>
            <div className={s.tmCardHead}>手動出品</div>
            <ul className={s.tmList}>
              <li>出品する馬とタイミングを自分で選ぶ</li>
              <li>出品中はレースに出走しません(Day・価値は凍結)</li>
              <li>出品操作は馬ごとに1日1回・取り下げは翌バッチ反映</li>
              <li>自動購入予約は使えません</li>
            </ul>
            <button type="button" className={`secondary ${s.tmGhost}`} disabled={busy} onClick={() => void choose(false)}>
              手動出品でやる
            </button>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <p className={s.tmNote}>どちらを選んでも、購入予約・台帳の公開ルールは同じです。</p>
      </div>
    </div>
  );
}

/* ============================== AUTOトグルタイル ============================== */

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`${s.tgl} ${on ? s.tglOn : ''}`}
      disabled={disabled ?? false}
      onClick={onClick}
    >
      <span className={s.tglKnob} />
    </button>
  );
}

export function TradeAutoTile({ settings, preview = false }: { settings: TradeSettings; preview?: boolean }) {
  const router = useRouter();
  const [local, setLocal] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (next: TradeSettings) => {
    if (busy) return;
    const prev = local;
    setLocal(next);
    setError(null);
    if (preview) return;
    setBusy(true);
    const err = await save({
      auto_list: next.auto_list,
      auto_reserve: next.auto_reserve,
      auto_reserve_max: next.auto_reserve_max,
    });
    setBusy(false);
    if (err) {
      setLocal(prev);
      setError(err);
      return;
    }
    router.refresh();
  };

  // 未選択の間はモーダルが選択を担う(タイルは選択済みの変更用)
  if (!local.chosen) return null;

  return (
    <section className={s.auto}>
      <div className={s.autoHead}>
        <span className={s.autoLabel}>AUTO · 売買の自動化</span>
        <span className={s.autoNote}>いつでも変更できます</span>
      </div>
      <div className={s.autoRow}>
        <Toggle
          on={local.auto_list}
          onClick={() =>
            void apply({
              ...local,
              auto_list: !local.auto_list,
              // Smartを切ると自動予約も止まる(サーバー制約と一致)
              auto_reserve: !local.auto_list ? local.auto_reserve : false,
            })
          }
        />
        <span className={s.autoName}>スマート出品</span>
        <span className={s.autoDesc}>
          {local.auto_list
            ? '経済エンジンが自動で出品します(出品中もレースに出走)'
            : 'OFF: 出品はマーケットの「馬を出品する」から手動で行います'}
        </span>
      </div>
      <div className={`${s.autoRow} ${!local.auto_list ? s.autoRowDisabled : ''}`}>
        <Toggle
          on={local.auto_reserve}
          disabled={!local.auto_list}
          onClick={() => void apply({ ...local, auto_reserve: !local.auto_reserve })}
        />
        <span className={s.autoName}>自動購入予約</span>
        <span className={s.autoDesc}>
          {local.auto_list
            ? '毎晩のバッチ後、残高の範囲で購入予約を自動作成(メールで毎回お知らせ)'
            : 'スマート出品ONで使えます'}
        </span>
        {local.auto_list && local.auto_reserve ? (
          <label className={s.autoMax}>
            上限
            <select
              className={s.autoMaxSelect}
              value={local.auto_reserve_max === null ? 'MAX' : String(local.auto_reserve_max)}
              onChange={(e) =>
                void apply({
                  ...local,
                  auto_reserve_max: e.target.value === 'MAX' ? null : Number(e.target.value),
                })
              }
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} 頭</option>
              ))}
              <option value="MAX">MAX</option>
            </select>
          </label>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
