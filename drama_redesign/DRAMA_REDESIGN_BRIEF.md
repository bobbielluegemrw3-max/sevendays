# Daily Derby「脳汁演出」リデザイン依頼ブリーフ(2026-07-10 R2)

> このファイルと `shots/` のスクリーンショット7枚が依頼資料の全てです。
> 旧版(3幕構成10部品)からオーナー判断で縮小済み — **以下の3パーツだけが対象**です。
> 作成: Seven Days Derby 開発チーム

---

## 1. 何のUIか

Seven Days Derby(NFT競走馬ゲーム)では毎晩20:00に全馬一斉のレース精算があり、
それを約100秒のライブ演出「THE DAILY DERBY」として見せています。
リデザイン対象は次の**3パーツ**:

| # | パーツ | 出るタイミング | スクリーンショット |
|---|--------|----------------|--------------------|
| A | 「本日のレースに参加するあなたの馬」カード | 開始前カウントダウン中 | `01_countdown_tonight.png`(PC)/ `05_tonight_mobile.png`(モバイル) |
| B | レース条件テキスト(一瞬だけ表示・値は色分け) | 20:00通過の約5秒後に約5秒間 | `02_conditions_text.png` |
| C | 審判オーバーレイ(自分の馬の実NFTアート表示) | 自分の馬の結果の瞬間 | BURN: `03`→`04` / 生存: `06` / DAY7: `07` |

演出の思想: **主役は文言ではなく「自分の馬そのもの」**。
BURN=馬が赤熱して暗く沈む(尊厳ある散り際)+ドロップがあれば同じ画面に獲得行を追加、
生存=緑に輝く、DAY7=金に輝く。詩的なセリフは置かない(オーナー指示 — 事実のみ)。
機能は完成済みなので、**見た目だけ**をもっとリッチに・映画的にしてほしいです。

## 2. サイトのデザインシステム(必ず従う)

ほぼ黒地にシアン/マゼンタ/金のネオン。Bloomberg端末×ナイトレースの雰囲気。

```css
--bg: #050409;        --bg-2: #0a0714;
--panel: #12101d;     --panel-2: #16132a;
--border: rgba(255,255,255,0.08);
--border-strong: rgba(0,234,255,0.28);
--text: #eae7ff;      --muted: #8f8ac2;    --faint: #5a5580;
--cyan: #00eaff;      --cyan-deep: #0088a0;
--magenta: #ff2dc4;   --magenta-soft: #ff8fe4;
--gold: #c9a86a;      --gold-bright: #f2e4bf;
--good: #35d07f;      --bad: #ff5c5c;      --warn: #e6b24a;
--radius: 16px;       --radius-sm: 11px;
--font-display: 'Orbitron', system-ui, sans-serif;      /* 見出し・数字 */
--font-mono: 'IBM Plex Mono', ui-monospace, monospace;  /* データ行 */
--font-jp: 'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif;
```

フォントは上記3種のみ(すでにサイトが読み込み済み。新規フォント追加は不可)。

## 3. 現在のDOM構造(この構造・クラス名を維持したままCSSだけ差し替えるのが理想)

