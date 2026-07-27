import { bigserial, boolean, index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, createdAt, tstz } from '@intafaced/db';

/**
 * THE BALANCE GRAPH (§4.2).
 *
 * This service's schema, and only this service's schema. Nothing else in the OS
 * reads these tables — Doctrine §0.6 and the per-service Postgres roles both
 * enforce it.
 */
export const ledger = pgSchema('ledger');

export const ownerTypeEnum = ledger.enum('owner_type', ['user', 'subaccount', 'module', 'house', 'treasury']);
export const accountKindEnum = ledger.enum('account_kind', ['available', 'hold', 'escrow', 'stake', 'collateral']);
export const assetKindEnum = ledger.enum('asset_kind', ['crypto', 'fiat', 'native']);
export const directionEnum = ledger.enum('direction', ['debit', 'credit']);

export const assets = ledger.table('assets', {
  id: text('id').primaryKey(),
  kind: assetKindEnum('kind').notNull(),
  decimals: integer('decimals').notNull().default(18),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const accounts = ledger.table(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerType: ownerTypeEnum('owner_type').notNull(),
    ownerId: text('owner_id').notNull(),
    assetId: text('asset_id').notNull(),
    kind: accountKindEnum('kind').notNull(),
    /**
     * DENORMALISED running balance.
     *
     * The authoritative record is `ledger_entries`; this column is a cache so a
     * balance read is O(1) instead of a full scan. It is written only inside the
     * same serializable transaction that writes the entries, and the
     * reconciliation job (src/ledger/reconcile.ts) replays every entry and
     * compares — any divergence pages the operator and freezes the module.
     *
     * This is the one denormalisation the doctrine permits, and only because it
     * comes with that job.
     */
    balance: amount('balance').notNull().default('0'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('accounts_identity_idx').on(t.ownerType, t.ownerId, t.assetId, t.kind),
    index('accounts_owner_idx').on(t.ownerType, t.ownerId),
  ],
);

export const ledgerTx = ledger.table(
  'ledger_tx',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Commit order. The hash chain follows this sequence exactly. */
    seq: bigserial('seq', { mode: 'bigint' }).notNull(),
    /** Retry protection. A repeated key returns the original transaction. */
    idempotencyKey: text('idempotency_key').notNull(),
    module: text('module').notNull(),
    reason: text('reason').notNull(),
    meta: jsonb('meta').notNull().default({}),
    postedAt: timestamp('posted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    /** Hex-encoded SHA-256 of (previousHash ‖ canonical form). Tamper-evident. */
    hash: text('hash').notNull(),
    previousHash: text('previous_hash'),
  },
  (t) => [
    uniqueIndex('ledger_tx_idempotency_idx').on(t.idempotencyKey),
    index('ledger_tx_seq_idx').on(t.seq),
    index('ledger_tx_module_idx').on(t.module, t.postedAt),
  ],
);

export const ledgerEntries = ledger.table(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    txId: uuid('tx_id')
      .notNull()
      .references(() => ledgerTx.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    assetId: text('asset_id').notNull(),
    direction: directionEnum('direction').notNull(),
    amount: amount('amount').notNull(),
    /** Account balance immediately after this entry — the audit trail. */
    balanceAfter: amount('balance_after').notNull(),
  },
  (t) => [index('ledger_entries_tx_idx').on(t.txId), index('ledger_entries_account_idx').on(t.accountId, t.id)],
);

export const balanceSnapshots = ledger.table(
  'balance_snapshots',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    asOf: tstz('as_of').notNull(),
    balance: amount('balance').notNull(),
    /** Last entry included — where a replay check starts from. */
    throughEntryId: text('through_entry_id'),
  },
  (t) => [index('balance_snapshots_account_idx').on(t.accountId, t.asOf)],
);

/**
 * Single-row table holding the tip of the hash chain.
 *
 * Every post takes `FOR UPDATE` on this row, which is what makes the chain a
 * chain: transactions commit in a total order and each links to exactly one
 * predecessor. It also caps write throughput at one post at a time — an
 * accepted trade-off at soft-launch volume, and the §13 socket for sharding it
 * (per-asset chains with a periodic cross-chain anchor) is noted in the README.
 */
export const chainTip = ledger.table('chain_tip', {
  id: boolean('id').primaryKey().default(true),
  hash: text('hash'),
  seq: bigserial('seq', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * Single-row table holding the posting freeze — the platform kill-switch.
 *
 * Durable rather than a field on LedgerService, because the freeze outranks the
 * process that set it: a restart must not resume posting on a book that
 * reconciliation halted, and a second replica must not keep writing to it.
 *
 * Read inside the same `FOR UPDATE` on `chain_tip` that every post already
 * takes (see postgres-ledger.ts) — so the check costs no extra round trip and,
 * more importantly, cannot be raced by a post already in flight.
 */
export const postingFreeze = ledger.table('posting_freeze', {
  id: boolean('id').primaryKey().default(true),
  frozen: boolean('frozen').notNull().default(false),
  /** What a human reads at 3am to decide whether the halt can be lifted. */
  reason: text('reason'),
  /** Operator principal id, 'reconciliation', or 'env:LEDGER_POSTING_ENABLED'. */
  actor: text('actor'),
  changedAt: timestamp('changed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const schema = { assets, accounts, ledgerTx, ledgerEntries, balanceSnapshots, chainTip, postingFreeze };
