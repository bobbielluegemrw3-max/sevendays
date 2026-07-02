
# Seven Days Derby
# 決済設計仕様書（Settlement Design）

**Version:** v0.1.6 日本語版  
**作成日:** 2026-07-02  
**ステータス:** ドラフト / Ownership Assignment概念追加版

---

# 0. このドキュメントの目的

本ドキュメントは、Seven Days Derby における決済・台帳・Game Account・馬主割当構造を定義する。

本バージョンでは、従来の「購入」という表現を整理し、ユーザー体験としては **AIによる馬主割当（Ownership Assignment）** として定義する。

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

## 2.4 Game Ledger

Game Accountの残高変動を記録する内部台帳。

## 2.5 Game USD

Game Ledger上の内部残高単位。

## 2.6 Burn

ゲーム内USD残高または馬の価値をゲーム内台帳上で消滅させる処理。

## 2.7 Assignment Session

ユーザーが「馬主になる」操作を行ったときに作成される処理単位。

従来のPurchase Sessionを、ユーザー体験上はAssignment Sessionとして扱う。

役割:

- Game USDのロック
- Market Engineによる馬の割当
- 成立価格の確定
- 差額精算
- Horse Owner更新
- 失敗処理

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

馬主割当・移籍代金は Game USD で処理する。

---

## SC-004 バーン対象はゲーム内USDである

レース敗北時に消滅するのは Game Ledger 上の価値であり、USDTそのものをオンチェーンバーンしない。

---

## SC-005 所有権は20時バッチで一括確定する

馬の所有権はリアルタイムでは変更しない。

Assignment SessionはPending状態で保存し、20時バッチ内で一括確定する。

---

## SC-006 Assignment Session時にGame USDを一時ロックする

ユーザーが馬主割当を開始した時点で、必要なGame USDをLocked Balanceへ移動する。

---

## SC-007 Assignment SessionはUser単位で管理する

Assignment SessionはHorseではなくUserに紐づく。

所有中の馬がレースで敗北しても、別管理のAssignment Sessionには影響しない。

---

## SC-008 レース結果はHorse単位で管理する

レース結果はUserではなくHorse単位で管理する。

複数頭所有している場合、敗北した馬のみがバーンされる。

---

## SC-009 Assignment Sessionはユーザー都合でキャンセルできない

Assignment Session開始後、ユーザーは自己都合でキャンセルできない。

Assignment Sessionは20時バッチまで有効とする。

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

---

## SC-011 プレイヤー体験上は「購入」ではなく「馬主割当」とする

ユーザーは馬を自由に選んで購入するのではない。

Market Engineが市場在庫から1頭を選び、ユーザーをその馬の新しい馬主として割り当てる。

ユーザー向け表現:

```text
AIがあなたに馬を割り当てました。
あなたは本日、この馬の馬主です。
```

内部処理上は台帳決済を伴うが、ゲーム体験としてはOwnership Assignmentとして扱う。

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

- 馬主割当開始
- アイテム購入
- 出金申請
- その他通常決済

---

## 4.3 Locked Balance

Assignment Session・出金要求などにより、一時的に利用不可になったGame USD。

---

## 4.4 Pending Reward Balance

発生はしているが、まだAvailableへ反映されていない報酬。

---

## 4.5 Pending Withdraw Balance

出金申請中のGame USD。

---

## 4.6 Frozen Balance

不正検知・KYC未完了・AML審査・管理者レビュー等により凍結されたGame USD。

---

# 5. Ownership Assignment設計

## 5.1 基本思想

Seven Days Derbyでは、ユーザーは馬を選ばない。

ユーザーは「馬主になる」操作を行い、AIが市場在庫に基づいて馬を割り当てる。

これは以下の思想に基づく。

- 不良在庫を発生させない
- ユーザーによるDay選別を防ぐ
- 市場在庫比率を抽選確率へ反映する
- AIが市場流動性を維持する
- ユーザー体験をシンプルにする

---

## 5.2 内部処理とUI表現の分離

内部実装上は、Assignment Sessionは決済処理を含む。

しかし、UI上では「購入」よりも「AIによる馬主割当」として表現する。

| 層 | 表現 |
|---|---|
| UI | 馬主割当 / AI Assignment |
| Domain | Assignment Session |
| Settlement | Game Ledger決済 |
| DB | assignment_sessions / ledger_entries |

---

## 5.3 Assignment Session基本フロー

```text
Userが馬主割当を開始
    ↓
Assignment Session作成
    ↓
必要額をAvailableからLockedへ移動
    ↓
20時バッチでMarket Engineが在庫比率に基づき馬を割当
    ↓
成立価格を確定
    ↓
Lockedから決済
    ↓
余剰LockedをAvailableへ返却
    ↓
Horse Ownerを一括更新
    ↓
Assignment Session終了
```

---

## 5.4 Assignment Session status候補

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
assignment_lock
assignment_settle
assignment_release
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

# 7. 20時バッチ処理との関係

## 7.1 Assignment処理

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

---

# 8. 未決定事項

以下は今後決定する。

- Assignment Session時のロック額ルール
- Assignment Sessionの最小必要残高
- 成立価格がロック額を超えた場合の処理
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

Seven Days Derbyでは、ユーザー体験として「馬を購入する」よりも、  
**AIがユーザーを馬主として割り当てる**設計を採用する。

これにより、以下が実現できる。

- ユーザーは馬を選べない
- 市場在庫比率が抽選確率になる
- Day選別による市場停滞を防げる
- ゲーム世界観が自然になる
- 内部ではGame Ledgerにより決済整合性を保てる

---

# 10. 変更履歴

## v0.1.6

- Purchase Sessionをユーザー体験上はOwnership Assignment / Assignment Sessionへ整理。
- SC-011「プレイヤー体験上は購入ではなく馬主割当とする」を追加。
- entry_typeをpurchase系からassignment系へ変更。
- UI / Domain / Settlement / DBの表現分離を追加。

## v0.1.5

- Purchase Sessionはユーザー都合でキャンセル不可。
- Game Account残高の直接更新禁止。
- Ledger Engineを追加。

## v0.1.4

- Walletを5残高構成に変更。
- Game Account概念を追加。

## v0.1.3

- 購入要求はUser単位、レース結果はHorse単位で管理。

## v0.1.2

- 購入要求時にGame USDを一時ロック。

## v0.1.1

- 所有権は20時バッチで一括確定。

## v0.1.0

- Settlement Design初期版を作成。