### A. 本日のレースに参加するあなたの馬(カウントダウンの下)
オーナー指定: 文字は**サイバーパンク**/**馬名を枠線で囲まない**(チップ・ピル型は安物に見えるのでNG)。
```html
<div class="tonight">
  <div class="tonightK">本日のレースに参加するあなたの馬</div>
  <div class="tonightChips">
    <span class="tonightChip">Crimson Meteor <b>DAY4</b></span>
    <!-- 最大4頭ぶん繰り返し(現在はプレーンテキスト+金のDAY) -->
  </div>
  <div class="tonightNote">生き残れば馬の価値は上がり、DAY7走破で 200 USDT。すべては今夜の1走に。</div>
</div>
```

### B. レース条件テキスト(タイトルの約0.5秒後に現れ、約5秒で消える。1行だけ・シンプル指定)
オーナー指定: 値が全部同色だと読み分けられない → **値ごとに色分け**(inline styleでJSが色を差す)。
```html
<div class="condFlash">
  <span class="condK">天候</span><b style="color:#6fc3ff">雨</b>
  <span class="condK">/ 馬場</span><b style="color:#e6b24a">稍重</b>
  <span class="condK">/ コース</span><b style="color:#d8a05a">ダート</b>
</div>
```
値と色: 晴#ffd97a 曇#aab4c8 雨#6fc3ff 嵐#c78cff / 高速#00eaff 良#35d07f 稍重#e6b24a 不良#ff5c5c / 芝#58d68d ダート#d8a05a。
色の提案変更はOK(系統の意味が直感的なら)。カード化・スタンプ化はしない。

### C. 審判オーバーレイ(全画面 fixed。BURN/生存/DAY7共通の構造)
`.vHorseArt` は **JSが自分の馬の実NFTアートを描く canvas**(正方形・内部768px)。
kickerとエフェクトクラスがkindで変わる: BURN=`verdictKickerBurn`+`vHorseBurn` /
生存=(無印)+`vHorseSurvive` / DAY7=`verdictKickerGold`+`vHorseDay7`。
```html
<div class="verdictOverlay">
  <div class="verdictCard">
    <div class="verdictKicker verdictKickerBurn">BURNED</div><!-- SURVIVED / DAY7 CLEARED -->
    <div class="vHorse vHorseBurn">
      <canvas class="vHorseArt"></canvas><!-- JSが実NFT馬を描画。必ず残す -->
    </div>
    <div class="verdictName">Royal Meteor</div>
    <div class="verdictSub">DAY4 — BURN</div><!-- 生存: DAY3 → DAY4 / DAY7: DAY7 走破 -->
    <!-- BURNでドロップがある時だけ、1.5秒後に追加(馬は消さない — 関係を1画面で見せる): -->
    <div class="dropRow">
      <img class="dropIcon" src="/items/spirit_roar.webp" alt="咆哮の魂" />
      <span class="dropText">BURNドロップ獲得 — 咆哮の魂(オールラウンド)</span>
    </div>
  </div>
</div>
```

## 4. 現在のCSS(全文 — これを差し替える)

```css
/* A. 本日のレースに参加するあなたの馬 */
.tonight { margin: 22px auto 0; max-width: 560px; padding: 15px 18px 16px; position: relative;
  border: 1px solid rgba(0,234,255,0.4);
  background: linear-gradient(165deg, rgba(0,234,255,0.08), rgba(255,45,196,0.05) 60%, transparent);
  clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); }
.tonight::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,234,255,0.03) 3px 4px); }
.tonightK { font-family: var(--font-display); font-size: 11px; font-weight: 700; letter-spacing: 0.28em;
  color: var(--cyan); text-shadow: 0 0 14px rgba(0,234,255,0.75); }
.tonightChips { display: flex; gap: 6px 22px; flex-wrap: wrap; justify-content: center; margin-top: 11px; }
.tonightChip { font-family: var(--font-display); font-size: 13.5px; font-weight: 700; color: var(--text);
  letter-spacing: 0.04em; }
.tonightChip b { color: var(--gold-bright); margin-left: 6px; font-size: 12px; }
.tonightNote { font-family: var(--font-mono); font-size: 9.5px; color: var(--muted); margin-top: 11px; line-height: 1.7; }

/* B. レース条件フラッシュ */
.condFlash { margin-top: 16px; text-align: center; font-family: var(--font-mono); font-size: 13.5px;
  letter-spacing: 0.14em; animation: condFlash 5s ease-in-out forwards; }
.condFlash b { font-weight: 700; margin: 0 10px 0 7px; font-size: 15px; text-shadow: 0 0 12px currentColor; }
.condK { color: var(--muted); font-size: 11px; }
@keyframes condFlash { 0% { opacity:0; transform:translateY(4px); } 10% { opacity:1; transform:translateY(0); }
  78% { opacity:1; } 100% { opacity:0; } }

/* C. 審判オーバーレイ */
.verdictOverlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  background: rgba(2,2,8,0.92); animation: verdictDim 0.25s ease-out; }
@keyframes verdictDim { 0% { opacity:0; } 100% { opacity:1; } }
.verdictCard { width: min(560px, 94vw); text-align: center; animation: verdictIn 0.3s cubic-bezier(0.2,1.4,0.4,1); }
@keyframes verdictIn { 0% { opacity:0; transform:scale(0.92); } 100% { opacity:1; transform:scale(1); } }
.verdictKicker { font-family: var(--font-display); font-weight: 800; font-size: 15px; letter-spacing: 0.4em; color: var(--good); }
.verdictKickerBurn { color: var(--bad); }
.verdictKickerGold { color: var(--gold-bright); }
.vHorse { width: min(280px, 62vw); margin: 14px auto 0; border-radius: 20px; position: relative; }
.vHorseArt { width: 100%; height: auto; display: block; border-radius: 20px; }
.vHorseSurvive .vHorseArt { animation: vGlowGood 2.4s ease-out forwards; }
@keyframes vGlowGood { 0% { filter: brightness(0.7); } 35% { filter: brightness(1.15) drop-shadow(0 0 34px rgba(53,208,127,0.65)); }
  100% { filter: brightness(1.02) drop-shadow(0 0 20px rgba(53,208,127,0.4)); } }
