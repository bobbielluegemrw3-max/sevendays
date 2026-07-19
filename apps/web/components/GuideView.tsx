import { Fragment } from 'react';
import Link from 'next/link';
import { GuideIcon, type GuideIconName } from '@/components/GuideIcon';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import { APP_COPY, type Lang } from '@/lib/i18n';
import s from '../app/guide.module.css';

/* /guide(使い方)— 初心者向け完全ガイド(リデザイン)。
 * 絵文字を全廃し、ネオン調ラインSVG(GuideIcon)+図解+本物のNFT馬アートで解説。
 * 事実は公開仕様のみ: 価格テーブルv1.0 / チャンピオン報酬200USDT×7回 /
 * 20:00 MYT一斉レース / レース条件(天候×馬場×コース)。誇大表現・収益約束は書かない。
 * サーバーコンポーネント(GuideIcon は純SVG、NftHorseArt はクライアント島)。
 * 文言は辞書化(APP_COPY[lang].guide)。**太字** と \n(改行)は rich() で描画。 */

/** 辞書文字列の **太字** と \n(改行)を React ノードに変換する。 */
function rich(text: string): React.ReactNode {
  return text.split('\n').map((line, li) => (
    <Fragment key={li}>
      {li > 0 ? <br /> : null}
      {line.split('**').map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part))}
    </Fragment>
  ));
}

const dna = (seed: string): string => '0x' + seed.repeat(32).slice(0, 64);

/** 図解のプロセス箱(アイコン or 馬アート)。 */
function FBox({ icon, horse, title, desc, tone }: {
  icon?: GuideIconName; horse?: { seed: string; name: string };
  title: string; desc: React.ReactNode; tone?: 'gold' | 'good';
}) {
  const toneCls = tone === 'gold' ? s.fboxGold : tone === 'good' ? s.fboxGood : '';
  return (
    <div className={`${s.fbox} ${toneCls}`}>
      {horse ? (
        <span className={s.fArt}><NftHorseArt look={deriveNftLook(dna(horse.seed), horse.name)} /></span>
      ) : (
        <span className={s.fIconWrap}><GuideIcon name={icon!} /></span>
      )}
      <div className={s.fT}>{title}</div>
      <div className={s.fD}>{desc}</div>
    </div>
  );
}
function Arrow() {
  return <span className={s.farrow} aria-hidden="true"><GuideIcon name="swap" /></span>;
}
function SecHead({ no, title, icon }: { no: string; title: string; icon: GuideIconName }) {
  return (
    <div className={s.secHead}>
      <span className={s.ghost} aria-hidden="true">{no}</span>
      <span className={s.secBadge}><GuideIcon name={icon} /></span>
      <div>
        <div className={s.secNo}>STEP {no}</div>
        <div className={s.secT}>{title}</div>
      </div>
    </div>
  );
}
function Tip({ children }: { children: React.ReactNode }) {
  return <div className={s.tip}><span className={s.noteIcon}><GuideIcon name="info" /></span>{children}</div>;
}
function Warn({ children }: { children: React.ReactNode }) {
  return <div className={s.warn}><span className={s.noteIcon}><GuideIcon name="alert" /></span>{children}</div>;
}

