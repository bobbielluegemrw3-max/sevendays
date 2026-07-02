
# Seven Days Derby
# 決済設計仕様書（Settlement Design）

**Version:** v0.1.5 日本語版  
**作成日:** 2026-07-02  
**ステータス:** ドラフト / Purchase Sessionキャンセル不可・Ledger直接更新禁止追加版

---

# 0. このドキュメントの目的

本ドキュメントは、Seven Days Derby における決済・台帳・Game Account構造を定義する。

本バージョンでは、以下を追加する。

- Purchase Sessionはユーザー都合でキャンセル不可
- Game Account残高の直接更新禁止
- すべての残高変動はledger_entries経由で記録する

---

# 1. 基本方針

Seven Days Derbyでは、USDTをゲーム内P2P取引で直接移動させない。

ゲーム内取引はすべて Game Ledger 上で処理する。

USDTがオンチェーンで動くのは以下のみ。

1. 入金時
2. 出金時

---

# 2. 用語定義

## 2.1 External Wallet

ユーザーが保有する外部ウォレット。

例:

- MetaMask
- Trust Wallet
- OKX Wallet
- その他対応ウォレット

## 2.2 Escrow Wallet

運営が管理する入出金用ウォレット。

## 2.3 Game Account

ゲーム内USDを管理するユーザー口座。

従来「Wallet」と呼んでいた内部残高管理を、本仕様ではGame Accountと呼ぶ。

理由:

- 外部ウォレットと混同しないため
- 実態はゲーム内口座・台帳であるため

## 2.4 Game Ledger

Game Accountの残高変動を記録する内部台帳。

## 2.5 Game USD

Game Ledger上の内部残高単位。

## 2.6 Burn

ゲーム内USD残高または馬の価値をゲーム内台帳上で消滅させる処理。

## 2.7 Purchase Session

ユーザーが「馬を購入」ボタンを押したときに作成される購入処理単位。

残高ロック、マッチング、決済、差額返却、失敗処理を1つのSessionとして管理する。

---

# 3. 決済憲法（Settlement Constitution）

## SC-001 外部USDTとゲーム内USDを分離する

ゲーム内売買ではUSDTを直接移動させない。

USDTは入金時と出金時のみオンチェーンで移動する。

---

## SC-002 ユーザー間の直接USDT送金は禁止

Player B から Player A へ直接USDTを送金しない。

すべて Game Ledger 上の内部残高で処理する。

---

## SC-003 馬購入はGame Ledger残高で行う

馬購入・移籍代金は Game USD で処理する。

---

## SC-004 バーン対象はゲーム内USDである

レース敗北時に消滅するのは Game Ledger 上の価値であり、USDTそのものをオンチェーンバーンしない。

---

## SC-005 所有権は20時バッチで一括確定する

馬の所有権はリアルタイムでは変更しない。

購入要求・移籍要求はPending状態で保存し、20時バッチ内で一括確定する。

---

## SC-006 購入要求時にGame USDを一時ロックする

ユーザーが購入要求を出した時点で、必要なGame USDをLocked Balanceへ移動する。

---

## SC-007 購入要求はUser単位で管理する

購入要求はHorseではなくUserに紐づく。

所有中の馬がレースで敗北しても、別管理の購入要求には影響しない。

---

## SC-008 レース結果はHorse単位で管理する

レース結果はUserではなくHorse単位で管理する。

複数頭所有している場合、敗北した馬のみがバーンされる。

---

## SC-009 Purchase Sessionはユーザー都合でキャンセルできない

Purchase Session開始後、ユーザーは自己都合でキャンセルできない。

Purchase Sessionは20時バッチまで有効とする。

例外として、以下の場合のみSystem Cancelを許可する。

- システム障害
- 残高異常
- 二重処理検知
- 運営メンテナンス
- 不正検知

---

## SC-010 Game Account残高の直接更新は禁止する

Game Accountの残高は直接更新してはならない。

すべての残高変動はledger_entriesへ記録し、その結果としてGame Account残高へ反映する。

禁止例:

```text
user.available_balance = user.available_balance + 100
```

許可される処理:

```text
ledger_entriesへ記録
    ↓
Ledger Engineが残高へ反映
    ↓
監査ログ保存
```

このルールにより、以下を実現する。

- 残高改ざん防止
- 監査可能性
- 障害時の復旧
- 二重処理検知
- 会計整合性
- 管理者不正防止

---

# 4. Game Account設計

## 4.1 Game Accountは単一残高にしない

ユーザーのGame Accountは単一残高ではなく、最低5種類の残高に分けて管理する。

```text
Available Balance
Locked Balance
Pending Reward Balance
Pending Withdraw Balance
Frozen Balance
```

---

## 4.2 Available Balance

ユーザーが自由に使用できるGame USD残高。

使用可能用途:

- 馬購入要求
- アイテム購入
- 出金申請
- その他通常決済

---

## 4.3 Locked Balance

購入要求・出金要求などにより、一時的に利用不可になったGame USD。

Locked Balanceは以下に使用できない。

- 追加購入
- 出金
- アイテム購入
- 他決済

---

## 4.4 Pending Reward Balance

発生はしているが、まだAvailableへ反映されていない報酬。

例:

