import { createTestDb } from '@sevendays/database';
import { Money, addDays } from '@sevendays/shared';
import {
  buildProductionHandlers,
  createPurchaseSession,
  runBatch,
} from '../dist/index.js';

/**
 * 運営RTP計測ドリル(オーナー依頼 2026-07-14・Decision 099適用後の検算)
 *
 * econ-experiment.mjs と同じ「実エンジン実バッチ」方式だが、
 *   ①ユーザーに配置ツリー(3分木)を張り、祝い金が実際に支払われる状態にする
 *   ②需要停止後も全債務が清算されるまで回し、最終バランスシートで
 *     運営利益(=プラットフォーム勘定の純残高 − 未清算債務)を算出する
 *   ③099(スターターレート)と092(T1=3固定)の差分も同時に報告する
 *
 * 含まれないもの: アイテム売買(運営の追加マージン=保守側)・入出金ガス。
 *
 * 実行: node packages/settlement-engine/scripts/operator-rtp-sim.mjs
 */

const USERS = Number(process.env.RTP_USERS ?? 8000);
const BUYERS = Number(process.env.RTP_BUYERS ?? 300);
const STOP = Number(process.env.RTP_STOP ?? 15);
const DAYS = Number(process.env.RTP_DAYS ?? 40);
const START_DATE = '2040-01-01';
const MINT_SPEND = 102; // 100 + 手数料2

const log = (m) => console.log(m);

async function seed(client) {
  await client.query(
    `insert into users (email)
     select 'rtp+' || lpad(g::text, 6, '0') || '@sim.dev' from generate_series(1, $1::int) g`,
    [USERS],
  );
  // 配置ツリー: 3分木(rnの親=floor(rn/3)・rn1が根)。紹介=配置(T1一致)。
  // 上位ノードほど組織が大きく(単価3.00)、末端の親は小さい(単価8.00)—
  // スターターレートの実分布が自然に生まれる。
  await client.query(
    `with sim as (
       select id, row_number() over (order by email) as rn
       from users where email like 'rtp+%'
     )
     update users u
     set placement_parent_user_id = p.id,
         direct_referrer_user_id = p.id
     from sim c
     join sim p on p.rn = greatest(1, c.rn / 3)
     where u.id = c.id and c.rn >= 2`,
  );
  await client.query(
    `insert into ledger_accounts (owner_type, owner_id, account_type, currency)
     select 'USER', u.id, t.acct::account_type, 'USDT'
     from users u cross join (values ('USER_AVAILABLE'), ('USER_LOCKED')) t(acct)
     where u.email like 'rtp+%' on conflict do nothing`,
  );
  for (let offset = 0; offset < USERS; offset += 5000) {
    await client.query('begin');
    await client.query(
      `with sim as (select id, row_number() over (order by email) rn from users where email like 'rtp+%'),
            chunk as (select id from sim where rn > $1 and rn <= $2)
       insert into ledger_transactions (transaction_type, idempotency_key)
       select 'BLOCKCHAIN_DEPOSIT_CONFIRMATION', 'rtp:dep:' || id from chunk`,
      [offset, offset + 5000],
    );
    await client.query(
      `with tx as (select t.id as tx_id, replace(t.idempotency_key, 'rtp:dep:', '')::uuid as user_id
                   from ledger_transactions t
                   where t.idempotency_key like 'rtp:dep:%'
                     and not exists (select 1 from ledger_entries e where e.transaction_id = t.id)),
            clearing as (select id from ledger_accounts where account_type = 'PLATFORM_DEPOSIT_CLEARING')
       insert into ledger_entries (transaction_id, account_id, direction, amount)
       select tx.tx_id, clearing.id, 'DEBIT'::entry_direction, 1000 from tx cross join clearing
       union all
       select tx.tx_id, a.id, 'CREDIT'::entry_direction, 1000
       from tx join ledger_accounts a on a.owner_id = tx.user_id and a.account_type = 'USER_AVAILABLE'`,
    );
    await client.query('commit');
  }
  const rows = await client.query(`select id from users where email like 'rtp+%' order by email`);
  return rows.rows.map((r) => r.id);
}

const client = await createTestDb();
const userIds = await seed(client);
log(`=== 運営RTPドリル(${USERS}人・3分木配置・${BUYERS}購入/日×${STOP}日→需要停止→${DAYS}日目まで実バッチ) ===`);

