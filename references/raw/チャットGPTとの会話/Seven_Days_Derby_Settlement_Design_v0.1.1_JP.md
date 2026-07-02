
# Seven Days Derby
# 決済設計仕様書（Settlement Design）

**Version:** v0.1.1 日本語版  
**作成日:** 2026-07-02  
**ステータス:** ドラフト / 所有権確定ルール追加版

---

# 0. このドキュメントの目的

本ドキュメントは、Seven Days Derby における以下の決済構造を定義する。

- 外部ウォレット
- USDT入金
- 運営Escrowウォレット
- ゲーム内USD台帳
- P2P馬購入
- 自動移籍 / 自動マッチング
- 所有権確定
- バーン
- 殿堂馬報酬
- MLM報酬
- 出金

このゲームの決済設計では、ユーザー同士が直接USDTを送受信しない。  
ゲーム内の売買は、すべてゲーム内USD台帳上で処理する。

---

# 1. 基本方針

## 1.1 このゲームは完全P2P送金ではない

Seven Days Derby は、ユーザー同士が直接USDTを送金するP2Pではない。

実際の構造は以下である。

```text
外部ウォレット
    ↓
USDT入金
    ↓
運営Escrowウォレット
    ↓
ゲーム内USD台帳
    ↓
馬購入・移籍・バーン・報酬
    ↓
出金申請
    ↓
USDT出金
    ↓
外部ウォレット
```

---

## 1.2 ゲーム内USDはUSDTそのものではない

ゲーム内に表示されるUSDは、USDTそのものではない。

ゲーム内USDは、運営システム内の台帳残高である。

```text
USDT = 外部決済資産
ゲーム内USD = ゲーム内台帳残高
```

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

ユーザーが入金したUSDTは、一度Escrow Walletへ入る。

Escrow Wallet内のUSDTは、ゲーム内台帳残高の裏付けとして扱う。

## 2.3 Game Ledger

ゲーム内USDを管理する内部台帳。

実際のUSDTを毎回動かすのではなく、Game Ledger上で残高を増減させる。

## 2.4 Game USD

Game Ledger上の内部残高単位。

表示上は「USD」とする。

ただし、ブロックチェーン上のトークンではない。

## 2.5 Burn

ゲーム内USD残高または馬の価値をゲーム内台帳上で消滅させる処理。

USDTそのものをオンチェーンでバーンする処理ではない。

---

# 3. 決済憲法（Settlement Constitution）

## SC-001 外部USDTとゲーム内USDを分離する

ゲーム内売買ではUSDTを直接移動させない。

USDTは入金時と出金時のみオンチェーンで移動する。

---

## SC-002 ユーザー間の直接USDT送金は禁止

馬の購入・移籍・売買において、Player B から Player A へ直接USDTを送金しない。

すべてGame Ledger上の内部残高で処理する。

---

## SC-003 馬購入はGame Ledger残高で行う

ユーザーが馬を購入する場合、支払いはGame Ledger上のUSD残高から行う。

```text
Player B Game USD -110
Player A Game USD +110
```

実際のUSDTはオンチェーン上では移動しない。

---

## SC-004 バーン対象はゲーム内USDである

レースで敗北した馬の価値は、Game Ledger上で消滅する。

USDTそのものをオンチェーンでバーンするわけではない。

---

## SC-005 Escrow Walletは全体残高の裏付けを持つ

Escrow Walletは、ユーザーの出金要求に対応するため、ゲーム全体のUSDT残高を管理する。

ただし、ゲーム内でバーンが発生した場合、その分のGame USDは台帳上消滅する。

---

## SC-006 出金時のみUSDTを移動する

ユーザーが出金申請を行った場合のみ、Game Ledger残高を減算し、外部ウォレットへUSDTを送金する。

---

## SC-007 所有権は20時バッチで一括確定する

馬の所有権はリアルタイムでは変更しない。

購入要求・自動マッチング要求は、まずPending状態として記録する。

毎日定時バッチ内で以下の順番に処理する。

```text
1. 購入要求・移籍要求の受付停止
2. Market Engineによるマッチング確定
3. Game Ledger残高移動
4. Horse Owner変更
5. レース対象Owner確定
6. Race Engine実行
```

