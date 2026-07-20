/**
 * 価格連動バンド + 「1頭非売」指定の検証シム(2026-07-20・レビュー起点)
 *
 * 論点:
 *  A. P2P価格を総合値連動(階段±X%)にした場合、買戻し200 USDTの天井を割らないか。
 *     買い手のロック額(PURCHASE_LOCK_AMOUNT = Day6価格)はいくつになるか。
 *  C. オーナーが1頭を「非売」指定した場合、出品目標(listing_target_rate)の
 *     達成率はどう動くか。保有頭数 1/3/9/30 の各ケース。
 *  A+C 併用。
 *
 * 出品選定は**本番と同じ関数** `selectProfitTakingListings` を PGlite 上で実行する
 * (再実装ではない — 挙動のズレを持ち込まないため)。
 *
 * 実行: node packages/settlement-engine/scripts/price-band-liquidity-sim.mjs
 */
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { selectProfitTakingListings } from '@sevendays/economy-engine';
import {
  PRICE_TABLE_V1,
  PURCHASE_LOCK_AMOUNT,
  BUYBACK_TOTAL,
  LISTING_TARGET_RATE_V1,
  OWNER_LISTING_LIMIT_PER_BATCH,
  OWNER_LISTING_ABSOLUTE_LIMIT,
} from '@sevendays/domain';

const BUYBACK = Number(BUYBACK_TOTAL);
const RATE = Number(LISTING_TARGET_RATE_V1.NORMAL);

// ---------------------------------------------------------------------------
// A. 価格連動バンド — 200 USDT 天井の検証(純粋計算)
// ---------------------------------------------------------------------------
function priceBandAnalysis() {
  console.log('='.repeat(78));
  console.log('A. 価格連動バンド — 買戻し 200 USDT 天井の検証');
  console.log('='.repeat(78));
  console.log(`階段価格(現行): ${Object.entries(PRICE_TABLE_V1).map(([d, p]) => `D${d}=${p}`).join(' ')}`);
  console.log(`買戻し=${BUYBACK.toFixed(2)} / 現行ロック額=${PURCHASE_LOCK_AMOUNT}\n`);

  const day6 = Number(PRICE_TABLE_V1[6]);
  console.log('バンド幅ごとの Day6 上限価格(=最も高い取引価格):');
  console.log('  幅    Day6上限   200との差    必要ロック額   判定');
  for (const band of [0.05, 0.10, 0.125, 0.15, 0.20]) {
    const max = day6 * (1 + band);
    const margin = BUYBACK - max;
    const ok = margin > 0;
    console.log(
      `  ±${(band * 100).toFixed(1).padStart(4)}%  ${max.toFixed(2).padStart(8)}   ` +
      `${(margin >= 0 ? '+' : '') + margin.toFixed(2).padStart(7)}   ` +
      `${max.toFixed(2).padStart(10)}   ${ok ? 'OK' : '★天井超過 — 最後の買い手が構造的に損'}`,
    );
  }

  // 天井を割らない最大バンド
  const maxBand = BUYBACK / day6 - 1;
  console.log(`\n  → 200を1円も超えない理論上限: ±${(maxBand * 100).toFixed(2)}%(利益ゼロなので実用不可)`);

  // 実用: 最後の買い手に最低リターンrを残す
  console.log('\n  最後の買い手(Day6で買いDay7で200回収)に最低リターンを残す場合の上限バンド:');
  for (const r of [0.05, 0.08, 0.10, 0.15]) {
    const maxPrice = BUYBACK / (1 + r);
    const band = maxPrice / day6 - 1;
    console.log(
      `    最低+${(r * 100).toFixed(0).padStart(2)}%を保証 → Day6上限 ${maxPrice.toFixed(2)} = バンド ±${(band * 100).toFixed(2)}%`,
    );
  }

  // 各日の上限(±10%固定バンド時)
  console.log('\n  ±10%バンド時の各日価格レンジ(下限〜上限)と次日買戻し余地:');
  for (let d = 1; d <= 6; d++) {
    const p = Number(PRICE_TABLE_V1[d]);
    const lo = p * 0.9;
    const hi = p * 1.1;
    const next = d < 6 ? Number(PRICE_TABLE_V1[d + 1]) * 0.9 : BUYBACK;
    const worst = next - hi; // 上限で買って翌日下限で売る最悪ケース
    console.log(
      `    D${d}: ${lo.toFixed(2)}〜${hi.toFixed(2)}  ` +
      `(上限で買い翌日下限で売ると ${(worst >= 0 ? '+' : '') + worst.toFixed(2)})`,
    );
  }
  console.log('\n  ※「上限で買って翌日下限で売る」が負になる日は、育成しないと損をする日。');
  console.log('    これは設計意図(腕が要る)とも読めるが、初心者の体験を直撃するので要判断。');
}

