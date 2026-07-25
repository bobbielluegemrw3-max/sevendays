-- A3 (WALLET_HARDENING_AND_R1_BRIEF.md §2/§3): 出金先ホワイトリスト + 新規宛先クーリング遅延。
-- 目的: セッション乗っ取り時の全額流出を構造的に止める。
--   1) 出金は user_wallets(連携済み・personal_sign証明あり)の宛先にのみ可(withdraw ゲート)。
--   2) 新規に連携した宛先は withdrawable_at まで出金不可(クーリング=乗っ取りの被害窓を制限)。
--      追加時にアラート通知が飛ぶので、真の所有者は解禁前に取消/unlinkできる。
--
-- withdrawable_at: この時刻を過ぎたら出金可。fail-closed=NULLは出金不可扱い(ゲート側で判定)。
alter table user_wallets add column if not exists withdrawable_at timestamptz;

-- 既存の連携済みウォレットは grandfather(即時出金可): created_at を解禁時刻に。
-- (この改修より前に連携した宛先は本人が意図して足したもの=遅延を課さない)
update user_wallets set withdrawable_at = created_at where withdrawable_at is null;
