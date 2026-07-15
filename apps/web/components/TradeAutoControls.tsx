'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { APP_COPY, type Lang } from '@/lib/i18n';
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
  saveErr: string,
): Promise<string | null> {
  const result = await apiFetch('/api/v1/trade-settings', { method: 'POST', body: next });
  return result.status === 200 ? null : (errorMessage(result.body) ?? saveErr);
}

/* ============================== 必須選択モーダル ============================== */

export function TradeModeModal({ settings, preview = false, lang = 'ja' }: { settings: TradeSettings; preview?: boolean; lang?: Lang }) {
  const t = APP_COPY[lang].trade;
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
    const err = await save({ auto_list: autoList }, t.save_err);
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
        <div className={d.dialogTitle}>{t.modal_title}</div>
        <p className={s.tmLead}>
          {t.modal_lead}
        </p>
        <div className={s.tmGrid}>
          <div className={`${s.tmCard} ${s.tmCardSmart}`}>
            <div className={s.tmCardHead}>
              {t.smart_head} <span className={s.tmBadge}>{t.smart_badge}</span>
            </div>
            <ul className={s.tmList}>
              <li>{t.smart_li1}</li>
              <li><b>{t.smart_li2}</b></li>
              <li>{t.smart_li3}</li>
              <li>{t.smart_li4}</li>
            </ul>
            <button type="button" className={s.tmCta} disabled={busy} onClick={() => void choose(true)}>
              {t.smart_cta}
            </button>
          </div>
          <div className={s.tmCard}>
            <div className={s.tmCardHead}>{t.manual_head}</div>
            <ul className={s.tmList}>
              <li>{t.manual_li1}</li>
              <li>{t.manual_li2}</li>
              <li>{t.manual_li3}</li>
              <li>{t.manual_li4}</li>
            </ul>
            <button type="button" className={`secondary ${s.tmGhost}`} disabled={busy} onClick={() => void choose(false)}>
              {t.manual_cta}
            </button>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <p className={s.tmNote}>{t.modal_note}</p>
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

export function TradeAutoTile({ settings, preview = false, lang = 'ja' }: { settings: TradeSettings; preview?: boolean; lang?: Lang }) {
  const t = APP_COPY[lang].trade;
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
    }, t.save_err);
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
        <span className={s.autoLabel}>{t.tile_label}</span>
        <span className={s.autoNote}>{t.tile_note}</span>
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
        <span className={s.autoName}>{t.smart_name}</span>
        <span className={s.autoDesc}>
          {local.auto_list ? t.smart_on_desc : t.smart_off_desc}
        </span>
      </div>
      <div className={`${s.autoRow} ${!local.auto_list ? s.autoRowDisabled : ''}`}>
        <Toggle
          on={local.auto_reserve}
          disabled={!local.auto_list}
          onClick={() => void apply({ ...local, auto_reserve: !local.auto_reserve })}
        />
        <span className={s.autoName}>{t.reserve_name}</span>
        <span className={s.autoDesc}>
          {local.auto_list ? t.reserve_on_desc : t.reserve_off_desc}
        </span>
        {local.auto_list && local.auto_reserve ? (
          <label className={s.autoMax}>
            {t.max_label}
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
                <option key={n} value={n}>{n}{t.max_unit}</option>
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