.vHorseDay7 .vHorseArt { animation: vGlowGold 2.6s ease-out forwards; }
@keyframes vGlowGold { 0% { filter: brightness(0.7); } 35% { filter: brightness(1.2) drop-shadow(0 0 40px rgba(240,200,110,0.8)); }
  100% { filter: brightness(1.05) drop-shadow(0 0 24px rgba(240,200,110,0.55)); } }
.vHorseBurn .vHorseArt { animation: vBurn 2.6s ease-in forwards; }
@keyframes vBurn {
  0% { filter: brightness(1); }
  30% { filter: brightness(1.25) saturate(1.3) drop-shadow(0 0 36px rgba(255,92,92,0.85)); }
  100% { filter: brightness(0.42) saturate(0.35) drop-shadow(0 0 16px rgba(255,92,92,0.45)); }
}
.verdictName { font-family: var(--font-display); font-weight: 800; font-size: 21px; color: var(--text); margin-top: 12px; }
.verdictSub { font-family: var(--font-mono); font-size: 12.5px; color: var(--muted); margin-top: 5px; letter-spacing: 0.14em; }
.dropRow { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 14px;
  animation: dropIn 0.5s cubic-bezier(0.2,1.5,0.4,1); }
@keyframes dropIn { 0% { opacity:0; transform:scale(0.6) translateY(14px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
.dropIcon { width: 54px; height: 54px; border-radius: 12px; border: 1px solid rgba(240,200,110,0.6);
  box-shadow: 0 0 24px -4px rgba(240,200,110,0.7); }
.dropText { font-family: var(--font-mono); font-size: 12px; color: var(--gold-bright); }
```

## 5. 絶対に守ること(レッドライン)

1. **`<canvas class="vHorseArt">` は必ず残す** — 中身(自分の馬の実NFTアート)はJavaScriptが
   描画します。canvasの位置・サイズ・枠・周辺装飾・filterエフェクトは自由に変えてOK。正方形。
2. **表示タイミング・秒数・音はJS側の管理** — CSSアニメの尺は変えてOKですが、
   ドロップ行の出現(1.5秒後)や自動クローズはJSが行うので、モックでは各状態を別々に並べる。
3. **馬名を枠線・ピルで囲まない**(Aカード内) / **Bは「テキスト1行を一瞬見せるだけ」** /
   **Cに詩的なセリフを足さない**(事実のみ) — いずれもオーナー決定。
4. **禁止語彙**: 賭け/ベット/オッズ/配当/ギャンブル/予想/MLM/コミッション — 一切使わない。
   文言は原文のまま(コピー改善案は別添の提案として分けて書くのは歓迎)。
5. **外部リソース禁止**: 新規フォント・CDN・外部画像は不可。馬とアイテムの画像は
   プレースホルダのグラデーションでOK(馬=正方形canvas、アイテム=54×54)。
6. **モバイル(幅375px)で崩れないこと**(`05_tonight_mobile.png` 参照)。
7. 絵文字は使わない。

## 6. 納品形式

- **自己完結の HTML 1ファイル**(CSS内蔵・JSなし or 最小)に、全6状態
  (Aカード / B条件テキスト / C-BURN / C-BURN+ドロップ / C-生存 / C-DAY7)を
  縦に並べたショーケースとして。各状態に見出しを付けてください。
- CSSアニメーション(赤熱、輝き、ドロップ出現など)はそのHTML内で実際に動く形で。
- ZIPでも単一HTMLでも可。受け取り後、こちらでCSS Modulesに移植します。

## 7. デザインの方向性(参考・自由に超えてよい)

- Aカードは**サイバーパンク**のキーワードで(ネオン、グリッチアクセント、HUD風の枠など)
- C審判は**その日いちばんの瞬間**。主役は馬のアート —
  BURN=尊厳ある散り際(赤熱→沈む)、生存=緑の輝き、DAY7=金の戴冠、
  ドロップ=同じ画面に「この馬のBURNから得た」と一目でわかる形で
- 過剰なポップさよりも、ナイトレースの緊張感と高級感
