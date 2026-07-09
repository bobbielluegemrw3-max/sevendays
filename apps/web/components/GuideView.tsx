import Link from 'next/link';
import s from '../app/guide.module.css';

/* /guide(使い方)— 初心者向け完全ガイド。純粋な静的表示(サーバー)。
 * 事実は公開仕様のみ: 価格テーブルv1.0 / チャンピオン報酬200USDT×7回 /
 * 20:00 MYT一斉レース / アイテム設定1〜6。誇大表現・収益約束は書かない。 */

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
  { id: 'ceo', no: '10', title: 'CEOからのメッセージ' },
] as const;

function Arrow() {
  return <span className={s.farrow} aria-hidden="true">→</span>;
}

export function GuideView() {
  return (
    <div className={s.wrap} id="guide-top">
      <div className={s.h1}>使い方ガイド</div>
      <p className={s.lead}>
        Seven Days Derby は、NFTの競走馬とともに<b>7日間のサバイバルレース</b>を戦うゲームです。
        このページでは、登録からチャンピオン獲得までの流れを初心者向けに解説します。
      </p>

      <nav className={s.toc} aria-label="目次">
        {SECTIONS.map((sec) => (
          <a key={sec.id} href={`#${sec.id}`} className={s.tocChip}>{sec.no}. {sec.title}</a>
        ))}
      </nav>

      {/* ① アカウント登録 */}
      <section id="register" className={s.sec}>
        <div className={s.secNo}>STEP 01</div>
        <div className={s.secT}>アカウント登録</div>
        <p className={s.p}>
          ログイン方法は<b>3種類</b>。どれで始めても、あとから相互に連携できます
          (例: メールで登録して、あとからMetaMaskを繋ぐ)。
        </p>
        <div className={s.flow}>
          <div className={s.fbox}>
            <div className={s.fIcon}>🔵</div>
            <div className={s.fT}>Google</div>
            <div className={s.fD}>ワンクリックで開始</div>
          </div>
          <div className={s.fbox}>
            <div className={s.fIcon}>🦊</div>
            <div className={s.fT}>MetaMask</div>
            <div className={s.fD}>ウォレット署名で開始</div>
          </div>
          <div className={s.fbox}>
            <div className={s.fIcon}>✉️</div>
            <div className={s.fT}>メールアドレス</div>
            <div className={s.fD}>メール+パスワード</div>
          </div>
        </div>
        <div className={s.flow}>
          <div className={`${s.fbox} ${s.fboxGold}`}>
            <div className={s.fIcon}>👤</div>
            <div className={s.fT}>1つのオーナーアカウント</div>
            <div className={s.fD}>残高・馬・履歴はすべて共通。アカウントページでいつでも連携を追加できます</div>
          </div>
        </div>
        <div className={s.tip}>
          友人の紹介リンクから登録すると、その友人のTEAM(応援組織)に加わります(⑥参照)。
        </div>
      </section>

      {/* ② 馬の購入 */}
      <section id="buy" className={s.sec}>
        <div className={s.secNo}>STEP 02</div>
        <div className={s.secT}>馬の購入</div>
        <p className={s.p}>
          馬は「購入セッション」を作成して迎えます。あなたの馬は毎晩20:00(マレーシア時間)の
          バッチで決定され、DNAから<b>見た目・名前・能力が一意に生成</b>されます(あとから変更不可・完全に決定論)。
        </p>
        <div className={s.flow}>
          <div className={s.fbox}>
            <div className={s.fIcon}>🛒</div>
            <div className={s.fT}>セッション作成</div>
            <div className={s.fD}>177.16 USDT をロック<br />(価格テーブル上限)</div>
          </div>
          <Arrow />
          <div className={s.fbox}>
            <div className={s.fIcon}>🌙</div>
            <div className={s.fT}>20:00 バッチ</div>
            <div className={s.fD}>あなたの馬が決定</div>
          </div>
          <Arrow />
          <div className={s.fbox}>
            <div className={s.fIcon}>🐴</div>
            <div className={s.fT}>Day0 ミント</div>
            <div className={s.fD}>請求 102 USDT<br />(価格100+手数料2)</div>
          </div>
          <Arrow />
          <div className={`${s.fbox} ${s.fboxGood}`}>
            <div className={s.fIcon}>💰</div>
            <div className={s.fT}>差額は自動返金</div>
            <div className={s.fD}>ロック額との差額が残高に戻ります</div>
          </div>
        </div>
        <p className={s.p}>
          マーケットで<b>他のオーナーの馬(Day1〜Day6)</b>を買うこともできます。
          日数が進んだ馬ほど価格テーブルが上がります:
        </p>
        <div className={s.priceRow}>
          {[
            ['Day0', '100.00'], ['Day1', '110.00'], ['Day2', '121.00'], ['Day3', '133.10'],
            ['Day4', '146.41'], ['Day5', '161.05'], ['Day6', '177.16'],
          ].map(([d, v]) => (
            <div key={d} className={s.priceCell}>
              <div className={s.priceD}>{d}</div>
              <div className={s.priceV}>{v}</div>
            </div>
          ))}
        </div>
        <div className={s.warn}>
          <b>重要なリスク:</b> 馬は毎晩のレースで<b>BURN(NFT消滅)する可能性</b>があります。
          消滅した馬と支払った代金は戻りません。必ず余裕資金の範囲でお楽しみください。
        </div>
      </section>

      {/* ③ 馬の売却 */}
      <section id="sell" className={s.sec}>
        <div className={s.secNo}>STEP 03</div>
        <div className={s.secT}>馬の売却(マーケット)</div>
        <p className={s.p}>
          Day1〜Day6の馬は、あなたの判断で<b>マーケットに出品</b>できます。
          「チャンピオンまで走らせるか、途中で売って利益を確定するか」— この駆け引きがSeven Days Derbyの醍醐味です。
        </p>
        <div className={s.flow}>
          <div className={s.fbox}>
            <div className={s.fIcon}>🏷️</div>
            <div className={s.fT}>出品</div>
            <div className={s.fD}>馬詳細ページから<br />Day1〜6のみ</div>
          </div>
          <Arrow />
          <div className={s.fbox}>
            <div className={s.fIcon}>🤝</div>
            <div className={s.fT}>購入者が決定</div>
            <div className={s.fD}>今夜のバッチで成立</div>
          </div>
          <Arrow />
          <div className={`${s.fbox} ${s.fboxGood}`}>
            <div className={s.fIcon}>💵</div>
            <div className={s.fT}>売却代金を受取</div>
            <div className={s.fD}>馬は新オーナーの元で残りの日程を走ります</div>
          </div>
        </div>
        <div className={s.tip}>
          出品・購入には毎晩の締切があります(レース処理中はマーケットが一時ロックされます)。
        </div>
      </section>

      {/* ④ 毎晩のレース */}
      <section id="race" className={s.sec}>
        <div className={s.secNo}>STEP 04</div>
        <div className={s.secT}>毎晩のレース</div>
        <p className={s.p}>
          毎晩<b>20:00(マレーシア時間)</b>、その日の全ての馬が一斉に走ります。
          レース結果で馬は<b>「生存」か「BURN」</b>に分かれ、生存した馬はDayが1つ進みます。
        </p>
        <div className={s.timeline}>
          <div className={`${s.tseg} ${s.tsegDay}`}>
            <div className={s.tsegT}>日中</div>
            <div className={s.tsegV}>アイテム適用・売買・作戦タイム</div>
          </div>
          <div className={`${s.tseg} ${s.tsegLock}`}>
            <div className={s.tsegT}>レース前</div>
            <div className={s.tsegV}>締切(マーケット・アイテムがロック)</div>
          </div>
          <div className={`${s.tseg} ${s.tsegNight}`}>
            <div className={s.tsegT}>20:00 MYT</div>
            <div className={s.tsegV}>一斉レース(Daily Derbyで観戦)</div>
          </div>
          <div className={`${s.tseg} ${s.tsegDay}`}>
            <div className={s.tsegT}>直後</div>
            <div className={s.tsegV}>結果確定: 生存→次のDayへ / BURN</div>
          </div>
        </div>
        <p className={s.p}>
          <b>レースは誰にも操作できません。</b>結果は事前にコミット(封印)された乱数シードから
          決定論的に計算され、レース後にシードが公開されます。誰でも結果を再計算して
          検証できる「コミット・リビール方式」です。運営もあなたも、結果を変えることはできません。
        </p>
        <div className={s.tip}>
          RACEページの「Daily Derby」で、毎晩のレースをライブ風の演出で観戦できます。
          自分の馬の走りには専用のハイライトが入ります。
        </div>
      </section>

      {/* ⑤ Day7チャンピオン */}
      <section id="champion" className={s.sec}>
        <div className={s.secNo}>STEP 05</div>
        <div className={s.secT}>Day7達成 — チャンピオン</div>
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
            <div className={s.rungDay}>Day7</div>
            <div className={s.rungV}>🏆 200 USDT + 記念NFT</div>
          </div>
        </div>
        <p className={s.p}>
          チャンピオンの実績と報酬スケジュールは<b>CHAMPIONページ</b>に集約されています。
          あなたのチャンピオン報酬の支払い状況も、殿堂(Hall of Champions)もここで確認できます。
        </p>
        <div className={s.tip}>
          アクティブユーザーが10,000人に到達すると、チャンピオン馬だけが出走できる
          週次の頂上リーグ「Champion League」が開幕します。
        </div>
      </section>

      {/* ⑥ TEAM */}
      <section id="team" className={s.sec}>
        <div className={s.secNo}>STEP 06</div>
        <div className={s.secT}>TEAMボーナスと組織の作り方</div>
        <p className={s.p}>
          あなた専用の<b>紹介リンク</b>(TEAMページで確認)から友人が登録すると、
          あなたの<b>応援組織(TEAM)</b>に加わります。友人がさらに友人を招くと、
          組織は下へ広がっていきます(最大7段まで)。
        </p>
        <div className={s.tree}>
          <div className={s.treeRow}><span className={`${s.node} ${s.nodeYou}`}>あなた</span></div>
          <div className={s.treeLine}>┌────────┼────────┐</div>
          <div className={s.treeRow}>
            <span className={s.node}>友人A</span>
            <span className={s.node}>友人B</span>
            <span className={s.node}>友人C</span>
          </div>
          <div className={s.treeLine}>┌──┴──┐&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│</div>
          <div className={s.treeRow}>
            <span className={s.node}>Aの友人</span>
            <span className={s.node}>Aの友人</span>
            <span className={s.node}>Bの友人</span>
          </div>
        </div>
        <p className={s.p}>
          組織のメンバーの馬がレースを走ると、その活動に応じて<b>サポートボーナス</b>が
          発生します。受け取れる段数(ティア)は、<b>組織全体の活動量</b>に応じて解放されていきます —
          つまり「自分が直接誘った人数」だけでなく、<b>組織を育てること</b>が鍵です。
        </p>
        <div className={s.flow}>
          <div className={s.fbox}>
            <div className={s.fIcon}>🔗</div>
            <div className={s.fT}>紹介リンクを共有</div>
            <div className={s.fD}>TEAMページで取得</div>
          </div>
          <Arrow />
          <div className={s.fbox}>
            <div className={s.fIcon}>🌱</div>
            <div className={s.fT}>組織が育つ</div>
            <div className={s.fD}>友人の友人まで広がる(7段)</div>
          </div>
          <Arrow />
          <div className={`${s.fbox} ${s.fboxGold}`}>
            <div className={s.fIcon}>🎁</div>
            <div className={s.fT}>ティア解放</div>
            <div className={s.fD}>組織の活動量でより深い段まで受取り</div>
          </div>
        </div>
        <div className={s.warn}>
          サポートボーナスは組織の活動に応じて変動します。<b>収益の約束・保証は一切ありません。</b>
          詳しい条件と現在のティア状況はTEAMページでご確認ください。
        </div>
      </section>

      {/* ⑦ アイテム */}
      <section id="items" className={s.sec}>
        <div className={s.secNo}>STEP 07</div>
        <div className={s.secT}>アイテム</div>
        <p className={s.p}>
          ITEMSページのショップで<b>30種類のアイテム</b>を購入できます
          (ベーシック / スタンダード / プレミアムの3バンド)。さらに、馬がBURNされたときに
          一定確率でドロップする<b>限定アイテム5種</b>は、ショップでは買えません。
        </p>
        <div className={s.flow}>
          <div className={s.fbox}>
            <div className={s.fIcon}>🎒</div>
            <div className={s.fT}>アイテムを入手</div>
            <div className={s.fD}>ショップ購入 / BURNドロップ / ギフト受取</div>
          </div>
          <Arrow />
          <div className={s.fbox}>
            <div className={s.fIcon}>🐎</div>
            <div className={s.fT}>レース前に馬へ適用</div>
            <div className={s.fD}>馬の詳細ページから。今夜のスコアに影響(上限あり)</div>
          </div>
          <Arrow />
          <div className={`${s.fbox} ${s.fboxGold}`}>
            <div className={s.fIcon}>🎰</div>
            <div className={s.fT}>アイテム設定 1〜6</div>
            <div className={s.fD}>毎レース公開。効き方が変わる(シードから決定・検証可能)</div>
          </div>
        </div>
        <p className={s.p}>
          毎レースの「<b>アイテム設定</b>」(1〜6)によってアイテムの効き方が変わります。
          設定はレースのシードから決まるため、<b>運営が操作することはできません</b>。
          レース後に誰でも検証できます。
        </p>
        <div className={s.tip}>
          アイテムは他のオーナーへ<b>メールアドレス指定でギフト</b>できます(一部を除く)。
          仲間の勝負どころに角砂糖を贈る — そんな使い方も。
        </div>
      </section>

      {/* ⑧ 入出金 */}
      <section id="wallet" className={s.sec}>
        <div className={s.secNo}>STEP 08</div>
        <div className={s.secT}>入金・出金</div>
        <p className={s.p}>
          ゲーム内通貨は <b>USDT(Polygonネットワーク)</b>です。WALLETページですべて完結します。
        </p>
        <div className={s.flow}>
          <div className={s.fbox}>
            <div className={s.fIcon}>📥</div>
            <div className={s.fT}>入金</div>
            <div className={s.fD}>あなた専用の入金アドレスへUSDT(Polygon)を送金</div>
          </div>
          <Arrow />
          <div className={s.fbox}>
            <div className={s.fIcon}>⛓️</div>
            <div className={s.fT}>チェーン確認</div>
            <div className={s.fD}>所定の承認数の後、残高に反映</div>
          </div>
          <Arrow />
          <div className={`${s.fbox} ${s.fboxGood}`}>
            <div className={s.fIcon}>✅</div>
            <div className={s.fT}>残高反映</div>
            <div className={s.fD}>馬・アイテムの購入に使えます</div>
          </div>
        </div>
        <div className={s.flow}>
          <div className={s.fbox}>
            <div className={s.fIcon}>📤</div>
            <div className={s.fT}>出金申請</div>
            <div className={s.fD}>WALLETページから宛先アドレスと金額を指定</div>
          </div>
          <Arrow />
          <div className={s.fbox}>
            <div className={s.fIcon}>🔍</div>
            <div className={s.fT}>審査</div>
            <div className={s.fD}>高額出金は複数名の承認が必要なため時間がかかる場合があります</div>
          </div>
          <Arrow />
          <div className={`${s.fbox} ${s.fboxGood}`}>
            <div className={s.fIcon}>💸</div>
            <div className={s.fT}>送金</div>
            <div className={s.fD}>あなたのウォレットへUSDTが届きます</div>
          </div>
        </div>
        <div className={s.warn}>
          <b>必ずPolygonネットワークのUSDT</b>を使用してください。
          他のネットワークやトークンで送ると資産を失う可能性があります。
        </div>
      </section>

      {/* ⑨ お問い合わせ */}
      <section id="contact" className={s.sec}>
        <div className={s.secNo}>STEP 09</div>
        <div className={s.secT}>お問い合わせ</div>
        <p className={s.p}>
          わからないことがあれば、いつでもサポートチームにご連絡ください。
          ご登録のメールアドレスへ返信します。
        </p>
        <div className={s.flow}>
          <div className={s.fbox}>
            <div className={s.fIcon}>📝</div>
            <div className={s.fT}>お問い合わせフォーム</div>
            <div className={s.fD}>ナビの「お問い合わせ」から(おすすめ)</div>
          </div>
          <div className={s.farrow} aria-hidden="true">or</div>
          <div className={s.fbox}>
            <div className={s.fIcon}>✉️</div>
            <div className={s.fT}>メール</div>
            <div className={s.fD}>support@sevendaysderby.com</div>
          </div>
        </div>
        <div className={s.flow}>
          <div className={`${s.fbox} ${s.fboxGold}`}>
            <div className={s.fIcon}>🤖+👤</div>
            <div className={s.fT}>AI+サポートチームが確認して返信</div>
            <div className={s.fD}>グローバル対応 — お問い合わせの言語で返信します(日本語/英語ほか)</div>
          </div>
        </div>
        <p className={s.p}>
          <Link href="/contact">→ お問い合わせフォームを開く</Link>
        </p>
      </section>

      {/* ⑩ CEOメッセージ(プレースホルダ) */}
      <section id="ceo" className={s.sec}>
        <div className={s.secNo}>STEP 10</div>
        <div className={s.secT}>CEOからのメッセージ</div>
        <div className={s.ceo}>
          <div className={s.ceoT}>COMING SOON</div>
          <div className={s.ceoD}>CEOからのメッセージは近日公開予定です。</div>
        </div>
      </section>

      <a href="#guide-top" className={s.backTop}>↑ ページ上部へ戻る</a>
    </div>
  );
}