// 購入者をツリー全体に散らす(素数ストライドで巡回)
const STRIDE = 5779;
let failure = null;
for (let day = 0; day < DAYS; day += 1) {
  const date = addDays(START_DATE, day);
  if (day < STOP) {
    for (let i = 0; i < BUYERS; i += 1) {
      const idx = ((day * BUYERS + i) * STRIDE) % userIds.length;
      await createPurchaseSession(client, {
        userId: userIds[idx],
        idempotencyKey: `rtp:${day}:${i}`,
      });
    }
  }
  // 本番運用と同じ: PARTIAL_FAILED(リトライ可能ステップの失敗 — 例: 準備金の
  // 一時不足でPAY_DUE_BUYBACKSが停止)は同日リトライ→ダメなら翌日へ持ち越し
  // (payments.tsはdue_date<=当日を払うので後日のバッチが追い付く)。
  let result = await runBatch(client, { batchDate: date, handlers: buildProductionHandlers() });
  let retries = 0;
  while (result.status === 'PARTIAL_FAILED' && retries < 2) {
    retries += 1;
    result = await runBatch(client, { batchDate: date, handlers: buildProductionHandlers() });
  }
  if (day % 5 === 0 || result.status !== 'COMPLETED' || retries > 0) {
    log(`  d${String(day).padStart(2)} ${date} batch=${result.status}${retries ? ` (retries=${retries})` : ''}`);
  }
  if (result.status !== 'COMPLETED' && result.status !== 'PARTIAL_FAILED') {
    const failedSteps = await client.query(
      `select s.step_key, s.error_code
       from batch_steps s join batch_runs b on b.id = s.batch_run_id
       where b.batch_date = $1 and s.status = 'FAILED'`,
      [date],
    );
    for (const s of failedSteps.rows) {
      log(`  FAILED step=${s.step_key} code=${(s.error_code ?? '').slice(0, 500)}`);
    }
    failure = { day, date };
    break;
  }
  if (result.status === 'PARTIAL_FAILED') {
    const failedSteps = await client.query(
      `select s.step_key, s.error_code
       from batch_steps s join batch_runs b on b.id = s.batch_run_id
       where b.batch_date = $1 and s.status = 'FAILED'`,
      [date],
    );
    for (const s of failedSteps.rows) {
      log(`  CARRY-OVER step=${s.step_key} code=${(s.error_code ?? '').slice(0, 200)}`);
    }
  }
}
if (failure) {
  log(`*** バッチ失敗 day ${failure.day} — 計測中断`);
  process.exit(1);
}

// ---- 決算 ----
const endDate = addDays(START_DATE, DAYS);

const mintRows = await client.query(
  `select count(*)::text as c from ownership_assignments a
   where a.market_listing_id is null and a.status = 'SETTLED'`,
);
const mints = Number(mintRows.rows[0].c);

const p2pRows = await client.query(
  `select count(*)::text as c from ownership_assignments a
   where a.market_listing_id is not null and a.status = 'SETTLED'`,
);

const platform = await client.query(
  `select a.account_type::text as t,
          coalesce(sum(case e.direction when 'CREDIT' then e.amount else -e.amount end), 0)::text as bal
   from ledger_accounts a
   left join ledger_entries e on e.account_id = a.id
   where a.owner_type = 'PLATFORM'
     and a.account_type not in ('PLATFORM_DEPOSIT_CLEARING', 'PLATFORM_WITHDRAWAL_CLEARING')
   group by a.account_type order by a.account_type`,
);

const unpaidBuybacks = await client.query(
  `select count(*)::int as n, coalesce(sum(amount), 0)::text as v
   from buyback_schedule_payments where status <> 'PAID'`,
);
const pendingCelebs = await client.query(
  `select count(*)::int as n, coalesce(sum(amount), 0)::text as v
   from support_celebrations where status = 'PENDING'`,
);
const celebs = await client.query(
  `select status, tier, count(*)::int as n, coalesce(sum(amount), 0)::text as v
   from support_celebrations group by status, tier order by status, tier`,
);
const champions = await client.query(
  `select count(*)::int as n from horses where status in ('DAY7_CLEARED', 'MEMORIALIZED')`,
);
const burned = await client.query(`select count(*)::int as n from horses where status = 'BURNED'`);

const spend = mints * MINT_SPEND;
let platformTotal = Money.of('0');
log('');
log('--- プラットフォーム勘定(最終) ---');
for (const row of platform.rows) {
  platformTotal = platformTotal.add(Money.of(row.bal));
  log(`  ${row.t.padEnd(32)} ${Number(row.bal).toFixed(2).padStart(12)}`);
}
const liabilities = Money.of(unpaidBuybacks.rows[0].v).add(Money.of(pendingCelebs.rows[0].v));
const profit = platformTotal.sub(liabilities);

