import type { AppDict } from '@/lib/i18n-shared';
import s from '../app/wallet.module.css';

/** /wallet の文言(サーバー親から受け取る)。 */
type WalletCopy = AppDict['walletPage'];

/* ============================================================================
 * OnrampGuide — USDTの入手方法(参考リンク集)。メインネット移行時に有効化する。
 *
 * 法的生命線: 運営は常にUSDTのみ受領し、暗号資産の交換・両替は一切しない
 * (LEGAL_REVIEW_MEMO 2026-07-15)。ここは「第三者サービスへの中立な参考リンク」
 * であって、運営が両替を行うものではない。免責を明示し、投資・利回りを匂わせる
 * 語は入れない(「単なるゲーム」framing維持)。
 *
 * 安全設計: 着金するのは Polygon の USDT のみ。各リンクの出口が
 *  - DIRECT  : そのまま Polygon USDT が手に入る(最も安全)
 *  - SWAP    : 既に暗号資産を持つ人がDEXでUSDTに替える
 *  - ADVANCED: 多段(円→別トークン→USDTスワップ等)。上級者向け・事故りやすい
 * をタグで明示する。
 *
 * リンクは5枠。オーナーの推奨(取引所/DeFi)を差し替え可能。差し替え時は必ず
 * 「出口が Polygon USDT か」を確認し kind を正しく付けること(placeholderは非表示)。
 *
 * 広告表記(重要): オーナー推奨枠は紹介(リファラル)リンク=運営が特典を受け取り得るため
 * 「無関係」とは書けない。景表法ステマ規制(2023-10〜)に従い、免責で「広告・紹介リンクを含む/
 * 運営が特典を受け取る場合がある」を明示する。紹介リンクを追加/差し替える時はこの表記を維持。
 * ========================================================================== */

type OnrampKind = 'direct' | 'swap' | 'advanced';

export interface OnrampLink {
  name: string;
  /** 誰向け・何ができるかの一言。 */
  /** 説明文の辞書キー(文言は walletPage セクション)。 */
  blurbKey: 'og_blurb_transak' | 'og_blurb_tria' | 'og_blurb_coinrabbit' | 'og_blurb_bingx';
  href: string;
  kind: OnrampKind;
  /** false = プレースホルダー(未確定・非表示)。オーナーが確定したら true。 */
  ready: boolean;
}

/** 既定の候補。すべて国を問わず使えるグローバルサービスに統一(国中立)。
 *  日本特化のJPYCは外した(Decision 2026-07-15): 1国だけ特化すると日本偏りになり、
 *  かといって各国パリティは不可能 — 中国は暗号資産が全面禁止、韓国は取引所の外部
 *  ウォレット出金がトラベルルールで厳しく制限。ゆえに国中立が最も公平で安全。 */
export const DEFAULT_ONRAMP_LINKS: OnrampLink[] = [
  {
    name: 'Transak',
    blurbKey: 'og_blurb_transak',
    href: 'https://global.transak.com',
    kind: 'direct',
    ready: true,
  },
  // ▼ オーナー推奨(2026-07-15確定)。いずれも紹介(リファラル)リンク=下の免責で広告関係を明示。
  {
    name: 'tria',
    blurbKey: 'og_blurb_tria',
    href: 'https://app.tria.so/?accessCode=1PB4UF5945',
    kind: 'direct',
    ready: true,
  },
  {
    name: 'CoinRabbit',
    blurbKey: 'og_blurb_coinrabbit',
    href: 'https://coinrabbit.io/?referral=AZL4X8RN4v',
    kind: 'swap',
    ready: true,
  },
  {
    name: 'BingX',
    blurbKey: 'og_blurb_bingx',
    href: 'https://bingxdao.com/invite/GWWGLE/',
    kind: 'advanced',
    ready: true,
  },
];

const KIND_CLASS: Record<OnrampKind, string> = {
  direct: 'ogDirect',
  swap: 'ogSwap',
  advanced: 'ogAdvanced',
};
const kindLabel = (kind: OnrampKind, t: WalletCopy): string =>
  kind === 'direct' ? t.og_kind_direct : kind === 'swap' ? t.og_kind_swap : t.og_kind_advanced;

export function OnrampGuide({
  links = DEFAULT_ONRAMP_LINKS,
  address,
  t,
}: {
  links?: OnrampLink[];
  /** 入金アドレス(コピー導線用・任意)。 */
  address?: string;
  /** /wallet の文言。 */
  t: WalletCopy;
}) {
  const shown = links.filter((l) => l.ready);
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.cardLabel}>{t.og_label}</span>
      </div>

      {/* 最重要の注意 */}
      <div className={s.ogWarn}>
        <span className={s.warnIcon}>⚠</span>
        <span className={s.warnText}>
          {t.og_warn_a}<b>{t.og_warn_network}</b>{t.og_warn_b}
          <b className={s.bad ?? ''}>{t.og_warn_lost}</b>{t.og_warn_c}
          {address ? t.og_warn_addr_here : t.og_warn_addr}{t.og_warn_d}
        </span>
      </div>

      <div className={s.ogGrid}>
        {shown.map((l) => {
          return (
            <a key={l.name} href={l.href} target="_blank" rel="noreferrer noopener" className={s.ogCard}>
              <div className={s.ogTop}>
                <span className={s.ogName}>{l.name}</span>
                <span className={`${s.ogTag} ${s[KIND_CLASS[l.kind]] ?? ''}`}>{kindLabel(l.kind, t)}</span>
              </div>
              <div className={s.ogBlurb}>{t[l.blurbKey]}</div>
              <span className={s.ogGo}>{t.og_open}</span>
            </a>
          );
        })}
      </div>

      <p className={s.ogDisclaimer}>
        <b>{t.og_disclaimer_head}</b>{t.og_disclaimer}
      </p>
    </section>
  );
}