- 殿堂馬7日配当の未受取分
- MLM報酬の承認待ち
- リベンジバフ報酬の確定待ち
- イベント報酬の受取待ち

---

## 4.5 Pending Withdraw Balance

出金申請中のGame USD。

出金申請時にAvailableからPending Withdrawへ移動する。

---

## 4.6 Frozen Balance

不正検知・KYC未完了・AML審査・管理者レビュー等により凍結されたGame USD。

---

# 5. Game Account残高計算

## 5.1 基本計算式

```text
total_balance
= available_balance
+ locked_balance
+ pending_reward_balance
+ pending_withdraw_balance
+ frozen_balance
```

## 5.2 出金可能残高

```text
withdrawable_balance = available_balance
```

ただし、KYC / AML / 国別制限 / 管理者レビューにより、出金可能でも出金保留になる場合がある。

---

# 6. Ledger設計

## 6.1 Ledger Entryの基本原則

すべての残高変動は ledger_entries に記録する。

Game Account残高を直接書き換えない。

---

## 6.2 ledger_entries基本カラム案

```text
ledger_entries

id
user_id
entry_type
amount
currency
direction
related_entity_type
related_entity_id

available_before
available_after
locked_before
locked_after
pending_reward_before
pending_reward_after
pending_withdraw_before
pending_withdraw_after
frozen_before
frozen_after

idempotency_key
created_by
created_at
metadata
```

---

## 6.3 entry_type候補

```text
deposit
purchase_lock
purchase_settle
purchase_release
transfer_credit
horse_burn
hall_reward_pending
hall_reward_claim
mlm_reward_pending
mlm_reward_claim
revenge_reward
withdrawal_lock
withdrawal_complete
withdrawal_release
freeze
unfreeze
system_fee
admin_adjustment
system_cancel
```

---

## 6.4 Ledger Engine

Ledger Engineは、ledger_entriesを作成し、Game Account残高へ反映する唯一の責務を持つ。

Ledger Engine以外の処理は、Game Account残高を直接変更できない。

---

## 6.5 Idempotency Key

すべての重要な残高変更にはidempotency_keyを付与する。

目的:

- 二重実行防止
- バッチ再実行耐性
- 障害復旧
- APIリトライ対応

例:

```text
purchase_session:{session_id}:settle
withdrawal:{withdrawal_id}:complete
race:{race_id}:burn:{horse_id}
```

---

# 7. Purchase Session設計

## 7.1 Purchase Session基本フロー

```text
Userが購入開始
    ↓
Purchase Session作成
    ↓
必要額をAvailableからLockedへ移動
    ↓
20時バッチでMarket Engineがマッチング
    ↓
成立価格を確定
    ↓
Lockedから決済
    ↓
余剰LockedをAvailableへ返却
    ↓
Horse Ownerを一括更新
    ↓
Purchase Session終了
```

---

## 7.2 Purchase Session status候補

```text
pending
locked
matched
settled
failed
system_cancelled
expired
```

ユーザー都合のcancelledは原則存在しない。

---

# 8. 20時バッチ処理との関係

## 8.1 購入処理

```text
Available → Locked
Locked → 決済
余剰 Locked → Available
```

## 8.2 出金処理

```text
Available → Pending Withdraw
Pending Withdraw → 出金完了
```

## 8.3 報酬処理

```text
Pending Reward → Available
```

## 8.4 凍結処理

```text
Available / Pending / Locked → Frozen
```

凍結対象の範囲は今後決定する。

---

# 9. 未決定事項

以下は今後決定する。

- 購入時のロック額ルール
- Pending Rewardの受取方式
- 報酬の自動反映か手動Claimか
- Frozen Balanceの凍結条件
- Frozen Balance解除権限
- 出金審査方式
- KYC必須タイミング
- 出金可能国
- 最小入金額
- 最小出金額
- 出金手数料
- 入金対応チェーン
- Escrow Walletのマルチシグ構成

---

# 10. 現時点の結論

Seven Days DerbyのGame Accountは、単純な残高1つでは管理しない。

金融システムとして、最低以下の5残高を持つ。

```text
Available
Locked
Pending Reward
Pending Withdraw
Frozen
```

また、Game Account残高は直接書き換えず、必ずledger_entriesを通して更新する。

これにより、購入・報酬・出金・凍結・バッチ処理を安全に分離できる。

---

# 11. 変更履歴

## v0.1.5

- SC-009「Purchase Sessionはユーザー都合でキャンセルできない」を追加。
- SC-010「Game Account残高の直接更新は禁止する」を追加。
- Wallet表記をGame Accountへ整理。
- Ledger Engineを追加。
- idempotency_keyを追加。
- Purchase Session statusからユーザー都合cancelledを削除し、system_cancelledを追加。

## v0.1.4

- Walletを5残高構成に変更。
- Available / Locked / Pending Reward / Pending Withdraw / Frozen を追加。
- Purchase RequestをPurchase Sessionへ拡張する方針を追加。

## v0.1.3

- 購入要求はUser単位、レース結果はHorse単位で管理する方針を追加。

## v0.1.2

- 購入要求時にGame USDを一時ロックする方針を追加。

## v0.1.1

- 所有権は20時バッチで一括確定する方針を追加。

## v0.1.0

- Settlement Design初期版を作成。