レース開始時点で、各馬のOwnerは必ず一意に確定している必要がある。

このルールにより、以下を防止する。

- 二重売却
- 二重購入
- 所有権競合
- レース時点のOwnerズレ
- 購入直後の同期不整合

---

# 4. 入金フロー

## 4.1 入金概要

ユーザーは外部ウォレットからUSDTを入金する。

入金されたUSDTは運営Escrow Walletへ送金される。

入金確認後、ユーザーのGame Ledger残高へ同額のGame USDを付与する。

---

## 4.2 入金フロー

```text
User External Wallet
    ↓ USDT Deposit
Escrow Wallet
    ↓ 入金検知
Deposit Engine
    ↓ 台帳反映
User Game Ledger +USD
```

---

# 5. 馬購入 / 自動移籍フロー

## 5.1 基本方針

ユーザーは馬を選ばない。

購入ボタンを押すと、Market Engineが市場在庫から自動マッチングする。

ただし、この時点では所有権を即時変更しない。

購入要求はPendingとして保存され、定時バッチで確定する。

---

## 5.2 購入要求フロー

```text
Player B が購入ボタンを押す
    ↓
購入要求をPendingで保存
    ↓
必要残高を確認
    ↓
必要に応じてGame USDを一時ロック
    ↓
20時バッチでマッチング確定
    ↓
Player B Game USD 減算
    ↓
Player A Game USD 加算
    ↓
Horse Owner を Player B に変更
    ↓
Transfer履歴を保存
```

---

## 5.3 台帳処理例

Day1馬価格 = 110USD

```text
Player B Game USD: -110
Player A Game USD: +110
Horse Owner: A → B
```

オンチェーンUSDTは移動しない。

---

## 5.4 残高不足時

購入者のGame USD残高が不足している場合、購入は成立しない。

ユーザーには不足額を表示し、追加入金を促す。

---

# 6. レース後の自動移籍設計

## 6.1 売却ではなく移籍

本プロジェクトでは、強制売却という表現を避ける。

仕様上は「自動移籍」または「Auto Transfer」とする。

---

## 6.2 自動移籍の基本ルール

Day0〜Day6の馬は、レース終了後、次の馬主候補としてマーケットへ自動的に登録される。

ユーザーは「今日は売らない」という選択を持たない。

これはゲームのライフサイクルである。

---

# 7. バーンフロー

## 7.1 バーン条件

馬がレースで敗北した場合、その馬はバーンされる。

敗北条件:

- ワールドレース下位10%

---

## 7.2 バーン時の処理

敗北した馬はマーケットへ出ない。

該当馬の価値はGame Ledger上で消滅する。

```text
Horse Status: Active → Burned
Horse Value: Burned
Owner receives: 0
```

---

# 8. 20時バッチ処理設計

## 8.1 基本方針

毎日決まった時刻に、全世界で同一処理を行う。

現時点の仮時刻:

```text
20:00 JST
```

実際の運用時刻は未確定。

---

## 8.2 推奨フェーズ

20時処理は複数フェーズに分割する。

```text
Phase 1: 受付停止
Phase 2: 購入要求・移籍要求の確定
Phase 3: Game Ledger決済
Phase 4: Horse Owner一括更新
Phase 5: ワールドレース実行
Phase 6: 勝敗判定
Phase 7: バーン処理
Phase 8: 生存馬Day更新
Phase 9: 自動移籍登録
Phase 10: 報酬処理
Phase 11: 翌日状態開始
```

---

## 8.3 フェーズ詳細

### Phase 1: 受付停止

- 購入受付停止
- 出金受付停止または保留
- 移籍対象を確定

### Phase 2: 購入要求・移籍要求の確定

- Pending purchase requestsを確定対象として抽出
- Market Engineが在庫比率に応じてマッチング
- 成立しない購入要求は失敗扱い

### Phase 3: Game Ledger決済

- 購入者のGame USDを減算
- 売却元オーナーのGame USDを加算
- ledger_entriesへ記録

### Phase 4: Horse Owner一括更新

- 決済済みTransferのみOwnerを変更
- Race対象Ownerを確定
- 以降、Race終了までOwner変更禁止

