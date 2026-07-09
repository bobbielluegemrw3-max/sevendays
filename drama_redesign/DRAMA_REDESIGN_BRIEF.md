# Daily Derby「脳汁演出」リデザイン依頼ブリーフ(2026-07-10 縮小版)

> このファイルと `shots/` のスクリーンショット5枚が依頼資料の全てです。
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
| B | レース条件テキスト(一瞬だけ表示) | 20:00通過の約5秒後に約5秒間 | `02_conditions_text.png` |
| C | BURN審判オーバーレイ(グリッチ墓碑→ドロップ開封) | 自分の馬がBURNされた瞬間 | `03_verdict_burn.png` → `04_burn_drop.png` |

演出の思想: 生存は淡々と流れ(ログのハイライトのみ)、**BURNの瞬間だけを特別に扱う**。
絶望(消滅)→希望(炎の中からアイテム)の感情の振り子。
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
オーナー指定: 文字を**サイバーパンク**に。現状はシアンの切り欠きカード+走査線(ベースライン)。
```html
<div class="tonight">
  <div class="tonightK">本日のレースに参加するあなたの馬</div>
  <div class="tonightChips">
    <span class="tonightChip">Crimson Meteor <b>DAY4</b></span>
    <!-- 最大4頭ぶん繰り返し -->
  </div>
  <div class="tonightNote">生き残れば馬の価値は上がり、DAY7走破で 200 USDT。すべては今夜の1走に。</div>
</div>
```

### B. レース条件テキスト(タイトルの約0.5秒後に現れ、約5秒で消える。1行だけ・シンプル指定)
```html
<div class="condFlash">天候 雨 / 馬場 稍重 / コース ダート</div>
```
値のバリエーション: 天候=晴/曇/雨/嵐、馬場=高速/良/稍重/不良、コース=芝/ダート。
**注意**: オーナー指定で「テキストだけ一瞬見せる」形式。カード化・スタンプ化はしない。
フェードイン/アウトの質感向上はOK。

### C. BURN審判オーバーレイ(全画面 fixed。フェーズ1が1.7秒→フェーズ2に置換)
```html
<div class="verdictOverlay">
  <div class="verdictCard">
    <div class="verdictKicker verdictKickerBurn">BURNED</div>
    <!-- フェーズ1(グリッチ墓碑): -->
    <div class="burnGlitch"><span class="burnName">Royal Meteor</span></div>
    <div class="burnEpitaph">DAY4 まで戦った — その意志は消えない</div>
    <div class="burnHint">…何かが炎の中に残っている</div>
    <!-- フェーズ2(ドロップ開封、フェーズ1と置換。ドロップ無しの夜はフェーズ1のまま閉じる): -->
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
/* A. 本日のレースに参加するあなたの馬 */
.tonight { margin: 22px auto 0; max-width: 560px; padding: 15px 18px 16px; position: relative;
  border: 1px solid rgba(0,234,255,0.4);
  background: linear-gradient(165deg, rgba(0,234,255,0.08), rgba(255,45,196,0.05) 60%, transparent);
  clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); }
.tonight::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,234,255,0.03) 3px 4px); }
.tonightK { font-family: var(--font-display); font-size: 11px; font-weight: 700; letter-spacing: 0.28em;
  color: var(--cyan); text-shadow: 0 0 14px rgba(0,234,255,0.75); }
.tonightChips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
.tonightChip { font-family: var(--font-display); font-size: 12px; font-weight: 700; color: var(--text);
  border: 1px solid rgba(0,234,255,0.35); border-radius: 999px; padding: 5px 13px; background: rgba(0,234,255,0.06); }
.tonightChip b { color: var(--gold-bright); margin-left: 4px; }
.tonightNote { font-family: var(--font-mono); font-size: 9.5px; color: var(--muted); margin-top: 10px; line-height: 1.7; }

/* B. レース条件フラッシュ */
.condFlash { margin-top: 16px; text-align: center; font-family: var(--font-mono); font-size: 13px;
  letter-spacing: 0.18em; color: var(--gold-bright); text-shadow: 0 0 14px rgba(240,200,110,0.55);
  animation: condFlash 5s ease-in-out forwards; }
@keyframes condFlash { 0% { opacity:0; transform:translateY(4px); } 10% { opacity:1; transform:translateY(0); }
  78% { opacity:1; } 100% { opacity:0; } }

/* C. BURN審判オーバーレイ */
.verdictOverlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  background: rgba(2,2,8,0.9); animation: verdictDim 0.25s ease-out; }
@keyframes verdictDim { 0% { opacity:0; } 100% { opacity:1; } }
.verdictCard { width: min(760px, 94vw); text-align: center; animation: verdictIn 0.3s cubic-bezier(0.2,1.4,0.4,1); }
@keyframes verdictIn { 0% { opacity:0; transform:scale(0.92); } 100% { opacity:1; transform:scale(1); } }
.verdictKicker { font-family: var(--font-display); font-weight: 800; font-size: 15px; letter-spacing: 0.4em; color: var(--good); }
.verdictKickerBurn { color: var(--bad); }
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

1. **表示タイミング・秒数・音はJS側の管理** — CSSアニメの尺は変えてOKですが、
   フェーズの切替(墓碑→ドロップ1.7秒/自動クローズ)はJSが行うので、
   モックでは各フェーズを「別々の状態」として並べてください。
2. **DOM構造とクラス名は極力維持**(こちらでReactに結線するため)。
   構造変更が必要な場合は、新旧クラス名の対応表を必ず添付。
3. **Bのレース条件は「テキスト1行を一瞬見せるだけ」** — オーナー決定。
   スタンプ・カード・バナー等への拡張はしない。
4. **禁止語彙**: 賭け/ベット/オッズ/配当/ギャンブル/予想/MLM/コミッション — 一切使わない。
   文言は原文のまま(コピー改善案は別添の提案として分けて書くのは歓迎)。
5. **外部リソース禁止**: 新規フォント・CDN・外部画像は不可。アイテム画像はプレースホルダの
   グラデーション角丸でOK(実物は148×148で `/items/*.webp` が入ります)。
6. **モバイル(幅375px)で崩れないこと**(`05_tonight_mobile.png` 参照)。
7. 絵文字は使わない。

## 6. 納品形式

- **自己完結の HTML 1ファイル**(CSS内蔵・JSなし or 最小)に、全4状態
  (Aカード / B条件テキスト / C墓碑 / Cドロップ開封)を縦に並べたショーケースとして。
  各状態に見出しを付けてください。
- CSSアニメーション(グリッチ、ドロップ開封など)はそのHTML内で実際に動く形で。
- ZIPでも単一HTMLでも可。受け取り後、こちらでCSS Modulesに移植します。

## 7. デザインの方向性(参考・自由に超えてよい)

- Aカードは**サイバーパンク**のキーワードで(ネオン、グリッチアクセント、HUD風の枠など)
- C審判は**その日いちばんの瞬間**にふさわしい映画的な演出
  (BURN=尊厳ある散り際、ドロップ=炎の中から出てくる希望。パーティクル風のCSSは歓迎)
- 過剰なポップさよりも、ナイトレースの緊張感と高級感
