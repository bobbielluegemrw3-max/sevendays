'use client';

import { useMemo, useState } from 'react';
import { AppSelect } from '@/components/AppSelect';
import { localDateTime } from '@/lib/format-time';
import type { AppDict } from '@/lib/i18n-shared';
import { fill } from '@/lib/i18n-shared';
import s from '../app/wallet.module.css';

/** /wallet の文言(サーバー親から受け取る — クライアントからAPP_COPYは読まない)。 */
type WalletCopy = AppDict['walletPage'];

/* ============================================================================
 * WalletHistory — 取引履歴。
 *
 * 2026-07-14(オーナー指摘: 初心者に生の複式簿記は読めない):
 * 既定は「かんたん表示」— 台帳の複式エントリを人間の1行に翻訳する。
 *   - 同じ取引の鏡側(ロック時のUSER_LOCKED+177.16など)は隠して1取引=1行
 *   - 日本語タイトル+何が起きたかの説明文
 *   - トーンは3色: 収入(緑)/支出(赤)/ロックの移動(グレー=資産は減っていない)
 *   - 時刻はブラウザの現地時刻で表示(サーバーはUTC)
 * 「台帳表示」トグルで従来の生データ(全エントリ・勘定名)も見られる(透明性)。
 * ========================================================================== */

export interface HistoryEntry {
  type: string; direction: string; amount: string; account: string; created_at: string;
}

const PAGE_SIZE = 12;

type Tone = 'in' | 'out' | 'move';

interface HumanRow {
  title: string;
  sub: string;
  tone: Tone;
  signed: string; // 表示金額(符号つき)
}

