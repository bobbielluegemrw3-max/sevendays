-- Migration: 施策C (FUN_V3, Decision 114) — 1頭非売指定 (reserved horse)
--
-- ユーザーは「自動出品(Smart Profit Taking)から保護する1頭」を指定できる。
-- 保護は【出品選定からの除外だけ】に閉じる。レース出走・BURN判定・チャンピオン
-- 到達・価格上昇には一切影響しない。手動出品は従来どおり可能(「自動で売られ
-- たくない」であって「売れない」ではない)。
--
-- 方式: users.reserved_horse_id が保護対象を指すポインタ。null = 保護なし。
--   - 変更は 1日1回(reserved_horse_changed_on。厩舎名変更 stable_name_changed_on
--     と同じパターン)。無制限だと「今夜選ばれそうな馬に付け替える」抜け道になる。
--   - 新規ユーザーの最初の1頭は取得時に自動で保護(assignment/execute.ts)。
--     100 USDTで入った人が唯一の1頭を即売却され7日間の物語を体験できない問題
--     (PRELAUNCH_COPY_RISKS R2)への直接対策。
--   - 保護中の馬がBURNされたら、そのオーナーの最古のアクティブ馬へ自動スライド
--     (burn/execute.ts の1文UPDATE。決定論・冪等)。
--
-- 経済影響はゼロ(実測): 実出品数の律速は「1オーナー最大2頭/バッチ」であり
-- プールの大きさではないため、1頭を除外しても実出品数は変わらない。

alter table users add column reserved_horse_id uuid references horses (id);
alter table users add column reserved_horse_changed_on date;

comment on column users.reserved_horse_id is
  '施策C: 自動出品から保護する1頭(null=保護なし)。出品選定の除外のみに作用する';
comment on column users.reserved_horse_changed_on is
  '施策C: 非売指定を最後に変更した日(1日1回制限。厩舎名変更と同パターン)';
