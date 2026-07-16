'use client';

import { useMemo, useState } from 'react';
import { AppSelect } from '@/components/AppSelect';
import { localDateTime } from '@/lib/format-time';
import s from '../app/wallet.module.css';

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
function humanize(e: HistoryEntry): HumanRow | null {
  const t = e.type;
  const acct = e.account;
  const dir = e.direction;
  const a = fmt(e.amount);

  switch (t) {
    case 'PURCHASE_FUND_LOCK':
      if (acct === 'USER_LOCKED') return null; // 鏡側
      return {
        title: '購入予約 — 資金をロック',
        sub: `予約1件ぶん(${a})を利用可能残高からロック枠へ確保しました。資産は減っていません`,
        tone: 'move',
        signed: `−${a}`,
      };
    case 'PURCHASE_REFUND':
      if (acct === 'USER_LOCKED') return null;
      return {
        title: 'ロックの余りが戻りました',
        sub: '割当確定後、使わなかったロック分が利用可能残高に戻りました',
        tone: 'move',
        signed: `+${a}`,
      };
    case 'DAY0_MINT_SETTLEMENT':
      return {
        title: '馬の購入(新規発行)',
        sub: '価格100+発行手数料2=102をロック枠から支払いました',
        tone: 'out',
        signed: `−${a}`,
      };
    case 'ASSIGNMENT_SETTLEMENT':
      if (acct === 'USER_LOCKED' && dir === 'DEBIT') {
        return {
          title: '馬の購入(マーケット)',
          sub: '成立価格をロック枠から支払いました',
          tone: 'out',
          signed: `−${a}`,
        };
      }
      if (acct === 'USER_AVAILABLE' && dir === 'CREDIT') {
        return {
          title: '馬の売却代金',
          sub: '成立価格から手数料2%を差し引いた受取額です',
          tone: 'in',
          signed: `+${a}`,
        };
      }
      break;
    case 'BUYBACK_PAYMENT':
      return {
        title: 'チャンピオン報酬',
        sub: 'DAY7走破報酬(合計200)の分割受取です',
        tone: 'in',
        signed: `+${a}`,
      };
    case 'MLM_REWARD_PAYMENT':
      return {
        title: 'サポートボーナス(お祝い金)',
        sub: 'あなたの組織からチャンピオンが誕生しました',
        tone: 'in',
        signed: `+${a}`,
      };
    case 'BLOCKCHAIN_DEPOSIT_CONFIRMATION':
      return {
        title: '入金',
        sub: 'ブロックチェーン入金が確認されました(128確認)',
        tone: 'in',
        signed: `+${a}`,
      };
    case 'ITEM_PURCHASE':
      return {
        title: 'アイテム購入',
        sub: 'ショップでアイテムを購入しました',
        tone: 'out',
        signed: `−${a}`,
      };
    case 'WITHDRAWAL_FUND_LOCK':
      if (acct === 'USER_LOCKED') return null;
      return {
        title: '出金手続き中',
        sub: '出金額をロックしました。送金完了までロック枠に表示されます',
        tone: 'move',
        signed: `−${a}`,
      };
    case 'WITHDRAWAL_REJECTION_REFUND':
      if (acct === 'USER_LOCKED') return null;
      return {
        title: '出金の返金',
        sub: '出金が承認されなかったため、全額が利用可能残高に戻りました',
        tone: 'move',
        signed: `+${a}`,
      };
    case 'ADMIN_ADJUSTMENT':
      return dir === 'CREDIT'
        ? { title: '運営からの付与', sub: '運営によるUSDT付与です', tone: 'in', signed: `+${a}` }
        : { title: '運営による調整', sub: '運営による残高調整です', tone: 'out', signed: `−${a}` };
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

const TONE_LABEL: Record<Tone, string> = { in: '収入', out: '支出', move: 'ロック' };

export function WalletHistory({ entries }: { entries: HistoryEntry[] }) {
  const [q, setQ] = useState('');
  const [filt, setFilt] = useState('ALL'); // ALL | in | out | move
  const [page, setPage] = useState(0);
  const [rawView, setRawView] = useState(false);

  // かんたん表示用: 鏡側を除いた人間の行(生表示は全エントリそのまま)
  const humanRows = useMemo(
    () =>
      entries
        .map((e) => ({ e, h: humanize(e) }))
        .filter((x): x is { e: HistoryEntry; h: HumanRow } => x.h !== null),
    [entries],
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
    return <div className={s.empty}>取引履歴はまだありません。上の入金アドレスに USDT を送るとここに表示されます。</div>;
  }

  return (
    <div>
      <div className={s.controls}>
        <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="履歴を検索…" aria-label="履歴を検索" />
        {!rawView && (
          <AppSelect
            className={s.select}
            value={filt}
            onChange={(v) => { setFilt(v); reset(); }}
            ariaLabel="絞り込み"
            options={[
              { value: 'ALL', label: 'すべて' },
              { value: 'in', label: '収入(+)' },
              { value: 'out', label: '支出(−)' },
              { value: 'move', label: 'ロックの移動' },
            ]}
          />
        )}
        <span className={s.count}>{shown === total ? `全${total}件` : `${total}件中 ${shown}件`}</span>
        <button
          type="button"
          className={s.rawToggle}
          onClick={() => { setRawView((v) => !v); reset(); }}
        >
          {rawView ? 'かんたん表示へ' : '台帳表示(全記録)'}
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
        <div className={s.empty}>条件に一致する履歴がありません。</div>
      )}

      {pageCount > 1 ? (
        <div className={s.pager}>
          <button type="button" className={s.pagerBtn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 前へ</button>
          <span className={s.pageLabel}>{safePage + 1} / {pageCount}</span>
          <button type="button" className={s.pagerBtn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>次へ →</button>
        </div>
      ) : null}
    </div>
  );
}
