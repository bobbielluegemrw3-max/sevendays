# AIカスタマーサービス セットアップ&運用ガイド

> 作成: 2026-07-09 / Decision 081 / betimail(E:\dev\Cusor\betimail)方式の移植
> コード: `packages/api-contracts/src/cs/`(知識ベース・AI・送信)+ `apps/web/app/api/inbound-email/route.ts`(受信Webhook)+ `/admin/support`(承認UI)

## 仕組み(betimailと同じ流れ)

```
ユーザー → support@sevendaysderby.com へメール
  → Resend受信Webhook(Svix署名検証・重複排除・本文API取得)
  → 送信者をusersと照合(公開可能な文脈のみAIへ: 登録有無・馬の頭数と名前)
  → DeepSeekが下書き生成 {本文, 自信度, 要人間対応, 理由}
  → 承認キュー(cs_messages, status=PENDING)
  → /admin/support で管理者が編集→「承認して送信」or「却下」
  → Resendで返信(スレッド維持 In-Reply-To)
```

**全件承認制**: 自動送信のコードパスは存在しません。承認なしにメールが出ることはありません。

## 情報漏洩対策(実装済みの多層防御)

1. **知識ベースに公開情報しか書いていない**(`cs/knowledge.ts`)— 準備金・内部計算・管理機能はそもそもAIに与えていない
2. システムプロンプトで開示禁止を明示(内部情報・他ユーザー・残高数値)
3. AIに渡すユーザー文脈は「登録有無・馬の頭数・馬名」のみ — **残高・取引・アドレスは渡さない**(メール差出人はなりすまし可能なため、数値はサイト内ページへ誘導する方針)
4. 最後の砦=**全件、人間(あなた)の承認**

## オーナーがやること(初回セットアップ)

### 1. Resend でドメイン設定
1. https://resend.com → Domains → `sevendaysderby.com` を追加
2. 表示される **SPF/DKIMレコードをDNSに追加**(送信用)
3. **受信(Inbound)**: Domains → Inbound を有効化し、表示される **MXレコードをDNSに追加**
   ※ 既存メールで同ドメインのMXを使っている場合はサブドメイン(例: `support@mail.sevendaysderby.com`)にする — その場合は `CS_FROM_EMAIL` を合わせる
4. API Keys → APIキー発行(Full access)
5. Webhooks → エンドポイント追加:
   - URL: `https://sevendaysderby.com/api/inbound-email`
   - イベント: `email.received`
   - 表示される **Signing Secret(whsec_…)** を控える

### 2. Render の環境変数(Web サービス)
| 変数 | 値 |
|---|---|
| `RESEND_API_KEY` | Resendで発行したキー |
| `RESEND_WEBHOOK_SECRET` | whsec_… |
| `CS_FROM_EMAIL` | `support@sevendaysderby.com` |
| `CS_FROM_NAME` | `Seven Days Derby サポート` |
| `DEEPSEEK_API_KEY` | betimailと同じキーを流用可 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com`(省略可・既定) |
| `DEEPSEEK_MODEL` | `deepseek-chat`(省略可・既定) |
| `CS_TEST_MODE` | 動作確認中は `true`(下記) |
| `CS_TEST_ALLOWED` | テスト中に送信を許可する宛先(例: goldbenchan@gmail.com) |

### 3. Supabase Auth のメールをResendに(パスワード忘れ等)
Supabase Dashboard → Authentication → SMTP Settings:
- Host: `smtp.resend.com` / Port: `465` / User: `resend`
- Password: ResendのAPIキー
- Sender: `support@sevendaysderby.com`
これで**パスワードリセット・メール確認**などSupabase Authの全メールがResend経由になります。

### 4. 動作確認(TEST_MODE)
1. `CS_TEST_MODE=true`・`CS_TEST_ALLOWED=<自分のアドレス>` で起動
2. 自分のアドレスから support@ へ質問メールを送る
3. /admin/support に届く → AI下書きを確認 → 承認 → 自分に返信が届く
4. 問題なければ `CS_TEST_MODE=false` へ

## 運用

- **通知**: 現状は /admin/support を開いて確認(betimailのTelegram通知に相当するものは未実装 — 必要なら追加)
- **ウェルカムメール**: 新規登録(初回ログイン)時に自動送信(実メールのみ・失敗してもサインアップは失敗しない)
- **知識ベースの更新**: `packages/api-contracts/src/cs/knowledge.ts` を編集してデプロイ。新機能を出したら必ず追記する(AIは知らないことを「確認して折り返す」と答える設計)
- **自動送信への移行**(将来): 承認履歴でAI品質を確認後、閾値付き自動送信を実装予定(betimailの `AI_CONFIDENCE_THRESHOLD` 方式)

## テーブル

`cs_messages` — 受信(RECEIVED)と送信(SENT)を1テーブルで管理。
message_id / webhook_email_id のユニーク制約で重複Webhookを排除。
状態: PENDING → SENT / REJECTED(+将来 AUTO_SENT)。全操作は audit_logs に記録。
