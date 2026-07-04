# ログイン・アカウント連携 記録(Decision 071 / 072)

> 2026-07-04 / オーナー決定・実装・本番稼働確認済み。ログイン周りの正典。
> 関連: Decision Log 071(ログイン方式)・072(相互連携)/ コミット 9286e91・4b666ee・65a942e

## 1. 提供するログイン方式(Decision 071)

| 方式 | 実体 | 状態 |
|---|---|---|
| **Google** | Supabase OAuth(PKCE)+ `/auth/callback` でコード交換 | ✅ 本番稼働確認済み |
| **MetaMask** | Supabase「Web3 Wallet」プロバイダー=Sign-In with Ethereum(`signInWithWeb3`) | ✅ ボタン→MetaMask起動を確認(Supabase側Enable必要) |
| メール+パスワード | 従来方式・ログイン画面で折りたたみのフォールバック | ✅ 稼働(オーナーの管理者アカウントがこれ) |

- バックエンド無変更で成立: 全方式がSupabaseの標準JWTを発行し、APIブリッジがES256(JWKS)/HS256両対応で検証・ユーザープロビジョニング(email claim無しも対応済み)。
- **同一メールのGoogleとメール登録はSupabaseが自動マージ**(実測: users/auth.usersとも1件のみ、残高500・2セッション・管理者権限すべて同一アカウント e54dd629…)。

## 2. アカウント相互連携(Decision 072)

**ゴール**: どちらの入口から入っても、最終的に1つのゲームアカウント(残高・馬)に両方式でアクセスできる。

| 起点 | 連携操作 | 仕組み |
|---|---|---|
| MetaMask登録 → Google追加 | /account「Google を紐づけ」 | Supabaseネイティブ identity linking(同一auth user) |
| Google/メール登録 → MetaMask追加 | /account「🦊 MetaMask を紐づけ」 | `personal_sign`証明(ユーザーID+タイムスタンプ、10分有効)をサーバー検証→`user_wallets`記録。連携済みウォレットのWeb3セッションはAPIブリッジで当該ゲームアカウントにエイリアス解決 |

**安全装置**: 1ウォレット=1アカウント(DB一意)。Web3初回ログインは自分のウォレットを即claim→他アカウントへの紐づけ不可。偽署名・期限切れ・他人宛証明はすべて拒否(実署名でテスト済み)。マイグレーション `20260702200133_user_wallets.sql` 本番適用済み。

## 3. 必要な外部設定(オーナー実施)

### Google Cloud Console
- OAuthクライアント(ウェブアプリケーション)を作成
- **承認済みリダイレクトURI**: `https://bdljkptqmnewkjoqzviy.supabase.co/auth/v1/callback`
- 承認済みJSオリジン: `https://sevendaysderby.com`
- ⚠️ `localhost` 系は登録しないこと(戻り先事故の元)

### Supabase ダッシュボード
- Authentication → Providers → **Google** Enable(クライアントID/シークレット貼付)
- Authentication → Providers → **Web3 Wallet** Enable(Ethereum)
- Authentication → URL Configuration → **Site URL** = `https://sevendaysderby.com`
- 同 **Redirect URLs** に `https://sevendaysderby.com/auth/callback`
- Authentication → **Manual Linking** を有効化(アカウント紐づけ用)

### Render(Webサービス sevendays)
- 環境変数 **`NEXT_PUBLIC_SITE_URL` = `https://sevendaysderby.com`**(OAuth戻り先の確実化)

## 4. ハマった実運用の罠(記録)

- **`localhost:10000` へ飛ぶ問題**: `/auth/callback` が戻り先URLを `request.url`(=Renderコンテナ内部アドレス http://localhost:10000)から組み立てていた。`x-forwarded-host`/`proto` 由来に修正+`NEXT_PUBLIC_SITE_URL` 優先(コミット 65a942e)。プロキシ配下のNext.jsでOAuth戻り先を作る時の定番の落とし穴。
- クライアント側redirectも `siteOrigin()`(env優先)経由に統一。

## 5. 今後の拡張余地

- Telegramログイン(Supabase非対応→カスタム認証。東南アジア/マレーシア展開時に検討・別Decision)
- メール方式の完全撤去(全ユーザーがGoogle/Walletに移行後。オーナーアカウント移行が前提)
