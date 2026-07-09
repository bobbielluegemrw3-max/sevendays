# Daily Derby「脳汁演出」リデザイン依頼ブリーフ

> このファイルと `shots/` のスクリーンショット8枚を Claude(claude.ai)にアップロードして、
> 「このブリーフに従ってリデザインしてください」と依頼するための資料です。
> 作成: 2026-07-09 / Seven Days Derby 開発チーム

---

## 1. 何のUIか

Seven Days Derby(NFT競走馬ゲーム)では毎晩20:00に全馬一斉のレース精算があり、
それを約100秒のライブ演出「THE DAILY DERBY」として見せています。
今回リデザインしてほしいのは、そこに追加した**5つの新演出パーツ**です(3幕構成):

| # | パーツ | 出るタイミング | スクリーンショット |
|---|--------|----------------|--------------------|
| A | 「今夜のあなた」カード | 開始前カウントダウン中 | `01_countdown_tonight.png` |
| B | 「馬場発表」3連スタンプ+祭り名 | 20:00通過の約5秒後 | `02_baba_happyo.png` |
| C | 中間経過(自分の馬の順位) | レース実走中に3行 | `03_midrace.png` |
| D | 審判オーバーレイ(生存/DAY7) | 自分の結果の瞬間 | `04`〜`05`、モバイル`08` |
| E | 審判オーバーレイ(BURN→ドロップ開封) | 自分の結果の瞬間 | `06`〜`07` |

演出の思想: **報酬より「結果直前の不確実性」が興奮の源**。静寂→爆発、絶望→希望の振り子。
現状は機能としては完成していますが、見た目が「実装した人のデザイン」なので、
**もっと感情を揺さぶるリッチなビジュアル**にしてほしいです。

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

### A. 今夜のあなた(カウントダウンの下)
```html
<div class="tonight">
  <div class="tonightK">今夜のあなた</div>
  <div class="tonightChips">
    <span class="tonightChip">Crimson Meteor <b>DAY4</b></span>
    <!-- 最大4頭ぶん繰り返し -->
  </div>
  <div class="tonightNote">生き残れば馬の価値は上がり、DAY7走破で 200 USDT。すべては今夜の1走に。</div>
</div>
```

### B. 馬場発表(スタンプは 0秒/1.1秒/2.2秒 に1個ずつ「バンッ」と押され、3.6秒後に祭り名)
```html
<div class="baba">
  <div class="babaK">— 本日の馬場発表 —</div>
  <div class="babaRow">
    <div class="babaStamp babaStampIn"><span class="babaStampK">天候</span><span class="babaStampV">雨</span></div>
    <div class="babaStamp babaStampIn"><span class="babaStampK">馬場</span><span class="babaStampV">稍重</span></div>
    <div class="babaStamp babaStampIn"><span class="babaStampK">コース</span><span class="babaStampV">ダート</span></div>
  </div>
  <div class="babaFes">豪雨のダート決戦</div><!-- 条件が揃った夜だけ出る祭り名 -->
</div>
```
値のバリエーション: 天候=晴/曇/雨/嵐、馬場=高速/良/稍重/不良、コース=芝/ダート。
祭り名の例: 嵐の荒天決戦/豪雨のダート決戦/絶好の芝日和/道悪の夜。

### C. 中間経過(1行ずつ順に追加される)
```html
<div class="midRace">
  <div class="midLine">🏇 第2コーナー — <b>Crimson Meteor</b> 現在 8位</div>
  <div class="midLine">🏇 第3コーナー — <b>Crimson Meteor</b> 現在 5位</div>
  <div class="midLine">🏇 第4コーナー — <b>Crimson Meteor</b> 現在 2位</div>
</div>
```

### D. 審判オーバーレイ — 生存/DAY7(全画面 fixed オーバーレイ)
表示順: 0.8秒の静寂(`verdictSilence`)→ カードに切替。
```html
<div class="verdictOverlay">
  <!-- フェーズ1(0〜0.8秒) -->
  <div class="verdictSilence">— YOUR RESULT —</div>
  <!-- フェーズ2(0.8秒〜、フェーズ1と置換) -->
  <div class="verdictCard">
    <div class="verdictKicker">SURVIVED</div>
    <div class="verdictRun">
      <canvas class="verdictCanvas" width="720" height="240"></canvas>
      <div class="verdictFlash" aria-hidden="true"></div>
    </div>
    <div class="verdictName">Crimson Meteor</div>
    <div class="verdictLabel">DAY4 へ進出!</div>
    <!-- DAY7時: <div class="verdictLabel verdictGold">DAY7 走破 — CHAMPION!</div> -->
  </div>
</div>
```

