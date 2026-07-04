# UI作業 引継ぎ書(2026-07-05)

> このファイルは **フロントエンドUIリデザイン作業専用** の引継ぎ。バックエンド/仕様は `HANDOVER.md` を参照。
> 最終コミット: `4950043` (main, origin同期済み)。開発サーバー稼働中: http://localhost:3000

---

## 1. いま何をしているか

オーナー(=このリポジトリの発注者)の指示で、**フロントを「Web3ゲーム感のあるネオン(サイバーパンク)デザイン」に全面リデザイン**中。デザインは**Claudeデザイン(Design Composer)がハンドオフ**として作成し、開発側(Claude Code)が**Next.jsに変換実装**する分業。

### デザインのハンドオフ元(重要・リポジトリ外)
- ローカルZIP2つ(gitignore済み・リポジトリには入っていない):
  - `ゲームデザイン案検討.zip` → **採用中のネオンデザイン**(TOP + LP PC/Responsive + 馬アート4種 hero/gold/chrome/onyx.png)
  - `リデザイン１.zip` → 旧「高級ブラック×ゴールド」案(不採用)+ LP v3(Google/MetaMaskボタンの参考)
- 展開済みの場所(このセッションのscratchpad。次セッションでは消えている可能性あり):
  `...\scratchpad\gamedesign\` と `...\scratchpad\redesign\`
- **Design Composer形式**(`<x-dc>`, `style-hover`, `support.js`, `image-slot`)は**そのままでは動かない**。手作業でReact+CSSに変換が必要。
- 馬アートは `apps/web/public/horses/` にコピー済み(hero/gold/chrome/onyx.png、各3.3MB)。

## 2. 実装済みの構成

- **ルーティング**: `apps/web/app/page.tsx` が分岐 → 未ログイン=`<Landing/>`、ログイン済=`<Dashboard/>`
- **公開LP**: `apps/web/components/Landing.tsx` + `landing.module.css`(CSS Modules)
- **ログインボタン**: `apps/web/components/LandingAuth.tsx`(Google/MetaMask実動作)
- **ダッシュボード**: `apps/web/components/Dashboard.tsx` + `apps/web/app/dashboard.module.css`(実データ結線・馬0頭時はhero馬アートのティーザー)
- **デザイントークン**: `apps/web/app/globals.css`(ネオン: cyan #00eaff / magenta #ff2dc4 / gold #c9a86a / near-black)
- **フォント**: `apps/web/app/layout.tsx` の `<head>` に Google Fonts `<link>`(Orbitron / Zen Kaku Gothic New / Space Grotesk / IBM Plex Mono)。**next/fontは使っていない**(Zen Kaku日本語フォントのため<link>方式)。**ログイン時のみ**上部ナビ(topnav)を表示、未ログインは各ページが自前ヘッダー。
- **Tailwindは無い**。プレーンCSS + CSS Modules。

## 3. ⚠️ オーナーが強く不満な点(未解決)

オーナーは**「ハンドオフのデザインを忠実に再現してほしい。変えていいのはテキストだけ」**と明言。開発側(前任=私)が**勝手にデザイン構造を変えてしまい**、何度も指摘された。現在オーナーは**Claudeデザインに差分レビューを依頼中**(下記プロンプトを渡した)。その回答(差分リスト or 作り直したHTML/CSS)が来たら、**その通りに実装**すること。

### オーナーが「まだ違う/崩れている」と指摘した箇所(2026-07-05 スクショ確認)
- **ヘッダー**: ハンドオフと違う(ハンドオフPC版は brand + メニュー4項目[遊び方/コレクション/エコノミー/ホワイトペーパー] + 右に「CONNECT WALLET」ボタン)。※現状は「はじめる」ボタンに変更・ホワイトペーパー追加済みだが、オーナーはまだ不満。
- **フッター**: ハンドオフと違う(ハンドオフは brand + Whitepaper/Docs/Discord/X/Contract + ©)。復元したがまだ不満。
- **CTA**: 「全然ダメ」。Google/MetaMaskボタンは追加したが、ハンドオフのレイアウトと差がある。
- **修正済みの実バグ**: featuredカードの「LEGENDARY」金バッジが空の金色バーに潰れていた → CSSモジュールの `.gold` クラス名衝突(`.featCard .gold{height:5px}` がバッジに適用)が原因。`.goldbar` にリネームで修正済み(`4950043`)。

## 4. 🔑 最重要の教訓(次セッションは必ず守る)

1. **デザインを勝手に変えない。** オーナーは「テキストだけ変えて、デザインはハンドオフ忠実」を繰り返し要求。要素の削除・レイアウト変更・"改善"は**してはいけない**。忠実再現が最優先。
2. **架空の数字問題**: ハンドオフには偽の成長数値(38,402 minted / FLOOR 180 / 24H VOL 84.2K / OWNERS 12.1K / カード価格520等)がある。開発判断で「正直な値に変えるべき」と一度削ったが、オーナーは**忠実再現**を望み、現在はハンドオフ通りに戻してある。**数値を変えるかはオーナーに確認してから**(勝手に判断しない)。ただしローンチ前には実データ/非表示への差し替えを**提案**すべき(新規サービスで偽実績はリスク、と一度合意済み)。
3. **CSS Modulesのクラス名衝突に注意**: 子孫セレクタ(`.featCard .gold`)と複合セレクタ(`.tag.gold`)が同じクラス名を共有すると潰れる。`done`/`today`等グローバル状態クラスは `:global(.done)` を使う(dashboard/landingで対応済み)。
4. **スクショで実物を見てから直す**。憶測で直すと外す。オーナーはスクショを送ってくれる。`Read`ツールで `C:\Users\USER\OneDrive\画像\スクリーンショット\` の画像を開ける。
5. **フォント**: 日本語が変に見えたら Orbitron/Zen Kaku が読めていない可能性。`layout.tsx` の Google Fonts `<link>` を確認。

## 5. Claudeデザインに渡した差分レビュー依頼プロンプト(オーナー実行中)

要点: 「Live=https://sevendaysderby.com(ログアウトで見る)と、GitHub=https://github.com/bobbielluegemrw3-max/sevendays(commit 4950043)の実装を、あなた(Claudeデザイン)のハンドオフ『Seven Days Derby - LP (PC)』とセクション毎に比較し、各差異の"正しい値/マークアップ"を具体的に出す。または忠実な単一HTML/CSSで作り直す。Tailwind無し・Next.js App Router・CSS Modules・フォントは<link>・テキストのみゲーム正確版(Mint102等)」。

## 6. 検証コマンド

```
# ビルド/lint/type(webのみ)
pnpm --filter @sevendays/web build
pnpm --filter @sevendays/web lint
pnpm --filter @sevendays/web typecheck
# 開発サーバー(LPは認証不要で確認可。ダッシュボードはJWT Secret無しのため要ログイン→ローカルは不可)
cd apps/web && pnpm exec next dev -p 3000
# 本番: mainにpush → Render自動デプロイ → https://sevendaysderby.com
```

## 7. UI以外の状態(サマリ)

- **全システム本番稼働中**(Web=sevendaysderby.com / Worker=Render pserv sevendays-worker・毎日20:00 MYTにバッチ自動実行)。詳細は `HANDOVER.md`。
- オーナーアカウントに**テスト残高500 USDT付与済み・購入セッション2件 PENDING**(今夜以降のバッチでミントされる想定だったが、バッチ結果の確認は未実施 → 次セッションでDBを確認するとダッシュボードの実データ表示が検証できる)。
- 経済改定v1.1(Decision 069)・Render移行(068/070)・ログイン相互連携(071/072)は完了。各 `*_REVISION.md` / `AUTH_SETUP.md` に記録。