log('');
log('--- 祝い金(status×tier) ---');
let t1PaidCount = 0;
let t1PaidValue = Money.of('0');
for (const row of celebs.rows) {
  log(`  ${row.status.padEnd(10)} T${row.tier} n=${String(row.n).padStart(4)} 計=${Number(row.v).toFixed(2).padStart(10)}`);
  if (row.status === 'PAID' && row.tier === 1) {
    t1PaidCount = row.n;
    t1PaidValue = Money.of(row.v);
  }
}
// 092(T1=3固定)との差分: 実際に支払われたT1の(額−3.00)合計
const extraVs092 = t1PaidValue.sub(Money.of(String(t1PaidCount * 3)));

log('');
log('=== 決算 ===');
log(`ミント数            : ${mints}(総支払い ${spend.toFixed(2)} USDT)/ P2P成約 ${p2pRows.rows[0].c}件`);
log(`チャンピオン/BURN    : ${champions.rows[0].n} / ${burned.rows[0].n}(到達率 ${((champions.rows[0].n / mints) * 100).toFixed(1)}% — 買戻し損益分岐は46.8%)`);
log(`プラットフォーム純残高: ${platformTotal.toFixed8()}`);
log(`未清算債務          : 買戻し未払い ${unpaidBuybacks.rows[0].n}件 ${Number(unpaidBuybacks.rows[0].v).toFixed(2)} + 祝い金PENDING ${pendingCelebs.rows[0].n}件 ${Number(pendingCelebs.rows[0].v).toFixed(2)}`);
log(`運営利益(099適用)   : ${profit.toFixed8()} USDT = ミント総額の ${((Number(profit.toFixed8()) / spend) * 100).toFixed(2)}%`);
log(`(参考)092のままなら : ${(Number(profit.toFixed8()) + Number(extraVs092.toFixed8())).toFixed(2)} USDT = ${(((Number(profit.toFixed8()) + Number(extraVs092.toFixed8())) / spend) * 100).toFixed(2)}%(099による追加支払い ${extraVs092.toFixed8()} USDT)`);

// ---- アイテム収益オーバーレイ(フル収益モデル) ----
// 実測の馬×夜(出走延べ数)とBURN実数に、購買行動の仮定を3段階で重ねる。
// 台帳ルート(itemSettlement): その夜BURNした馬のアイテム代→サポート財源、
// 生き残った馬のアイテム代→運営収入(=ここが運営の上乗せ)。
const horseNights = Number(
  (await client.query(`select coalesce(sum(participant_count), 0)::text as n from races`)).rows[0].n,
);
const burnShare = burned.rows[0].n / Math.max(1, horseNights);
log('');
log(`--- フル収益モデル(アイテム行動の仮定オーバーレイ)---`);
log(`実測: 出走延べ ${horseNights}馬・夜 / うちBURN夜 ${(burnShare * 100).toFixed(1)}%`);
const SCENARIOS = [
  ['ライト(1割の馬が1 USDT/晩)', 0.1, 1.0],
  ['ミドル(3割の馬が2 USDT/晩)', 0.3, 2.0],
  ['ヘビー(6割の馬が3 USDT/晩)', 0.6, 3.0],
];
for (const [name, attach, spendPer] of SCENARIOS) {
  const itemGross = horseNights * attach * spendPer;
  const toOperating = itemGross * (1 - burnShare); // 生存夜分=運営収入
  const toPool = itemGross * burnShare; // BURN夜分=サポート財源(祝い金の追加原資)
  const totalSpend = spend + itemGross;
  const p099 = Number(profit.toFixed8()) + toOperating;
  const p092 = p099 + Number(extraVs092.toFixed8());
  log(
    `  ${name.padEnd(24)} アイテム売上 ${itemGross.toFixed(0).padStart(6)}(運営へ ${toOperating.toFixed(0)}/プールへ ${toPool.toFixed(0)}) | ` +
    `総支払い比 運営利益: 099 ${((p099 / totalSpend) * 100).toFixed(2)}% / 092 ${((p092 / totalSpend) * 100).toFixed(2)}%`,
  );
}
log('注: アイテムがレース結果に与える効果は無視(現行仕様では確率不変)。P2P手数料2%は');
log('    需要停止ドリルでは発生ゼロ — 通常運転時はさらに上乗せ。');
