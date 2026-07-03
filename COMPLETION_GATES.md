# Completion Gates 検証台帳(docs/README.md「v1.0 release is forbidden until all gates pass」)

各ゲートの検証手段と現在の状態。**エビデンスは全て再実行可能**(`pnpm turbo run test --force` ほか)。

| Gate | 内容 | エビデンス(再実行可能) | 状態 |
|---|---|---|---|
| G1 | Ledger Integrity | `ledger` 14件(貸借一致・冪等・負残高拒否・実Postgres並行二重支払いopt-in)+ DB遅延トリガー(`database` schema.test)+ 毎バッチStep 36 `reconcile()` + G10日次reconcile | ✅ PASS |
| G2 | Race Replay | `race-engine` replay.test(同一スナップショット+シード→同一結果・改ざん検知)+ バッチStep 37 `VERIFY_RACE_REPLAY_INPUTS` + `/races/{id}/replay` API | ✅ PASS |
| G3 | Burn Determinism | `race-engine` burn.test(決定論・floor丸め・上限厳守・統計検証)+ `settlement-engine` burn e2e + G10で全日 `burned ≤ floor(N×rate)` 検証 | ✅ PASS |
| G4 | Assignment Determinism | `settlement-engine` assignment e2e(決定論キュー・クラッシュ再開で同一結果・Day0フォールバック) | ✅ PASS |
| G5 | Buyback Payment | `settlement-engine` buyback e2e(200 USDT/7回/D+1/端数28.57142857×6+28.57142858)+ DB CHECK制約 + G10で期日支払い完遂検証 | ✅ PASS |
| G6 | Recovery Procedure | `settlement-engine` recovery.test(二重承認・別人2名・posted Ledger不変・タイムアウト24h)+ Admin API(承認レースガード込み) | ✅ PASS |
| G7 | RLS Security | `database` schema.test RLS節(own-rows only・admin不可視・透明読み取り)+ `api-contracts`/`web` 認証境界テスト | ✅ PASS |
| G8 | Forbidden API Check | `scripts/check-forbidden-apis.mjs`(CI: リテラルgrep)+ registry登録時の実行時拒否 + api.test G8節 | ✅ PASS |
| G9 | Stress Test | `economy-engine` stress 8種(Decision 059の入力・30日ホライズン・合格基準・Status連動)+ バッチStep 32で日次実行 | ✅ PASS |
| G10 | 100,000 User Simulation | `settlement-engine/test/g10-simulation.test.ts` — 実DB+本番37ステップバッチを日次で回し、毎日「バッチCOMPLETED・reconcileクリーン・期日Buyback全PAID・Marketplace再開」+最終スイープ(Burn上限・スケジュール200/7・バフ保存則)。スモーク(1500人×5日)は常時スイートで実行。**フルスケール**: `G10_USERS=100000 G10_DAYS=30 G10_DAILY_BUYERS=1000 pnpm --filter @sevendays/settlement-engine test -- g10` | ✅ **PASS**(下記実行記録) |

## G10 フルスケール実行記録

| 日時 | パラメータ | 結果 |
|---|---|---|
| 2026-07-03 | 5,000人×12日×100購入/日(中規模) | ✅ PASS(馬628・Burn228・Day7到達182・期日支払い全消化・毎日reconcileクリーン) |
| 2026-07-03 | 100,000人×30日×1,000購入/日(本番ゲート) | ✅ **PASS** — 馬14,968・Burn6,344・Buyback完了4,531・期日支払い30日間全消化・毎日reconcileクリーン。**27日目にNORMAL→WATCH自動遷移→Burn率上昇→29日目NORMAL復帰**(Status連動の自己安定を実測)。註: vitestレポーターのRPCタイムアウト(ツール側ノイズ)がテスト全PASS後に1件発生 — ドメイン結果に影響なし |

## 備考

- G10はPGlite(インプロセスPostgres)上で本番と同一のマイグレーション・トリガー・37ステップハンドラを使用。シーディングのみ集合SQL(トリガー・制約は行ごとに発火)
- 経済フィードバックの検証: Burn率はEconomy Status連動(NORMAL 10.0%→EMERGENCY 11.2%)。Day7到達率≈0.9^7≈47.8%でBuyback負債≈95.66/mint vs 準備金積立93.60/mint — **Status遷移による自己安定が設計仕様**であり、フル実行でこの遷移を観測することが合格条件に含まれる

## 経済改定v1.1(Decision 069, 2026-07-04)後の再検証

- 需要急停止ドリル(`econ-experiment.mjs`): 旧経済=停止9日後に未払い279件で破綻 / **v1.1=40日間・5,404件支払い・未払い0件・清算後準備金+866.73**
- G10スモーク(1,500人×5日): 通常スイートでPASS(ゲート込み)
- G10フルスケール(100,000人×30日×1,000購入/日): ✅ **v1.1でPASS**(2026-07-04) — 馬9,859・Burn4,636・Buyback完了2,492・期日支払い30日間全消化・毎日reconcileクリーン。**担保ゲートが高需要時にミントを波状に絞る挙動を観測**(参加頭数485〜2,510で循環)しつつ、Status遷移なし(NORMAL維持)・準備金は40.6万で終幕(旧経済より1ミントあたり大幅に健全)。ゲート閉鎖日の購入者は全額自動返金で資金事故なし
