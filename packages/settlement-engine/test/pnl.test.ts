import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  acquisitionCost,
  burnLossPnl,
  netProceeds,
  projectedPnl,
  realizedPnl,
} from '../src/economy/pnl.js';

/**
 * 施策E (FUN_V3): 利確フレーミング。
 * buy(取得実支出) / sell(手取り) を通知に添える処理の検証。
 * 損益・割合・符号色はクライアントが payload の数値から組み立てる。
 */

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

describe('pnl builders (pure)', () => {
  it('netProceeds は価格から 2% を控除する(売却成立と同式)', () => {
    // 177.16 → 手数料 2%(0.01×2) → 173.6168
    expect(netProceeds(Money.of('177.16')).toFixed8()).toBe('173.61680000');
  });

  it('realizedPnl: 手取り > 取得 は益、< 取得 は損', () => {
    const gain = realizedPnl({ cost: Money.of('102.00'), isMint: true }, Money.of('173.6168'));
    expect(gain.buy).toBe('102.00000000');
    expect(gain.sell).toBe('173.61680000');
    expect(gain.is_mint).toBe('1');
    expect(gain.projected).toBeUndefined();
    // 損失側(高値づかみ後に安く売れた等)も表現できる
    const loss = realizedPnl({ cost: Money.of('160.00'), isMint: false }, Money.of('120.00'));
    expect(loss.buy).toBe('160.00000000');
    expect(loss.sell).toBe('120.00000000');
    expect(loss.is_mint).toBeUndefined();
  });

  it('projectedPnl: 出品価格の手取り見込みを projected フラグ付きで持つ', () => {
    const p = projectedPnl({ cost: Money.of('146.41'), isMint: false }, Money.of('177.16'));
    expect(p.buy).toBe('146.41000000');
    expect(p.sell).toBe('173.61680000'); // netProceeds(177.16)
    expect(p.projected).toBe('1');
  });

  it('burnLossPnl: 全損(sell=0)。利益だけでなく損失も必ず出す', () => {
    const b = burnLossPnl({ cost: Money.of('102.00'), isMint: true });
    expect(b.buy).toBe('102.00000000');
    expect(b.sell).toBe('0');
    expect(b.is_mint).toBe('1');
  });
});

describe('acquisitionCost (DB)', () => {
  async function newUser(): Promise<string> {
    const r = await client.query<{ id: string }>(
      `insert into users (email) values ($1) returning id`,
      [`${randomUUID()}@test.dev`],
    );
    return r.rows[0]!.id;
  }
  async function newHorse(ownerId: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, 1, $2, 'BALANCED', 'COMMON', $3, 0, 'v1', $4, '{}') returning id`,
      [ownerId, `H ${randomUUID().slice(0, 12)}`, randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', '')],
    );
    return r.rows[0]!.id;
  }
  let batchDay = 0;
  async function newBatch(): Promise<string> {
    // (batch_date, slot) はユニーク制約。テスト毎に別日にして衝突を避ける。
    batchDay += 1;
    const day = String(batchDay).padStart(2, '0');
    const r = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
      [`2036-03-${day}`],
    );
    return r.rows[0]!.id;
  }
  // status='SETTLED' はトリガで ledger_transaction_id 必須。ダミーを1件用意する。
  async function settledAssignment(args: {
    horseId: string;
    buyerId: string;
    sellerId: string | null;
    assignedPrice: string;
  }): Promise<void> {
    const buyer = args.buyerId;
    const session = await client.query<{ id: string }>(
      `insert into purchase_sessions (user_id, locked_amount, idempotency_key)
       values ($1, $2, $3) returning id`,
      [buyer, args.assignedPrice, `sess:${randomUUID()}`],
    );
    const tx = await client.query<{ id: string }>(
      `insert into ledger_transactions (transaction_type, idempotency_key)
       values ($1, $2) returning id`,
      [args.sellerId === null ? 'DAY0_MINT_SETTLEMENT' : 'ASSIGNMENT_SETTLEMENT', `tx:${randomUUID()}`],
    );
    await client.query(
      `insert into ownership_assignments
         (batch_run_id, purchase_session_id, horse_id, buyer_user_id, seller_user_id,
          assigned_price, status, ledger_transaction_id)
       values ($1, $2, $3, $4, $5, $6, 'SETTLED', $7)`,
      [await newBatch(), session.rows[0]!.id, args.horseId, buyer, args.sellerId, args.assignedPrice, tx.rows[0]!.id],
    );
  }

  it('ミント(seller null)は実支出 102.00、P2P は支払額そのもの', async () => {
    const minter = await newUser();
    const mintHorse = await newHorse(minter);
    // ミント時 assigned_price は 100 だが、実支出は手数料込み 102
    await settledAssignment({ horseId: mintHorse, buyerId: minter, sellerId: null, assignedPrice: '100.00' });
    const mint = await acquisitionCost(client, mintHorse, minter);
    expect(mint?.isMint).toBe(true);
    expect(mint?.cost.toFixed8()).toBe('102.00000000');

    const seller = await newUser();
    const buyer = await newUser();
    const p2pHorse = await newHorse(buyer);
    await settledAssignment({ horseId: p2pHorse, buyerId: buyer, sellerId: seller, assignedPrice: '146.41' });
    const p2p = await acquisitionCost(client, p2pHorse, buyer);
    expect(p2p?.isMint).toBe(false);
    expect(p2p?.cost.toFixed8()).toBe('146.41000000');
  });

  it('再売買後は「その所有者が取得した」最新行を採用する', async () => {
    const a = await newUser();
    const b = await newUser();
    const horse = await newHorse(b);
    // a がミント取得 → 後に b が P2P で 160 で取得
    await settledAssignment({ horseId: horse, buyerId: a, sellerId: null, assignedPrice: '100.00' });
    await settledAssignment({ horseId: horse, buyerId: b, sellerId: a, assignedPrice: '160.00' });
    // b の取得原価は 160(a のミント 102 ではない)
    const cost = await acquisitionCost(client, horse, b);
    expect(cost?.cost.toFixed8()).toBe('160.00000000');
    // a 視点では依然ミント 102
    const aCost = await acquisitionCost(client, horse, a);
    expect(aCost?.cost.toFixed8()).toBe('102.00000000');
  });

  it('取得記録が無ければ null(損益行は出さない)', async () => {
    const u = await newUser();
    const h = await newHorse(u);
    expect(await acquisitionCost(client, h, u)).toBeNull();
  });
});