// ---------------------------------------------------------------------------
// C. 出品目標の達成率 — 本番の selectProfitTakingListings を実行
// ---------------------------------------------------------------------------
async function seedPopulation(db, { owners, horsesPerOwner, reserveOne }) {
  await db.exec(`
    truncate table market_listings, user_trade_settings, horses, users cascade;
  `);
  const ownerIds = [];
  for (let o = 0; o < owners; o++) {
    const r = await db.query(`insert into users (email) values ($1) returning id`, [
      `sim-${o}-${randomUUID()}@sim.dev`,
    ]);
    const id = r.rows[0].id;
    ownerIds.push(id);
    await db.query(
      `insert into user_trade_settings (user_id, auto_list, auto_reserve) values ($1, true, false)`,
      [id],
    );
    // 「1頭非売」は horses に除外フラグを足す実装になる想定。選定クエリの母集団から
    // 1頭外れる点だけが効くので、ここでは母集団を N-1 頭にして等価に模す
    // (実際にはその1頭も存在し、レースは走り続ける)。
    const inPool = reserveOne ? horsesPerOwner - 1 : horsesPerOwner;
    for (let h = 0; h < inPool; h++) {
      // 「1頭非売」= その馬だけ auto_list 母集団から外す。実装案は horses 側の
      // フラグだが、選定クエリの母集団から外れる点は同じなので status で模す。
      const day = 1 + (h % 6); // Day1〜6に散らす(選定の適格レンジ)
      await db.query(
        `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                             horse_generation_version, mint_seed_hash, ability_json, total_value, current_day, status)
         values ($1, $2, 'BALANCED'::horse_type, 'COMMON', $3, 0.5, 'horse_generation_v1.0', $4,
                 '{}'::jsonb, 60, $5, 'ACTIVE')`,
        [
          id,
          `Sim ${o}-${h}-${randomUUID().slice(0, 8)}`,
          randomUUID().replaceAll('-', ''),
          randomUUID().replaceAll('-', ''),
          day,
        ],
      );
    }
  }
  return ownerIds;
}

async function runListingScenario(db, { owners, horsesPerOwner, reserveOne }) {
  await seedPopulation(db, { owners, horsesPerOwner, reserveOne });
  const res = await selectProfitTakingListings(db, {
    batchRunId: randomUUID(),
    economyStatus: 'NORMAL',
    liquidityPolicyVersion: 'liquidity_policy_v1.1',
    assignmentAlgorithmVersion: 'assignment_algorithm_v1.0',
  });
  const perOwner = new Map();
  for (const s of res.selected) perOwner.set(s.ownerUserId, (perOwner.get(s.ownerUserId) ?? 0) + 1);
  return {
    ...res,
    selectedCount: res.selected.length,
    achievement: res.targetCount === 0 ? 1 : res.selected.length / res.targetCount,
    maxPerOwner: Math.max(0, ...perOwner.values()),
  };
}