### Phase 5: ワールドレース実行

- Race Engineが全現役馬を評価
- レース条件を生成
- 全頭順位を算出

### Phase 6: 勝敗判定

- 下位10%を敗北とする
- 生存馬と敗北馬を分離

### Phase 7: バーン処理

- 敗北馬をBurnedへ変更
- 該当Game USD価値を台帳上消滅
- 必要に応じてMLM報酬・リベンジバフ処理を起動

### Phase 8: 生存馬Day更新

- 生存馬はDayを+1する
- 価格はDayに応じて自動更新

### Phase 9: 自動移籍登録

- Day0〜Day6生存馬を移籍候補として登録
- Day7馬は殿堂馬ルールへ進む

### Phase 10: 報酬処理

- 殿堂馬報酬
- MLM報酬
- その他報酬

### Phase 11: 翌日状態開始

- 調教権リセット
- コンディション更新
- ニュース生成
- ランキング公開

---

# 9. 出金フロー

## 9.1 出金概要

ユーザーはGame Ledger上のUSD残高をUSDTとして出金できる。

出金時に、Game Ledger残高を減算し、Escrow Walletから外部ウォレットへUSDTを送金する。

---

## 9.2 出金フロー

```text
User が出金申請
    ↓
Withdraw Engine が残高確認
    ↓
Game Ledger 残高ロック
    ↓
運営承認または自動承認
    ↓
Escrow Wallet からUSDT送金
    ↓
送金完了
    ↓
Game Ledger 残高確定減算
```

---

# 10. 台帳設計

## 10.1 Ledger Entryの基本原則

すべての残高変動はledger_entriesに記録する。

残高を直接書き換えない。

---

## 10.2 Ledger Entry種別

想定種別:

- deposit
- horse_purchase_debit
- horse_transfer_credit
- horse_burn
- hall_reward
- mlm_reward
- revenge_reward
- withdrawal_request
- withdrawal_complete
- adjustment_admin
- system_fee

---

## 10.3 台帳の基本形式

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
balance_before
balance_after
created_at
metadata
```

---

# 11. Escrow管理

## 11.1 Escrowの役割

Escrow Walletは、ユーザー入金USDTを集約管理する。

ゲーム内の売買ではUSDTを動かさない。

出金時のみUSDTを動かす。

---

## 11.2 Escrow監査

運営管理画面では以下を監視する。

- Escrow USDT残高
- Game Ledger総残高
- 出金待ち額
- バーン済み総額
- 報酬予定額
- 殿堂馬未払残高
- MLM未払残高

---

# 12. 重要な未決定事項

以下は今後決定が必要。

- 入金対応チェーン
- 対応USDT規格
- 入金確認ブロック数
- 出金手数料負担者
- 最小入金額
- 最小出金額
- 出金審査方式
- 自動出金か手動承認か
- KYC必須タイミング
- 国別制限
- 出金停止条件
- 購入時の残高不足時の馬確保有無
- 20時処理中の入金反映ルール
- 20時処理中の購入・出金停止時間
- Escrow Walletのマルチシグ構成
- 運営ウォレット権限管理
- 監査ログ保存期間

---

# 13. 現時点の結論

Seven Days Derbyの決済設計では、USDTをゲーム内P2P取引で直接移動させない。

ゲーム内の売買・移籍・バーン・報酬は、Game Ledger上で処理する。

USDTが動くのは以下の2回のみである。

1. 入金時
2. 出金時

また、馬の所有権はリアルタイムでは変更せず、毎日定時バッチ内で一括確定する。

これにより、二重購入、二重売却、所有権競合、レース同期ズレを防止する。

---

# 14. 変更履歴

## v0.1.1

- SC-007「所有権は20時バッチで一括確定する」を追加。
- 馬購入フローを「即時Owner変更」から「Pending要求 → 定時確定」へ修正。
- 20時バッチ処理にGame Ledger決済とOwner一括更新フェーズを追加。

## v0.1.0

- Settlement Design初期版を作成。
- USDT / Escrow / Game Ledger / Burn / Withdrawal の基本方針を定義。
- 20時バッチ処理の初期フェーズを定義。
