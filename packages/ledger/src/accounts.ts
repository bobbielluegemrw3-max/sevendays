import type { AccountType } from '@sevendays/domain';
import { LedgerError, type SqlClient } from './types.js';

export interface UserAccounts {
  available: string;
  locked: string;
}

/** Create USER_AVAILABLE / USER_LOCKED accounts for a user if missing. */
export async function ensureUserAccounts(client: SqlClient, userId: string): Promise<UserAccounts> {
  await client.query(
    `insert into ledger_accounts (owner_type, owner_id, account_type)
     values ('USER', $1, 'USER_AVAILABLE'), ('USER', $1, 'USER_LOCKED')
     on conflict (owner_id, account_type, currency) where owner_type = 'USER'
     do nothing`,
    [userId],
  );
  const available = await getUserAccountId(client, userId, 'USER_AVAILABLE');
  const locked = await getUserAccountId(client, userId, 'USER_LOCKED');
  return { available, locked };
}

export async function getUserAccountId(
  client: SqlClient,
  userId: string,
  accountType: 'USER_AVAILABLE' | 'USER_LOCKED',
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `select id from ledger_accounts
     where owner_type = 'USER' and owner_id = $1 and account_type = $2::account_type`,
    [userId, accountType],
  );
  const row = r.rows[0];
  if (!row) {
    throw new LedgerError('ACCOUNT_NOT_FOUND', `No ${accountType} account for user ${userId}`);
  }
  return row.id;
}

export async function getPlatformAccountId(
  client: SqlClient,
  accountType: AccountType,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `select id from ledger_accounts
     where owner_type = 'PLATFORM' and account_type = $1::account_type`,
    [accountType],
  );
  const row = r.rows[0];
  if (!row) {
    throw new LedgerError('ACCOUNT_NOT_FOUND', `No platform account ${accountType}`);
  }
  return row.id;
}

/** Balance from the derived cache (kept by DB trigger). '0' when untouched. */
export async function getBalance(client: SqlClient, accountId: string): Promise<string> {
  const r = await client.query<{ balance: string }>(
    `select balance::text as balance from ledger_account_balances where account_id = $1`,
    [accountId],
  );
  return r.rows[0]?.balance ?? '0';
}

/** Independent balance derivation from entries (reconciliation source of truth). */
export async function computeBalanceFromEntries(
  client: SqlClient,
  accountId: string,
): Promise<string> {
  const r = await client.query<{ balance: string }>(
    `select coalesce(
       sum(case direction when 'CREDIT' then amount else -amount end), 0
     )::text as balance
     from ledger_entries where account_id = $1`,
    [accountId],
  );
  return r.rows[0]?.balance ?? '0';
}