export function GuideView({ lang = 'ja' }: { lang?: Lang }) {
  const t = APP_COPY[lang].guide;
  const SECTIONS = [
    { id: 'register', no: '01', title: t.sec_register },
    { id: 'buy', no: '02', title: t.sec_buy },
    { id: 'sell', no: '03', title: t.sec_sell },
    { id: 'race', no: '04', title: t.sec_race },
    { id: 'champion', no: '05', title: t.sec_champion },
    { id: 'team', no: '06', title: t.sec_team },
    { id: 'items', no: '07', title: t.sec_items },
    { id: 'wallet', no: '08', title: t.sec_wallet },
    { id: 'contact', no: '09', title: t.sec_contact },
  ] as const;

  return (
    <div className={s.wrap} id="guide-top">
      <div className={s.h1}>{t.h1}</div>
      <p className={s.lead}>{rich(t.lead)}</p>

      {/* ヒーロー */}
      <div className={s.hero}>
        <span className={s.heroGrid} aria-hidden="true" />
        <span className={s.heroArt}><NftHorseArt look={deriveNftLook(dna('c9'), 'Golden Wind')} /></span>
        <div className={s.heroBody}>
          <div className={s.heroKicker}>SURVIVAL RACE TO LV.7</div>
          <div className={s.heroTitle}>{t.hero_title}</div>
          <div className={s.heroP}>{rich(t.hero_p)}</div>
        </div>
      </div>

      <nav className={s.toc} aria-label={t.toc_aria}>
        {SECTIONS.map((sec) => (
          <a key={sec.id} href={`#${sec.id}`} className={s.tocChip}>{sec.no}. {sec.title}</a>
        ))}
      </nav>

      {/* ① アカウント登録 */}
      <section id="register" className={`${s.sec} ${s.secGold}`}>
        <SecHead no="01" title={t.sec_register} icon="user" />
        <p className={s.p}>{rich(t.reg_p)}</p>
        <div className={`${s.fbox} ${s.fboxGold} ${s.fboxWide}`}>
          <span className={s.fIconWrap}><GuideIcon name="google" /></span>
          <div><div className={s.fT}>{t.reg_box_t}</div><div className={s.fD}>{t.reg_box_d}</div></div>
        </div>
        <Tip>{rich(t.reg_tip)}</Tip>
      </section>

      {/* ② 馬の購入 */}
      <section id="buy" className={`${s.sec} ${s.secCyan}`}>
        <SecHead no="02" title={t.sec_buy} icon="cart" />
        <p className={s.p}>{rich(t.buy_p1)}</p>
        <div className={s.flow}>
          <FBox icon="cart" title={t.buy_b1_t} desc={rich(t.buy_b1_d)} />
          <Arrow />
          <FBox icon="moon" title={t.buy_b2_t} desc={rich(t.buy_b2_d)} />
          <Arrow />
          <FBox horse={{ seed: 'd4', name: 'LV.0' }} title={t.buy_b3_t} desc={rich(t.buy_b3_d)} />
          <Arrow />
          <FBox icon="coins" title={t.buy_b4_t} desc={rich(t.buy_b4_d)} tone="good" />
        </div>
        <p className={s.p}>{rich(t.buy_p2)}</p>
        <div className={s.priceChart}>
          {[
            ['LV.0', '100.00'], ['LV.1', '110.00'], ['LV.2', '121.00'], ['LV.3', '133.10'],
            ['LV.4', '146.41'], ['LV.5', '161.05'], ['LV.6', '177.16'],
          ].map(([d, v], i) => (
            <div key={d} className={`${s.priceCell} ${i === 6 ? s.pcTop : ''}`}>
              <div className={s.priceV}>{v}</div>
              <div className={s.priceBar} style={{ height: `${30 + i * 11}%` }} />
              <div className={s.priceD}>{d}</div>
            </div>
          ))}
        </div>
        <Warn>{rich(t.buy_warn)}</Warn>
      </section>

      {/* ③ 馬の売却 */}
      <section id="sell" className={`${s.sec} ${s.secMagenta}`}>
        <SecHead no="03" title={t.sec_sell} icon="tag" />
        <p className={s.p}>{rich(t.sell_p)}</p>
        <div className={s.flow}>
          <FBox icon="tag" title={t.sell_b1_t} desc={rich(t.sell_b1_d)} />
          <Arrow />
          <FBox icon="swap" title={t.sell_b2_t} desc={rich(t.sell_b2_d)} />
          <Arrow />
          <FBox icon="cash" title={t.sell_b3_t} desc={rich(t.sell_b3_d)} tone="good" />
        </div>
        <Tip>{rich(t.sell_tip)}</Tip>
      </section>

      {/* ④ 毎晩のレース */}
      <section id="race" className={`${s.sec} ${s.secCyan}`}>
        <SecHead no="04" title={t.sec_race} icon="moon" />
        <p className={s.p}>{rich(t.race_p1)}</p>
        <div className={s.timeline}>
          <div className={`${s.tseg} ${s.tsegDay}`}><span className={s.tsegIcon}><GuideIcon name="dice" /></span><div className={s.tsegT}>{t.tl1_t}</div><div className={s.tsegV}>{t.tl1_v}</div></div>
          <div className={`${s.tseg} ${s.tsegLock}`}><span className={s.tsegIcon}><GuideIcon name="alert" /></span><div className={s.tsegT}>{t.tl2_t}</div><div className={s.tsegV}>{t.tl2_v}</div></div>
          <div className={`${s.tseg} ${s.tsegNight}`}><span className={s.tsegIcon}><GuideIcon name="moon" /></span><div className={s.tsegT}>{t.tl3_t}</div><div className={s.tsegV}>{t.tl3_v}</div></div>
          <div className={`${s.tseg} ${s.tsegDay}`}><span className={s.tsegIcon}><GuideIcon name="check" /></span><div className={s.tsegT}>{t.tl4_t}</div><div className={s.tsegV}>{t.tl4_v}</div></div>
        </div>
        <p className={s.p}>{rich(t.race_p2)}</p>
        <p className={s.p}>{rich(t.race_p3)}</p>
        <p className={s.p}>{rich(t.race_p4)}</p>
        {/* Decision 101-6(R1): 「上手い人が勝つゲーム」の正直明記 — 隠さない */}
        <p className={s.p}>{rich(t.race_honest)}</p>
        <Tip>{rich(t.race_tip)}</Tip>
      </section>

      {/* ⑤ Day7チャンピオン */}
      <section id="champion" className={`${s.sec} ${s.secGold}`}>
        <SecHead no="05" title={t.sec_champion} icon="trophy" />
        <p className={s.p}>{rich(t.champ_p1)}</p>
        <div className={s.ladder}>
          {['Day1', 'Day2', 'Day3', 'Day4', 'Day5', 'Day6'].map((d) => (
            <div key={d} className={s.rung}>
              <div className={s.rungDay}>{d}</div>
              <div className={s.rungV}>{t.ladder_survive}</div>
            </div>
          ))}
          <div className={`${s.rung} ${s.rungChampion}`}>
            <span className={s.champHorse}><NftHorseArt look={deriveNftLook(dna('a1'), 'Royal Thunder')} /></span>
            <div className={s.rungDay}>Day7</div>
            <div className={s.rungV}>{t.ladder_day7_v}</div>
          </div>
        </div>
        <p className={s.p}>{rich(t.champ_p2)}</p>
        <Tip>{rich(t.champ_tip)}</Tip>
      </section>

      {/* ⑥ TEAM */}
      <section id="team" className={`${s.sec} ${s.secMagenta}`}>
        <SecHead no="06" title={t.sec_team} icon="growth" />
        <p className={s.p}>{rich(t.team_p1)}</p>
        <div className={s.treeWrap}>
          <svg className={s.treeSvg} viewBox="0 0 320 150" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t.tree_svg_aria}>
            <g fill="none" stroke="rgba(0,234,255,0.4)" strokeWidth="1.4">
              <path d="M160 34 V50 M60 66 H260 M60 66 V78 M160 66 V78 M260 66 V78 M40 100 H100 M40 100 V112 M100 100 V112 M260 100 V112" />
            </g>
            <g fontFamily="Orbitron,sans-serif" fontWeight="700" textAnchor="middle">
              <rect x="122" y="12" width="76" height="24" rx="12" fill="rgba(201,168,106,0.14)" stroke="rgba(201,168,106,0.6)" /><text x="160" y="28" fontSize="11" fill="#f0d9a8">{t.tree_you}</text>
              <rect x="28" y="78" width="64" height="22" rx="11" fill="rgba(0,234,255,0.06)" stroke="rgba(0,234,255,0.35)" /><text x="60" y="93" fontSize="10" fill="#eae7ff">{t.tree_fa}</text>
              <rect x="128" y="78" width="64" height="22" rx="11" fill="rgba(0,234,255,0.06)" stroke="rgba(0,234,255,0.35)" /><text x="160" y="93" fontSize="10" fill="#eae7ff">{t.tree_fb}</text>
              <rect x="228" y="78" width="64" height="22" rx="11" fill="rgba(0,234,255,0.06)" stroke="rgba(0,234,255,0.35)" /><text x="260" y="93" fontSize="10" fill="#eae7ff">{t.tree_fc}</text>
              <rect x="12" y="112" width="56" height="20" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" /><text x="40" y="126" fontSize="9" fill="#8f8ac2">{t.tree_fa_sub}</text>
              <rect x="72" y="112" width="56" height="20" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" /><text x="100" y="126" fontSize="9" fill="#8f8ac2">{t.tree_fa_sub}</text>
              <rect x="232" y="112" width="56" height="20" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" /><text x="260" y="126" fontSize="9" fill="#8f8ac2">{t.tree_fb_sub}</text>
            </g>
          </svg>
        </div>
        <p className={s.p}>{rich(t.team_p2)}</p>
        <div className={s.flow}>
          <FBox icon="link" title={t.team_b1_t} desc={rich(t.team_b1_d)} />
          <Arrow />
          <FBox icon="growth" title={t.team_b2_t} desc={rich(t.team_b2_d)} />
          <Arrow />
          <FBox icon="gift" title={t.team_b3_t} desc={rich(t.team_b3_d)} tone="gold" />
        </div>
        <Warn>{rich(t.team_warn)}</Warn>
      </section>

      {/* ⑦ アイテム */}
      <section id="items" className={`${s.sec} ${s.secCyan}`}>
        <SecHead no="07" title={t.sec_items} icon="bag" />
        <p className={s.p}>{rich(t.items_p1)}</p>
        <div className={s.flow}>
          <FBox icon="bag" title={t.items_b1_t} desc={rich(t.items_b1_d)} />
          <Arrow />
          <FBox horse={{ seed: 'b2', name: 'race' }} title={t.items_b2_t} desc={rich(t.items_b2_d)} />
          <Arrow />
          <FBox icon="dice" title={t.items_b3_t} desc={rich(t.items_b3_d)} tone="gold" />
        </div>
        <p className={s.p}>{rich(t.items_p2)}</p>
        <Tip>{rich(t.items_tip)}</Tip>
      </section>

      {/* ⑧ 入出金 */}
      <section id="wallet" className={`${s.sec} ${s.secGold}`}>
        <SecHead no="08" title={t.sec_wallet} icon="wallet" />
        <p className={s.p}>{rich(t.wallet_p)}</p>
        <div className={s.flow}>
          <FBox icon="inbox" title={t.w_b1_t} desc={rich(t.w_b1_d)} />
          <Arrow />
          <FBox icon="chain" title={t.w_b2_t} desc={rich(t.w_b2_d)} />
          <Arrow />
          <FBox icon="check" title={t.w_b3_t} desc={rich(t.w_b3_d)} tone="good" />
        </div>
        <div className={s.flow}>
          <FBox icon="outbox" title={t.w_b4_t} desc={rich(t.w_b4_d)} />
          <Arrow />
          <FBox icon="search" title={t.w_b5_t} desc={rich(t.w_b5_d)} />
          <Arrow />
          <FBox icon="send" title={t.w_b6_t} desc={rich(t.w_b6_d)} tone="good" />
        </div>
        <Warn>{rich(t.wallet_warn)}</Warn>
      </section>

      {/* ⑨ お問い合わせ */}
      <section id="contact" className={`${s.sec} ${s.secMagenta}`}>
        <SecHead no="09" title={t.sec_contact} icon="support" />
        <p className={s.p}>{rich(t.contact_p)}</p>
        <div className={s.flow}>
          <FBox icon="form" title={t.c_b1_t} desc={rich(t.c_b1_d)} />
          <span className={s.farrow} style={{ transform: 'none' }} aria-hidden="true"><GuideIcon name="swap" /></span>
          <FBox icon="mail" title={t.c_b2_t} desc="support@sevendaysderby.com" />
        </div>
        <div className={`${s.fbox} ${s.fboxGold} ${s.fboxWide}`}>
          <span className={s.fIconWrap}><GuideIcon name="support" /></span>
          <div><div className={s.fT}>{t.c_box_t}</div><div className={s.fD}>{t.c_box_d}</div></div>
        </div>
        <p className={s.p}>
          <Link href="/contact">{t.contact_link}</Link>
        </p>
      </section>

      <a href="#guide-top" className={s.backTop}>{t.back_top}</a>
    </div>
  );
}