async function liquidityAnalysis() {
  console.log('\n' + '='.repeat(78));
  console.log('C. 「1頭非売」指定 — 出品目標の達成率(本番の選定関数を実行)');
  console.log('='.repeat(78));
  console.log(
    `出品率=${(RATE * 100).toFixed(0)}%(NORMAL) / オーナー上限=${OWNER_LISTING_LIMIT_PER_BATCH}頭` +
    `(緩和後 ${OWNER_LISTING_ABSOLUTE_LIMIT}頭)\n`,
  );

  const db = await createTestDb();
  // status enum に模擬用の値は無いので、非売は「母集団から除外」で表現する。
  // → RESERVED_SIM ではなく BURNED を使う(status='ACTIVE' 条件から外れれば同じ)。
  const OWNERS = 20;
  console.log(`  オーナー${OWNERS}人 × 保有N頭。適格=Day1〜6・auto_list=true\n`);
  console.log('   保有N   非売    適格数   目標数   実出品   達成率   1人最大');

  const rows = [];
  for (const n of [1, 3, 9, 30]) {
    for (const reserveOne of [false, true]) {
      if (reserveOne && n === 1) continue; // 1頭しか持たない人が非売にすると出品ゼロ(自明)
      const r = await runListingScenario(db, {
        owners: OWNERS,
        horsesPerOwner: n,
        reserveOne,
      });
      rows.push({ n, reserveOne, ...r });
      console.log(
        `   ${String(n).padStart(5)}   ${(reserveOne ? 'あり' : 'なし').padEnd(4)}  ` +
        `${String(r.eligibleCount).padStart(7)}  ${String(r.targetCount).padStart(7)}  ` +
        `${String(r.selectedCount).padStart(7)}  ${(r.achievement * 100).toFixed(1).padStart(6)}%  ` +
        `${String(r.maxPerOwner).padStart(6)}`,
      );
    }
  }

  console.log('\n  構造的な上限(計算):');
  console.log('    目標 = 適格数 × 30% だが、1オーナーは最大2頭までしか出品されない。');
  console.log('    → 全員がN頭持つ場合、達成には 0.30 × N ≤ 2、すなわち N ≤ 6.67 が必要。');
  for (const n of [1, 3, 9, 30]) {
    const need = RATE * n;
    console.log(
      `      N=${String(n).padStart(2)}: 1人あたり必要 ${need.toFixed(1)}頭 vs 上限2頭 → ` +
      `${need <= OWNER_LISTING_ABSOLUTE_LIMIT ? '達成可能' : '★構造的に未達(上限が律速)'}`,
    );
  }
  return rows;
}

// ---------------------------------------------------------------------------
async function main() {
  priceBandAnalysis();
  const rows = await liquidityAnalysis();

  console.log('\n' + '='.repeat(78));
  console.log('A+C 併用の結論');
  console.log('='.repeat(78));
  const n9 = rows.find((r) => r.n === 9 && !r.reserveOne);
  const n9c = rows.find((r) => r.n === 9 && r.reserveOne);
  if (n9 && n9c) {
    console.log(
      `  実テスター相当(保有9頭): 非売なし ${n9.selectedCount}/${n9.targetCount}頭 ` +
      `(${(n9.achievement * 100).toFixed(1)}%) → 非売あり ${n9c.selectedCount}/${n9c.targetCount}頭 ` +
      `(${(n9c.achievement * 100).toFixed(1)}%)`,
    );
    console.log(
      `  実出品数の変化: ${n9.selectedCount} → ${n9c.selectedCount} 頭 ` +
      `(${n9c.selectedCount === n9.selectedCount ? '変化なし' : `${n9c.selectedCount - n9.selectedCount}頭`})`,
    );
  }
  console.log('\n  価格バンドは出品「数」には影響しない(選定は current_day 順で価格を見ない)。');
  console.log('  影響するのは買い手のロック額と、成約時の資金移動額のみ。');
  process.exit(0);
}

main().catch((e) => {
  console.error('SIM FAILED:', e);
  process.exit(1);
});