### E. 審判オーバーレイ — BURN(1.7秒後に墓碑→ドロップ開封へ置換)
```html
<div class="verdictOverlay">
  <div class="verdictCard">
    <div class="verdictKicker verdictKickerBurn">BURNED</div>
    <!-- フェーズ1(墓碑): -->
    <div class="burnGlitch"><span class="burnName">Royal Meteor</span></div>
    <div class="burnEpitaph">DAY4 まで戦った — その意志は消えない</div>
    <div class="burnHint">…何かが炎の中に残っている</div>
    <!-- フェーズ2(ドロップ開封、フェーズ1と置換): -->
    <div class="dropReveal">
      <img class="dropArt" src="/items/spirit_roar.webp" alt="咆哮の魂" />
      <div class="dropName">咆哮の魂</div>
      <div class="dropNote">BURNドロップ獲得! — オールラウンド</div>
    </div>
  </div>
</div>
```

## 4. 現在のCSS(全文 — これを差し替える)

```css
/* 馬場発表スタンプ */
.baba { margin-top: 18px; text-align: center; }
.babaK { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.3em; color: var(--gold); }
.babaRow { display: flex; justify-content: center; gap: 14px; margin-top: 10px; flex-wrap: wrap; }
.babaStamp { display: flex; flex-direction: column; align-items: center; gap: 3px; border: 2px solid rgba(201,168,106,0.6);
  border-radius: 12px; padding: 10px 18px; min-width: 92px; opacity: 0; transform: scale(2.4) rotate(-6deg); }
.babaStampIn { animation: babaSlam 0.28s cubic-bezier(0.2,1.6,0.4,1) forwards; }
@keyframes babaSlam { 0% { opacity:0; transform:scale(2.4) rotate(-6deg); } 100% { opacity:1; transform:scale(1) rotate(-2deg); } }
.babaStampK { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.2em; color: var(--muted); }
.babaStampV { font-family: var(--font-display); font-weight: 800; font-size: 22px; color: var(--gold-bright); }
.babaFes { margin-top: 12px; font-family: var(--font-display); font-weight: 800; font-size: 17px; letter-spacing: 0.12em;
  color: #ffd97a; text-shadow: 0 0 18px rgba(240,200,110,0.8); animation: babaFesIn 0.5s ease-out; }
@keyframes babaFesIn { 0% { opacity:0; transform:translateY(8px); } 100% { opacity:1; transform:translateY(0); } }

/* 今夜のあなた */
.tonight { margin-top: 22px; border: 1px solid rgba(201,168,106,0.35); border-radius: 14px; padding: 14px 16px;
  background: linear-gradient(150deg, rgba(201,168,106,0.07), transparent 70%); max-width: 520px; margin-left: auto; margin-right: auto; }
.tonightK { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.24em; color: var(--gold); }
.tonightChips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 9px; }
.tonightChip { font-family: var(--font-display); font-size: 12px; font-weight: 700; color: var(--text);
  border: 1px solid rgba(0,234,255,0.35); border-radius: 999px; padding: 5px 13px; background: rgba(0,234,255,0.06); }
.tonightChip b { color: var(--gold-bright); margin-left: 4px; }
.tonightNote { font-family: var(--font-mono); font-size: 9.5px; color: var(--muted); margin-top: 9px; line-height: 1.7; }

/* 中間経過 */
.midRace { margin-top: 12px; display: flex; flex-direction: column; gap: 5px; }
.midLine { font-family: var(--font-mono); font-size: 12px; color: #a9d8e0; animation: midIn 0.35s ease-out; }
.midLine b { color: var(--cyan); }
@keyframes midIn { 0% { opacity:0; transform:translateX(-10px); } 100% { opacity:1; transform:translateX(0); } }

/* 審判オーバーレイ */
.verdictOverlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  background: rgba(2,2,8,0.9); animation: verdictDim 0.25s ease-out; }
@keyframes verdictDim { 0% { opacity:0; } 100% { opacity:1; } }
.verdictSilence { font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.5em; color: var(--muted);
  animation: silencePulse 0.8s ease-in-out; }
@keyframes silencePulse { 0% { opacity:0; } 40% { opacity:1; } 100% { opacity:0.7; } }
.verdictCard { width: min(760px, 94vw); text-align: center; animation: verdictIn 0.3s cubic-bezier(0.2,1.4,0.4,1); }
@keyframes verdictIn { 0% { opacity:0; transform:scale(0.92); } 100% { opacity:1; transform:scale(1); } }
.verdictKicker { font-family: var(--font-display); font-weight: 800; font-size: 15px; letter-spacing: 0.4em; color: var(--good); }
.verdictKickerBurn { color: var(--bad); }
.verdictRun { position: relative; height: 250px; margin-top: 10px; overflow: hidden; }
.verdictCanvas { width: 100%; height: 100%; display: block; }
.verdictLoading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--faint); }
.verdictFlash { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at 78% 60%, rgba(240,200,110,0.3), transparent 55%);
  animation: verdictFlash 2.6s ease-out forwards; }
@keyframes verdictFlash { 0%,55% { opacity:0; } 70% { opacity:1; } 100% { opacity:0.4; } }
.verdictName { font-family: var(--font-display); font-weight: 800; font-size: 20px; color: var(--text); margin-top: 6px; }
.verdictLabel { font-family: var(--font-display); font-weight: 800; font-size: 26px; color: #9dffc4; margin-top: 4px;
  text-shadow: 0 0 22px rgba(53,208,127,0.6); }
.verdictGold { color: var(--gold-bright); text-shadow: 0 0 26px rgba(240,200,110,0.8); }

/* BURN */
.burnGlitch { margin-top: 22px; }
.burnName { font-family: var(--font-display); font-weight: 800; font-size: 30px; color: var(--bad);
  display: inline-block; animation: burnGlitch 1.4s steps(12) forwards; text-shadow: 0 0 24px rgba(255,92,92,0.7); }
@keyframes burnGlitch {
  0% { opacity:1; filter:none; transform:none; }
  30% { filter:blur(0.5px); transform:translateX(2px) skewX(2deg); }
  50% { filter:blur(1px); transform:translateX(-3px) skewX(-3deg); opacity:0.85; }
  70% { filter:blur(2px); transform:translateX(4px); opacity:0.6; }
  100% { opacity:0.22; filter:blur(4px); transform:translateY(-8px); }
}
.burnEpitaph { font-family: var(--font-mono); font-size: 12.5px; color: #d9a3a3; margin-top: 18px; letter-spacing: 0.1em; }
.burnHint { font-family: var(--font-mono); font-size: 11px; color: var(--gold); margin-top: 12px;
  animation: hintPulse 1.2s ease-in-out infinite; }
@keyframes hintPulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
.dropReveal { margin-top: 8px; animation: dropIn 0.6s cubic-bezier(0.2,1.5,0.4,1); }
@keyframes dropIn { 0% { opacity:0; transform:scale(0.4) translateY(30px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
.dropArt { width: 148px; height: 148px; border-radius: 18px; border: 1px solid rgba(240,200,110,0.6);
  box-shadow: 0 0 46px -8px rgba(240,200,110,0.8); }
.dropName { font-family: var(--font-display); font-weight: 800; font-size: 19px; color: var(--gold-bright); margin-top: 10px; }
.dropNote { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); margin-top: 5px; }
```

