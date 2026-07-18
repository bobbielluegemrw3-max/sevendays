-- V2実装-7 / Decision 110: 自動購入予約のプール型再定義。
-- auto_pool_amount(USDT・下限102)が設定されたユーザーは、V2シーズンの
-- バッチ後スイープで「生きているプールが無ければ、残高から min(設定額, 残高) の
-- プール予約を自動作成」する。未設定(null)のユーザーは従来のSINGLE予約のまま
-- (継続性 — 経路温存)。V1シーズンの挙動は不変。
alter table user_trade_settings
  add column auto_pool_amount numeric(20, 8)
    check (auto_pool_amount is null or auto_pool_amount >= 102);
