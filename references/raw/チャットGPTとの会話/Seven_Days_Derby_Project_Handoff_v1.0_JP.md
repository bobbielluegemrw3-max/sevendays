
# Seven Days Derby
# Project Handoff v1.0

作成日: 2026-07-02

---

# 1. このドキュメントの目的

本ドキュメントは、新しいChatGPTセッションへ設計内容を正確に引き継ぐための引継ぎ書である。

この内容を最優先とし、既存仕様との整合性を維持しながら設計を継続すること。

---

# 2. プロジェクト概要

プロジェクト名:
Seven Days Derby

対象:
グローバル向けWeb3競馬育成ゲーム

開発体制:

・オーナー：マレーシア
・開発責任者：ユーザー（仁さん）
・ChatGPT：Chief System Architect

最終目標:

Claude Codeへそのまま渡せる商用レベルの設計書を完成させる。

---

# 3. 設計思想

このゲームは単なる競馬ゲームではない。

以下の3つを同時に実現する。

① AI競馬ゲーム

② P2Pマーケット

③ 信頼できる金融システム

設計では

「ゲーム性」

よりも

「破綻しない経済」

を優先する。

---

# 4. 現在確定している重要仕様

■ 馬

・寿命は7日
・Day0のみ新規発行
・Day1以上は自然生成のみ
・価格はDayだけで決まる
・能力は調教で成長
・DNAは固定
・レベルなし
・数値能力は非公開
・名前あり
・血統あり
・性別あり
・誕生日あり

■ レース

・世界中の全馬が1レース
・順位は毎日リセット
・履歴は永久保存
・下位10%バーン
・毎日馬場・天候変化

■ マーケット

・ユーザーは馬を選べない
・AIがランダム割当
・P2P優先
・不足時のみDay0発行
・売却待ちは翌日持越し

■ 殿堂

・Day7は1回だけ売却可能
・最終オーナーのみ挑戦
・3日チャレンジ
・勝利時200USDを7日配当
・配当終了後引退
・記念NFT永久保存

---

# 5. Trust Architecture

運営でも変更できない。

・勝率
・価格
・順位
・DNA
・能力
・Day1以上発行
・馬削除

---

# 6. Settlement Design

採用済み

・Escrow Wallet
・Game Account
・Game Ledger
・USDTは入出金のみ
・ゲーム内はLedger管理
・Purchase Session（UIはOwnership Assignment）
・20時バッチで所有権確定
・Game Accountは5残高
・Ledger直接更新禁止

---

# 7. 未決定事項

・MLM詳細
・アイテム詳細
・Ability一覧
・DNA一覧
・管理画面
・DB詳細
・API
・ER図
・20時バッチ詳細
・ロック額計算
・KYC
・チェーン選定
・法務

---

# 8. 今後の設計順序

① Settlement完成
② Horse Domain
③ Market Domain
④ Race Domain
⑤ Item
⑥ Economy
⑦ MLM
⑧ DB
⑨ API
⑩ 管理画面
⑪ Claude Code仕様

---

# 9. ChatGPTへの引継ぎ

以後のセッションでは、この引継ぎ書を最優先資料として扱うこと。

毎回Markdownを作るのではなく、10〜20件の仕様確定ごとに更新する。

ChatGPTの役割は「Chief System Architect」とし、オーナーの思想を尊重しながら、実装可能な設計へ翻訳すること。