## 5. 絶対に守ること(レッドライン)

1. **`<canvas class="verdictCanvas">` は必ず残す** — 中身(実NFT馬の疾走)はJavaScriptが描画します。
   canvasの位置・枠・周辺装飾は自由に変えてOK。アスペクト比はおおよそ3:1(横長)を維持。
2. **表示タイミング・秒数・音はJS側の管理** — CSSアニメの尺は変えてOKですが、
   フェーズの切替(静寂0.8秒/墓碑→ドロップ1.7秒/自動クローズ4.6〜6.2秒)はJSが行うので、
   モックでは各フェーズを「別々の状態」として並べてください。
3. **DOM構造とクラス名は極力維持**(こちらでReactに結線するため)。
   構造変更が必要な場合は、新旧クラス名の対応表を必ず添付。
4. **禁止語彙**: 賭け/ベット/オッズ/配当/ギャンブル/予想/MLM/コミッション — 一切使わない。
   文言は原文のまま使ってください(コピー改善案は別添の提案として分けて書くのは歓迎)。
5. **外部リソース禁止**: 新規フォント・CDN・外部画像は不可。アイテム画像はプレースホルダの
   グラデーション角丸でOK(実物は148×148で `/items/*.webp` が入ります)。
6. **モバイル(幅375px)で崩れないこと**(`08_verdict_survive_mobile.png` 参照)。
7. 絵文字はなるべく使わない(現状の🏇は例外的に許容中 — 置き換え提案は歓迎)。

## 6. 納品形式

- **自己完結の HTML 1ファイル**(CSS内蔵・JSなし or 最小)に、上記A〜Eの全状態
  (Aカード / Bスタンプ3個+祭り名 / C3行 / D生存 / D-DAY7 / E墓碑 / Eドロップ開封)を
  縦に並べたショーケースとして。各状態に見出しを付けてください。
- CSSアニメーション(スタンプのスラム、グリッチ、ドロップ開封など)は
  そのHTML内で実際に動く形で入れてください。
- ZIPでも単一HTMLでも可。受け取り後、こちらでCSS Modulesに移植します。

## 7. デザインの方向性(参考・自由に超えてよい)

- 「馬場発表」は競馬場の電光掲示板や公式発表の**儀式感**をもっと
- 審判オーバーレイは**その日いちばんの瞬間**にふさわしい映画的な演出
  (生存=栄光のゴール、DAY7=戴冠式、BURN=尊厳ある散り際→ガチャの希望)
- ドロップ開封は「炎の中から出てくる」感(パーティクル風のCSSは歓迎)
- 過剰なポップさよりも、ナイトレースの緊張感と高級感
