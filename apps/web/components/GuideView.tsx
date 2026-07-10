import Link from 'next/link';
import { GuideIcon, type GuideIconName } from '@/components/GuideIcon';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import s from '../app/guide.module.css';

/* /guide(使い方)— 初心者向け完全ガイド(リデザイン)。
 * 絵文字を全廃し、ネオン調ラインSVG(GuideIcon)+図解+本物のNFT馬アートで解説。
 * 事実は公開仕様のみ: 価格テーブルv1.0 / チャンピオン報酬200USDT×7回 /
 * 20:00 MYT一斉レース / レース条件(天候×馬場×コース)。誇大表現・収益約束は書かない。
 * サーバーコンポーネント(GuideIcon は純SVG、NftHorseArt はクライアント島)。 */

const SECTIONS = [
  { id: 'register', no: '01', title: 'アカウント登録' },
  { id: 'buy', no: '02', title: '馬の購入' },
  { id: 'sell', no: '03', title: '馬の売却(マーケット)' },
  { id: 'race', no: '04', title: '毎晩のレース' },
  { id: 'champion', no: '05', title: 'Day7達成 — チャンピオン' },
  { id: 'team', no: '06', title: 'TEAMボーナスと組織の作り方' },
  { id: 'items', no: '07', title: 'アイテム' },
  { id: 'wallet', no: '08', title: '入金・出金' },
  { id: 'contact', no: '09', title: 'お問い合わせ' },
] as const;

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

/** ApeAvatar — 削除済み(CEOメッセージ不要のため)。 */

function Warn({ children }: { children: React.ReactNode }) {
  return <div className={s.warn}><span className={s.noteIcon}><GuideIcon name="alert" /></span>{children}</div>;
}

