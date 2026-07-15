import s from '../app/wallet.module.css';

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
 * ========================================================================== */

type OnrampKind = 'direct' | 'swap' | 'advanced';

export interface OnrampLink {
  name: string;
  /** 誰向け・何ができるかの一言。 */
  blurb: string;
  href: string;
  kind: OnrampKind;
  /** false = プレースホルダー(未確定・非表示)。オーナーが確定したら true。 */
  ready: boolean;
}

/** 既定の候補(検証済みの2件 + オーナー差し替え枠3件)。 */
export const DEFAULT_ONRAMP_LINKS: OnrampLink[] = [
  {
    name: 'Transak',
    blurb: 'クレジットカード・銀行振込などで、Polygon の USDT を直接購入(64か国以上)。',
    href: 'https://global.transak.com',
    kind: 'direct',
    ready: true,
  },
  {
    name: 'JPYC(日本の方向け)',
    blurb: '円で日本の規制対応ステーブルコインJPYCを購入 → DEXで Polygon の USDT に交換。手順が多いので上級者向け。',
    href: 'https://jpyc.co.jp/',
    kind: 'advanced',
    ready: true,
  },
  // ▼ オーナー推奨の差し替え枠(取引所/DeFi)。確定したら name/href/kind を入れ ready:true に。
  { name: '(推奨リンク①)', blurb: 'オーナー推奨の取引所またはDeFi。', href: '#', kind: 'direct', ready: false },
  { name: '(推奨リンク②)', blurb: 'オーナー推奨の取引所またはDeFi。', href: '#', kind: 'swap', ready: false },
  { name: '(推奨リンク③)', blurb: 'オーナー推奨の取引所またはDeFi。', href: '#', kind: 'direct', ready: false },
];

const KIND_META: Record<OnrampKind, { label: string; cls: string }> = {
  direct: { label: 'そのまま Polygon USDT', cls: 'ogDirect' },
  swap: { label: '暗号資産→USDTに交換', cls: 'ogSwap' },
  advanced: { label: '上級・手順が多い', cls: 'ogAdvanced' },
};

export function OnrampGuide({
  links = DEFAULT_ONRAMP_LINKS,
  address,
}: {
  links?: OnrampLink[];
  /** 入金アドレス(コピー導線用・任意)。 */
  address?: string;
}) {
  const shown = links.filter((l) => l.ready);
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.cardLabel}>USDTの入手方法(参考)</span>
      </div>

      {/* 最重要の注意 */}
      <div className={s.ogWarn}>
        <span className={s.warnIcon}>⚠</span>
        <span className={s.warnText}>
          送金は必ず <b>Polygon ネットワークの USDT</b> のみ。ほかのネットワークや通貨で送ると
          <b className={s.bad ?? ''}>資産を失います</b>。購入画面では必ず「Polygon」「USDT」を選び、
          {address ? '上のあなたの入金アドレス' : 'あなたの入金アドレス'}を貼り付けてください。
        </span>
      </div>

      <div className={s.ogGrid}>
        {shown.map((l) => {
          const m = KIND_META[l.kind];
          return (
            <a key={l.name} href={l.href} target="_blank" rel="noreferrer noopener" className={s.ogCard}>
              <div className={s.ogTop}>
                <span className={s.ogName}>{l.name}</span>
                <span className={`${s.ogTag} ${s[m.cls] ?? ''}`}>{m.label}</span>
              </div>
              <div className={s.ogBlurb}>{l.blurb}</div>
              <span className={s.ogGo}>ひらく ↗</span>
            </a>
          );
        })}
      </div>

      <p className={s.ogDisclaimer}>
        これらは運営とは無関係の独立した第三者サービスです。運営はこれらのサービスを保証・運用せず、
        本人確認(KYC)や決済・両替は各サービス側で行われます。ご利用は自己責任でお願いします。
        運営が受け取れるのは Polygon の USDT のみで、暗号資産の交換・両替は一切行いません。
      </p>
    </section>
  );
}