const fmt = (v: string): string =>
  Math.abs(Number(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 台帳エントリ→人間の1行。null は「鏡側なので表示しない」。
 * 判定は (種別, 勘定, 方向) の組 — 不明な組は生のまま出して誤訳を避ける。
 */
function humanize(e: HistoryEntry, copy: WalletCopy): HumanRow | null {
  const t = e.type;
  const acct = e.account;
  const dir = e.direction;
  const a = fmt(e.amount);

  switch (t) {
    case 'PURCHASE_FUND_LOCK':
      if (acct === 'USER_LOCKED') return null; // 鏡側
      return {
        title: copy.tx_lock_t,
        sub: fill(copy.tx_lock_s_tpl, { a }),
        tone: 'move',
        signed: `−${a}`,
      };
    case 'PURCHASE_REFUND':
      if (acct === 'USER_LOCKED') return null;
      return {
        title: copy.tx_refund_t,
        sub: copy.tx_refund_s,
        tone: 'move',
        signed: `+${a}`,
      };
    case 'DAY0_MINT_SETTLEMENT':
      return {
        title: copy.tx_mint_t,
        sub: copy.tx_mint_s,
        tone: 'out',
        signed: `−${a}`,
      };
    case 'ASSIGNMENT_SETTLEMENT':
      if (acct === 'USER_LOCKED' && dir === 'DEBIT') {
        return {
          title: copy.tx_buy_t,
          sub: copy.tx_buy_s,
          tone: 'out',
          signed: `−${a}`,
        };
      }
      if (acct === 'USER_AVAILABLE' && dir === 'CREDIT') {
        return {
          title: copy.tx_sell_t,
          sub: copy.tx_sell_s,
          tone: 'in',
          signed: `+${a}`,
        };
      }
      break;
    case 'BUYBACK_PAYMENT':
      return {
        title: copy.tx_buyback_t,
        sub: copy.tx_buyback_s,
        tone: 'in',
        signed: `+${a}`,
      };
    case 'MLM_REWARD_PAYMENT':
      return {
        title: copy.tx_mlm_t,
        sub: copy.tx_mlm_s,
        tone: 'in',
        signed: `+${a}`,
      };
    case 'BLOCKCHAIN_DEPOSIT_CONFIRMATION':
      return {
        title: copy.tx_deposit_t,
        sub: copy.tx_deposit_s,
        tone: 'in',
        signed: `+${a}`,
      };
    case 'ITEM_PURCHASE':
      return {
        title: copy.tx_item_t,
        sub: copy.tx_item_s,
        tone: 'out',
        signed: `−${a}`,
      };
    case 'WITHDRAWAL_FUND_LOCK':
      if (acct === 'USER_LOCKED') return null;
      return {
        title: copy.tx_wdlock_t,
        sub: copy.tx_wdlock_s,
        tone: 'move',
        signed: `−${a}`,
      };
    case 'WITHDRAWAL_REJECTION_REFUND':
      if (acct === 'USER_LOCKED') return null;
      return {
        title: copy.tx_wdrefund_t,
        sub: copy.tx_wdrefund_s,
        tone: 'move',
        signed: `+${a}`,
      };
    case 'ADMIN_ADJUSTMENT':
      return dir === 'CREDIT'
        ? { title: copy.tx_admin_in_t, sub: copy.tx_admin_in_s, tone: 'in', signed: `+${a}` }
        : { title: copy.tx_admin_out_t, sub: copy.tx_admin_out_s, tone: 'out', signed: `−${a}` };
    default:
      break;
  }
  // 不明な組み合わせは生のまま(誤った翻訳を出さない)
  return {
    title: t,
    sub: acct,
    tone: 'move',
    signed: dir === 'CREDIT' ? `+${a}` : `−${a}`,
  };
}

const toneLabel = (t: WalletCopy): Record<Tone, string> =>
  ({ in: t.tone_in, out: t.tone_out, move: t.tone_move });

export function WalletHistory({ entries, t }: { entries: HistoryEntry[]; t: WalletCopy }) {
  const TONE_LABEL = toneLabel(t);
  const [q, setQ] = useState('');
  const [filt, setFilt] = useState('ALL'); // ALL | in | out | move
  const [page, setPage] = useState(0);
  const [rawView, setRawView] = useState(false);

  // かんたん表示用: 鏡側を除いた人間の行(生表示は全エントリそのまま)
  const humanRows = useMemo(
    () =>
      entries
        .map((e) => ({ e, h: humanize(e, t) }))
        .filter((x): x is { e: HistoryEntry; h: HumanRow } => x.h !== null),
    [entries, t],
  );

  const total = rawView ? entries.length : humanRows.length;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (rawView) {
      return entries
        .map((e) => ({ e, h: null as HumanRow | null }))
        .filter(({ e }) => !needle || `${e.type} ${e.account}`.toLowerCase().includes(needle));
    }
    return humanRows.filter(({ h }) => {
      if (needle && !`${h.title} ${h.sub}`.toLowerCase().includes(needle)) return false;
      if (filt !== 'ALL') return h.tone === filt;
      return true;
    });
  }, [entries, humanRows, q, filt, rawView]);

  const shown = filtered.length;
  const pageCount = Math.max(1, Math.ceil(shown / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const reset = () => setPage(0);

  if (entries.length === 0) {
    return <div className={s.empty}>{t.hist_empty}</div>;
  }

  return (
    <div>
      <div className={s.controls}>
        <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder={t.hist_search_ph} aria-label={t.hist_search_ph} />
        {!rawView && (
          <AppSelect
            className={s.select}
            value={filt}
            onChange={(v) => { setFilt(v); reset(); }}
            ariaLabel={t.hist_filter_aria}
            options={[
              { value: 'ALL', label: t.filt_all },
              { value: 'in', label: t.filt_in },
              { value: 'out', label: t.filt_out },
              { value: 'move', label: t.filt_move },
            ]}
          />
        )}
        <span className={s.count}>
          {shown === total ? fill(t.count_all_tpl, { n: total }) : fill(t.count_part_tpl, { shown, total })}
        </span>
        <button
          type="button"
          className={s.rawToggle}
          onClick={() => { setRawView((v) => !v); reset(); }}
        >
          {rawView ? t.to_simple : t.to_ledger}
        </button>
      </div>

      {slice.length > 0 ? (
        <div className={s.histList}>
          {slice.map(({ e, h }, i) => {
            if (rawView || !h) {
              const kind = e.direction === 'CREDIT' ? 'in' : 'out';
              return (
                <div key={`${e.created_at}-${i}`} className={s.hRow}>
                  <span className={`${s.hDot} ${kind === 'in' ? s.hDotCredit : s.hDotDebit}`} />
                  <div className={s.hBody}>
                    <div className={s.hLabel}>{e.type}</div>
                    <div className={s.hSub}>{localDateTime(e.created_at)} · {e.account}</div>
                  </div>
                  <span className={`${s.hAmt} ${kind === 'in' ? s.hAmtCredit : s.hAmtDebit}`}>
                    {kind === 'in' ? '+' : '−'}{fmt(e.amount)}
                  </span>
                </div>
              );
            }
            return (
              <div key={`${e.created_at}-${i}`} className={s.hRow}>
                <span className={`${s.hDot} ${h.tone === 'in' ? s.hDotCredit : h.tone === 'out' ? s.hDotDebit : s.hDotNeutral}`} />
                <div className={s.hBody}>
                  <div className={s.hLabel}>
                    {h.title}
                    <span className={`${s.hTone} ${h.tone === 'in' ? s.hToneIn : h.tone === 'out' ? s.hToneOut : s.hToneMove}`}>
                      {TONE_LABEL[h.tone]}
                    </span>
                  </div>
                  <div className={s.hSub}>{h.sub}</div>
                  <div className={s.hSub}>{localDateTime(e.created_at)}</div>
                </div>
                <span className={`${s.hAmt} ${h.tone === 'in' ? s.hAmtCredit : h.tone === 'out' ? s.hAmtDebit : s.hAmtNeutral}`}>
                  {h.signed}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>{t.no_match}</div>
      )}

      {pageCount > 1 ? (
        <div className={s.pager}>
          <button type="button" className={s.pagerBtn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.pager_prev}</button>
          <span className={s.pageLabel}>{safePage + 1} / {pageCount}</span>
          <button type="button" className={s.pagerBtn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>{t.pager_next}</button>
        </div>
      ) : null}
    </div>
  );
}