export function GuideView() {
  return (
    <div className={s.wrap} id="guide-top">
      <div className={s.h1}>使い方ガイド</div>
      <p className={s.lead}>
        Seven Days Derby は、NFTの競走馬とともに<b>7日間のサバイバルレース</b>を戦うゲームです。
        このページでは、登録からチャンピオン獲得までの流れを初心者向けに図解します。
      </p>

      {/* ヒーロー */}
      <div className={s.hero}>
        <span className={s.heroGrid} aria-hidden="true" />
        <span className={s.heroArt}><NftHorseArt look={deriveNftLook(dna('c9'), 'Golden Wind')} /></span>
        <div className={s.heroBody}>
          <div className={s.heroKicker}>7-DAY SURVIVAL RACE</div>
          <div className={s.heroTitle}>7日間を走り切れ</div>
          <div className={s.heroP}>
            毎晩20:00(マレーシア時間)、全ての馬が一斉に走ります。生き残った馬は日ごとに価値を上げ、
            7日目を走破すれば200 USDTのチャンピオン報酬と記念NFTに。
          </div>
        </div>
      </div>

      <nav className={s.toc} aria-label="目次">
        {SECTIONS.map((sec) => (
          <a key={sec.id} href={`#${sec.id}`} className={s.tocChip}>{sec.no}. {sec.title}</a>
        ))}
      </nav>

      {/* ① アカウント登録 */}
      <section id="register" className={`${s.sec} ${s.secGold}`}>
        <SecHead no="01" title="アカウント登録" icon="user" />
        <p className={s.p}>
          ログイン方法は<b>3種類</b>。どれで始めても、あとから相互に連携できます
          (例: メールで登録して、あとからMetaMaskを繋ぐ)。
        </p>
        <div className={s.triad}>
          <FBox icon="google" title="Google" desc="ワンクリックで開始" />
          <FBox icon="wallet" title="MetaMask" desc="ウォレット署名で開始" />
          <FBox icon="mail" title="メールアドレス" desc="メール+パスワード" />
        </div>
        <div className={s.mergeInto}><GuideIcon name="swap" /><span className={s.mergeLabel}>3つは1つのオーナーへ統合</span></div>
        <div className={`${s.fbox} ${s.fboxGold} ${s.fboxWide}`}>
          <span className={s.fIconWrap}><GuideIcon name="user" /></span>
          <div><div className={s.fT}>1つのオーナーアカウント</div><div className={s.fD}>残高・馬・履歴はすべて共通。アカウントページでいつでも連携を追加できます</div></div>
        </div>
        <Tip>友人の紹介リンクから登録すると、その友人のTEAM(応援組織)に加わります(⑥参照)。</Tip>
      </section>

      {/* ② 馬の購入 */}
      <section id="buy" className={`${s.sec} ${s.secCyan}`}>
        <SecHead no="02" title="馬の購入" icon="cart" />
        <p className={s.p}>
          馬は「購入セッション」を作成して迎えます。あなたの馬は毎晩20:00(マレーシア時間)の
          バッチで決定され、DNAから<b>見た目・名前・能力が一意に生成</b>されます(あとから変更不可・完全に決定論)。
        </p>
        <div className={s.flow}>
          <FBox icon="cart" title="セッション作成" desc={<>177.16 USDT をロック<br />(価格テーブル上限)</>} />
          <Arrow />
          <FBox icon="moon" title="20:00 バッチ" desc="あなたの馬が決定" />
          <Arrow />
          <FBox horse={{ seed: 'd4', name: 'Day0' }} title="Day0 ミント" desc={<>請求 102 USDT<br />(価格100+手数料2)</>} />
          <Arrow />
          <FBox icon="coins" title="差額は自動返金" desc="ロック額との差額が残高に戻ります" tone="good" />
        </div>
        <p className={s.p}>
          マーケットで<b>他のオーナーの馬(Day1〜Day6)</b>を買うこともできます。
          日数が進んだ馬ほど価格テーブルが上がります:
        </p>
        <div className={s.priceChart}>
          {[
            ['Day0', '100.00'], ['Day1', '110.00'], ['Day2', '121.00'], ['Day3', '133.10'],
            ['Day4', '146.41'], ['Day5', '161.05'], ['Day6', '177.16'],
          ].map(([d, v], i) => (
            <div key={d} className={`${s.priceCell} ${i === 6 ? s.pcTop : ''}`}>
              <div className={s.priceV}>{v}</div>
              <div className={s.priceBar} style={{ height: `${30 + i * 11}%` }} />
              <div className={s.priceD}>{d}</div>
            </div>
          ))}
        </div>
        <Warn>
          <b>重要なリスク:</b> 馬は毎晩のレースで<b>BURN(NFT消滅)する可能性</b>があります。
          消滅した馬と支払った代金は戻りません。必ず余裕資金の範囲でお楽しみください。
        </Warn>
      </section>

      {/* ③ 馬の売却 */}
      <section id="sell" className={`${s.sec} ${s.secMagenta}`}>
        <SecHead no="03" title="馬の売却(マーケット)" icon="tag" />
        <p className={s.p}>
          Day1〜Day6の馬は、あなたの判断で<b>マーケットに出品</b>できます。
          「チャンピオンまで走らせるか、途中で売って利益を確定するか」— この駆け引きがSeven Days Derbyの醍醐味です。
        </p>
        <div className={s.flow}>
          <FBox icon="tag" title="出品" desc={<>馬詳細ページから<br />Day1〜6のみ</>} />
          <Arrow />
          <FBox icon="swap" title="購入者が決定" desc="今夜のバッチで成立" />
          <Arrow />
          <FBox icon="cash" title="売却代金を受取" desc="馬は新オーナーの元で残りの日程を走ります" tone="good" />
        </div>
        <Tip>出品・購入には毎晩の締切があります(レース処理中はマーケットが一時ロックされます)。</Tip>
      </section>

      {/* ④ 毎晩のレース */}
      <section id="race" className={`${s.sec} ${s.secCyan}`}>
        <SecHead no="04" title="毎晩のレース" icon="moon" />
        <p className={s.p}>
          毎晩<b>20:00(マレーシア時間)</b>、その日の全ての馬が一斉に走ります。
          レース結果で馬は<b>「生存」か「BURN」</b>に分かれ、生存した馬はDayが1つ進みます。
        </p>
        <div className={s.timeline}>
          <div className={`${s.tseg} ${s.tsegDay}`}><span className={s.tsegIcon}><GuideIcon name="dice" /></span><div className={s.tsegT}>日中</div><div className={s.tsegV}>アイテム適用・売買・作戦タイム</div></div>
          <div className={`${s.tseg} ${s.tsegLock}`}><span className={s.tsegIcon}><GuideIcon name="alert" /></span><div className={s.tsegT}>レース前</div><div className={s.tsegV}>締切(マーケット・アイテムがロック)</div></div>
          <div className={`${s.tseg} ${s.tsegNight}`}><span className={s.tsegIcon}><GuideIcon name="moon" /></span><div className={s.tsegT}>20:00 MYT</div><div className={s.tsegV}>一斉レース(Daily Derbyで観戦)</div></div>
          <div className={`${s.tseg} ${s.tsegDay}`}><span className={s.tsegIcon}><GuideIcon name="check" /></span><div className={s.tsegT}>直後</div><div className={s.tsegV}>結果確定: 生存→次のDayへ / BURN</div></div>
        </div>
        <p className={s.p}>
          <b>レースは誰にも操作できません。</b>結果は事前にコミット(封印)された乱数シードから
          決定論的に計算され、レース後にシードが公開されます。誰でも結果を再計算して
          検証できる「コミット・リビール方式」です。運営もあなたも、結果を変えることはできません。
        </p>
        <p className={s.p}>
          <b>毎晩、成績下位の馬はBURN(消滅)します。</b>何頭が走り、何頭が生き残り、
          何頭がBURNされたかの全記録は<b>「台帳」ページ</b>で毎日公開しており、
          CSVでダウンロードして誰でも検証・集計できます。
        </p>
        <p className={s.p}>
          レース演出の最後には<b>「明日の予報」</b>(天候・馬場・コース)が発表されます。
          予報は事前にコミットされたシードから機械的に生成される<b>的中率約70%の参考情報</b>で、
          結果を保証するものではありません。予報に合わせてアイテムを備えるかはあなた次第です。
        </p>
        <Tip>
          RACEページの「Daily Derby」で、毎晩のレースをライブ風の演出で観戦できます。
          自分の馬の走りには専用のハイライトが入ります。
        </Tip>
      </section>

      {/* ⑤ Day7チャンピオン */}
      <section id="champion" className={`${s.sec} ${s.secGold}`}>
        <SecHead no="05" title="Day7達成 — チャンピオン" icon="trophy" />
        <p className={s.p}>
          7晩のレースをすべて生き延びた馬は<b>チャンピオン</b>です。
          <b>200 USDTのチャンピオン報酬</b>(翌日から7回に分けて自動支払い)と、
          殿堂入りの<b>記念NFT</b>(Polygon / ERC-721)を獲得します。
        </p>
        <div className={s.ladder}>
          {['Day1', 'Day2', 'Day3', 'Day4', 'Day5', 'Day6'].map((d) => (
            <div key={d} className={s.rung}>
              <div className={s.rungDay}>{d}</div>
              <div className={s.rungV}>生存</div>
            </div>
          ))}
          <div className={`${s.rung} ${s.rungChampion}`}>
            <span className={s.champHorse}><NftHorseArt look={deriveNftLook(dna('a1'), 'Royal Thunder')} /></span>
            <div className={s.rungDay}>Day7</div>
            <div className={s.rungV}>200 USDT + 記念NFT</div>
          </div>
        </div>
        <p className={s.p}>
          チャンピオンの実績と報酬スケジュールは<b>CHAMPIONページ</b>に集約されています。
          あなたのチャンピオン報酬の支払い状況も、殿堂(Hall of Champions)もここで確認できます。
        </p>
        <Tip>
          アクティブユーザーが10,000人に到達すると、チャンピオン馬だけが出走できる
          週次の頂上リーグ「Champion League」が開幕します。
        </Tip>
      </section>

      {/* ⑥ TEAM */}
      <section id="team" className={`${s.sec} ${s.secMagenta}`}>
        <SecHead no="06" title="TEAMボーナスと組織の作り方" icon="growth" />
        <p className={s.p}>
          あなた専用の<b>紹介リンク</b>(TEAMページで確認)から友人が登録すると、
          あなたの<b>応援組織(TEAM)</b>に加わります。友人がさらに友人を招くと、
          組織は下へ広がっていきます(最大7段まで)。
        </p>
        <div className={s.treeWrap}>
          <svg className={s.treeSvg} viewBox="0 0 320 150" preserveAspectRatio="xMidYMid meet" role="img" aria-label="組織ツリー: あなた → 友人A/B/C → その友人たち">
            <g fill="none" stroke="rgba(0,234,255,0.4)" strokeWidth="1.4">
              <path d="M160 34 V50 M60 66 H260 M60 66 V78 M160 66 V78 M260 66 V78 M40 100 H100 M40 100 V112 M100 100 V112 M260 100 V112" />
            </g>
            <g fontFamily="Orbitron,sans-serif" fontWeight="700" textAnchor="middle">
              <rect x="122" y="12" width="76" height="24" rx="12" fill="rgba(201,168,106,0.14)" stroke="rgba(201,168,106,0.6)" /><text x="160" y="28" fontSize="11" fill="#f0d9a8">あなた</text>
              <rect x="28" y="78" width="64" height="22" rx="11" fill="rgba(0,234,255,0.06)" stroke="rgba(0,234,255,0.35)" /><text x="60" y="93" fontSize="10" fill="#eae7ff">友人A</text>
              <rect x="128" y="78" width="64" height="22" rx="11" fill="rgba(0,234,255,0.06)" stroke="rgba(0,234,255,0.35)" /><text x="160" y="93" fontSize="10" fill="#eae7ff">友人B</text>
              <rect x="228" y="78" width="64" height="22" rx="11" fill="rgba(0,234,255,0.06)" stroke="rgba(0,234,255,0.35)" /><text x="260" y="93" fontSize="10" fill="#eae7ff">友人C</text>
              <rect x="12" y="112" width="56" height="20" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" /><text x="40" y="126" fontSize="9" fill="#8f8ac2">Aの友人</text>
              <rect x="72" y="112" width="56" height="20" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" /><text x="100" y="126" fontSize="9" fill="#8f8ac2">Aの友人</text>
              <rect x="232" y="112" width="56" height="20" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" /><text x="260" y="126" fontSize="9" fill="#8f8ac2">Bの友人</text>
            </g>
          </svg>
        </div>
        <p className={s.p}>
          組織のメンバーの馬がレースを走ると、その活動に応じて<b>サポートボーナス</b>が
          発生します。受け取れる段数(ティア)は、<b>組織全体の活動量</b>に応じて解放されていきます —
          つまり「自分が直接誘った人数」だけでなく、<b>組織を育てること</b>が鍵です。
        </p>
        <div className={s.flow}>
          <FBox icon="link" title="紹介リンクを共有" desc="TEAMページで取得" />
          <Arrow />
          <FBox icon="growth" title="組織が育つ" desc="友人の友人まで広がる(7段)" />
          <Arrow />
          <FBox icon="gift" title="ティア解放" desc="組織の活動量でより深い段まで受取り" tone="gold" />
        </div>
        <Warn>
          サポートボーナスは組織の活動に応じて変動します。<b>収益の約束・保証は一切ありません。</b>
          詳しい条件と現在のティア状況はTEAMページでご確認ください。
        </Warn>
      </section>

      {/* ⑦ アイテム */}
      <section id="items" className={`${s.sec} ${s.secCyan}`}>
        <SecHead no="07" title="アイテム" icon="bag" />
        <p className={s.p}>
          ITEMSページのショップで<b>30種類のアイテム</b>を購入できます
          (ベーシック / スタンダード / プレミアムの3バンド)。さらに、馬がBURNされたときに
          一定確率でドロップする<b>限定アイテム5種</b>は、ショップでは買えません。
        </p>
        <div className={s.flow}>
          <FBox icon="bag" title="アイテムを入手" desc="ショップ購入 / BURNドロップ / ギフト受取" />
          <Arrow />
          <FBox horse={{ seed: 'b2', name: 'race' }} title="レース前に馬へ適用" desc="馬の詳細ページから。今夜のスコアに影響(上限あり)" />
          <Arrow />
          <FBox icon="dice" title="レース条件(天候・馬場・コース)" desc="毎レース公開。アイテムの適性と噛み合うと最大×1.5(シードから決定・検証可能)" tone="gold" />
        </div>
        <p className={s.p}>
          各アイテムには<b>適性</b>(芝巧者・ダート巧者・雨の鬼・道悪の鬼など)があり、
          毎晩の<b>レース条件(天候・馬場・コース)</b>と噛み合うと効果が最大×1.5に伸び、
          逆の条件では×0.5まで鈍ります。条件はレースのシードから決まるため、
          <b>運営が操作することはできません</b>。レース後に誰でも検証できます。
        </p>
        <Tip>
          アイテムは他のオーナーへ<b>メールアドレス指定でギフト</b>できます(一部を除く)。
          仲間の勝負どころに角砂糖を贈る — そんな使い方も。
        </Tip>
      </section>

      {/* ⑧ 入出金 */}
      <section id="wallet" className={`${s.sec} ${s.secGold}`}>
        <SecHead no="08" title="入金・出金" icon="wallet" />
        <p className={s.p}>
          ゲーム内通貨は <b>USDT(Polygonネットワーク)</b>です。WALLETページですべて完結します。
        </p>
        <div className={s.flow}>
          <FBox icon="inbox" title="入金" desc="あなた専用の入金アドレスへUSDT(Polygon)を送金" />
          <Arrow />
          <FBox icon="chain" title="チェーン確認" desc="所定の承認数の後、残高に反映" />
          <Arrow />
          <FBox icon="check" title="残高反映" desc="馬・アイテムの購入に使えます" tone="good" />
        </div>
        <div className={s.flow}>
          <FBox icon="outbox" title="出金申請" desc="WALLETページから宛先アドレスと金額を指定" />
          <Arrow />
          <FBox icon="search" title="審査" desc="高額出金は複数名の承認が必要なため時間がかかる場合があります" />
          <Arrow />
          <FBox icon="send" title="送金" desc="あなたのウォレットへUSDTが届きます" tone="good" />
        </div>
        <Warn>
          <b>必ずPolygonネットワークのUSDT</b>を使用してください。
          他のネットワークやトークンで送ると資産を失う可能性があります。
        </Warn>
      </section>

      {/* ⑨ お問い合わせ */}
      <section id="contact" className={`${s.sec} ${s.secMagenta}`}>
        <SecHead no="09" title="お問い合わせ" icon="support" />
        <p className={s.p}>
          わからないことがあれば、いつでもサポートチームにご連絡ください。
          ご登録のメールアドレスへ返信します。
        </p>
        <div className={s.flow}>
          <FBox icon="form" title="お問い合わせフォーム" desc="ナビの「お問い合わせ」から(おすすめ)" />
          <span className={s.farrow} style={{ transform: 'none' }} aria-hidden="true"><GuideIcon name="swap" /></span>
          <FBox icon="mail" title="メール" desc="support@sevendaysderby.com" />
        </div>
        <div className={`${s.fbox} ${s.fboxGold} ${s.fboxWide}`}>
          <span className={s.fIconWrap}><GuideIcon name="support" /></span>
          <div><div className={s.fT}>AI+サポートチームが確認して返信</div><div className={s.fD}>グローバル対応 — お問い合わせの言語で返信します(日本語/英語ほか)</div></div>
        </div>
        <p className={s.p}>
          <Link href="/contact">→ お問い合わせフォームを開く</Link>
        </p>
      </section>

      <a href="#guide-top" className={s.backTop}>↑ ページ上部へ戻る</a>
    </div>
  );
}
