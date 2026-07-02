
# Seven Days Derby
# 決済設計仕様書（Settlement Design）

**Version:** v0.1.4 日本語版  
**作成日:** 2026-07-02  
**ステータス:** ドラフト / Wallet残高区分追加版

---

# 0. このドキュメントの目的

本ドキュメントは、Seven Days Derby における決済・台帳・Wallet構造を定義する。

本バージョンでは、ユーザーWalletを単一残高ではなく、金融システムとして複数残高に分割する。

---

# 1. 基本方針

Seven Days Derbyでは、USDTをゲーム内P2P取引で直接移動させない。

ゲーム内取引はすべて Game Ledger 上で処理する。

USDTがオンチェーンで動くのは以下のみ。

1. 入金時
2. 出金時

---

# 2. 決済憲法（Settlement Constitution）

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

# 3. Wallet設計

## 3.1 Walletは単一残高にしない

ユーザーのWalletは単一残高ではなく、最低5種類の残高に分けて管理する。

```text
Available Balance
Locked Balance
Pending Reward Balance
Pending Withdraw Balance
Frozen Balance
```

---

## 3.2 Available Balance

ユーザーが自由に使用できるGame USD残高。

使用可能用途:

- 馬購入要求
- アイテム購入
- 出金申請
- その他通常決済

---

## 3.3 Locked Balance

購入要求・出金要求などにより、一時的にロックされたGame USD。

Locked Balanceは以下に使用できない。

- 追加購入
- 出金
- アイテム購入
- 他決済

主な発生ケース:

- 馬購入要求
- 出金要求
- 20時バッチ処理前の仮押さえ

---

## 3.4 Pending Reward Balance

発生はしているが、まだAvailableへ反映されていない報酬。

例:

- 殿堂馬7日配当の未受取分
- MLM報酬の承認待ち
- リベンジバフ報酬の確定待ち
- イベント報酬の受取待ち

Pending Rewardは、ユーザーが受取操作を行う、またはシステム確定処理が完了した時点でAvailableへ移動する。

---

## 3.5 Pending Withdraw Balance

出金申請中のGame USD。

出金申請時にAvailableからPending Withdrawへ移動する。

出金完了時にGame Ledgerから減算され、Escrow Walletから外部ウォレットへUSDTが送金される。

---

## 3.6 Frozen Balance

不正検知・KYC未完了・AML審査・管理者レビュー等により凍結されたGame USD。

Frozen Balanceは通常操作では利用できない。

凍結・解除は監査ログ必須とする。

---

# 4. Wallet残高計算

## 4.1 基本計算式

```text
total_balance
= available_balance
+ locked_balance
+ pending_reward_balance
+ pending_withdraw_balance
+ frozen_balance
```

## 4.2 出金可能残高

```text
withdrawable_balance = available_balance
```

ただし、KYC / AML / 国別制限 / 管理者レビューにより、出金可能でも出金保留になる場合がある。

---

# 5. Purchase Session設計

## 5.1 Purchase RequestからPurchase Sessionへ

今後、購入処理は単なるPurchase Requestではなく、Purchase Sessionとして管理する。

理由:

- 残高ロック
- マッチング
- 価格確定
- 差額返却
- 失敗処理
- 将来のVIP条件
- 優先購入
- アイテム連動

を1つの処理単位として管理するため。

---

## 5.2 Purchase Session基本フロー

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

## 5.3 Purchase Session status候補

```text
pending
locked
matched
settled
failed
cancelled
expired
```

---

# 6. 台帳設計

## 6.1 Ledger Entryの基本原則

すべての残高変動は ledger_entries に記録する。

Wallet残高を直接書き換えない。

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
```

---

# 7. 20時バッチ処理との関係

Wallet残高区分は20時バッチに直接関係する。

## 7.1 購入処理

```text
Available → Locked
Locked → 決済
余剰 Locked → Available
```

## 7.2 出金処理

```text
Available → Pending Withdraw
Pending Withdraw → 出金完了
```

## 7.3 報酬処理

```text
Pending Reward → Available
```

## 7.4 凍結処理

```text
Available / Pending / Locked → Frozen
```

凍結対象の範囲は今後決定する。

---

# 8. 未決定事項

以下は今後決定する。

- 購入時のロック額ルール
- Purchase Sessionキャンセル可否
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

# 9. 現時点の結論

Seven Days DerbyのWalletは、単純な残高1つでは管理しない。

金融システムとして、最低以下の5残高を持つ。

```text
Available
Locked
Pending Reward
Pending Withdraw
Frozen
```

この設計により、購入・報酬・出金・凍結・バッチ処理を安全に分離できる。

---

# 10. 変更履歴

## v0.1.4

- Walletを5残高構成に変更。
- Available / Locked / Pending Reward / Pending Withdraw / Frozen を追加。
- Purchase RequestをPurchase Sessionへ拡張する方針を追加。
- ledger_entriesに各残高Before/Afterを追加。
- Wallet残高区分と20時バッチの関係を追加。

## v0.1.3

- 購入要求はUser単位、レース結果はHorse単位で管理する方針を追加。

## v0.1.2

- 購入要求時にGame USDを一時ロックする方針を追加。

## v0.1.1

- 所有権は20時バッチで一括確定する方針を追加。

## v0.1.0

- Settlement Design初期版を作成。
