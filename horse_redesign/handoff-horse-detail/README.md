# 適用方法（Apply）— /horses/[id] 馬詳細・調教ページ リデザイン

ダッシュボード/厩舎（Option 1c）と同じ部品言語で組んだ「続きのページ」。日課「調教」を行う画面。

## 中身

```
handoff-horse-detail/
├─ apps/web/components/HorseDetailView.tsx   ← 新規(純表示: ヒーロー + 能力 + 調教 + 検証情報)
├─ apps/web/app/horse-detail.module.css       ← 新規(専用CSS)
├─ 仕様書.md                                   ← 再現仕様(構成・状態別・:global()方針・受け入れ基準)
└─ README.md                                  ← このファイル
```

## 手順

1. 2ファイルを配置：
   ```
   cp handoff-horse-detail/apps/web/components/HorseDetailView.tsx  apps/web/components/HorseDetailView.tsx
   cp handoff-horse-detail/apps/web/app/horse-detail.module.css      apps/web/app/horse-detail.module.css
   ```
2. `apps/web/app/horses/[id]/page.tsx` を `HorseDetailView` に結線（仕様書 §6）。
3. 確認： `pnpm --filter web dev` → 任意の馬詳細ページ。

## 変更しないもの

`HorseArt.tsx` / `TrainingForm.tsx` / `horse-visual.ts` / `globals.css`。表示は `HorseDetail` + `PRICE_TABLE_V1` のみ、架空値なし。

---

## 残りのページ（ロードマップ）

まだ初版（`.panel`+テーブル）のままのページ。優先度順：

1. **races / races/[id]** — レース一覧・結果 + commit-reveal 検証（日課の「結果確認」）
2. **wallet** — 残高・入金・出金・履歴
3. **purchase** — 購入セッション・割当履歴
4. **notifications** — 現在は生JSON表示（要改善度が高い）
5. **buybacks / buybacks/[id]** — Day7 買い戻しスケジュール
6. **account** — アカウント・ログイン連携

「次は races を」等と指定いただければ、同じ 1c 部品言語で順に仕上げます。
