import { date, index, integer, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, bps, createdAt, tstz, updatedAt } from '@intafaced/db';

/**
 * svc-bank — MULTI-CURRENCY ACCOUNTS OVER THE LEDGER (§8.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS NOT IN THIS FILE, AND WILL NEVER BE: A BALANCE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * §8.1: "Multi-currency account UX over existing ledger accounts (no new
 * balance system — views + rails)." Doctrine §0.6: "No module holds its own
 * balance."
 *
 * Every table here stores one of exactly three things:
 *
 *   1. A NAME AND A POLICY — what the user calls a pot of money, and the rules
 *      they attached to it. `spaces` is a label over a ledger account; it holds
 *      no value and cannot hold value.
 *   2. AN INSTRUCTION — "move 200 USDT on the 1st of every month". Amounts on
 *      instructions are immutable after insert: they are what the user asked
 *      for, not what anything currently holds.
 *   3. A RECORD OF SOMETHING THAT ALREADY HAPPENED — one row per (schedule,
 *      occurrence) or per (pool, day), written once, never updated in place with
 *      a new figure. These exist to make a job idempotent and auditable, not to
 *      answer "how much".
 *
 * "How much" is always `ledger.balance(...)`. There is exactly one answer, and
 * it is not in this schema. `bank-service.test.ts` introspects
 * `information_schema.columns` and fails the build on any column that looks
 * like a running total, so this comment is enforced rather than aspirational.
 *
 * The one column that is money-shaped and mutable — there is none — would need
 * the narrow exception svc-token's README describes (a cache with a documented
 * reconciliation job). svc-bank does not take it. A cache of a number the
 * ledger already returns in one indexed read buys nothing and costs a second
 * source of truth.
 */
export const bank = pgSchema('bank');

/**
 * A user's PRIMARY space in an asset is their `userAvailable` ledger account
 * itself — the main balance, given a name. Every other space is a `subaccount`
 * available account, which is an account kind the ledger already has (§4.2
 * `owner_type` includes `subaccount`); svc-bank invents nothing.
 *
 * The distinction is load-bearing: it is why "the primary space's balance equals
 * the user's ledger balance" is true by construction rather than by a job.
 */
export const spaceKindEnum = bank.enum('space_kind', ['primary', 'named']);

/** §8.1 rails. Cadence is closed because the occurrence index must be derivable. */
export const transferCadenceEnum = bank.enum('transfer_cadence', ['daily', 'weekly', 'monthly']);

export const scheduleStatusEnum = bank.enum('schedule_status', ['active', 'paused', 'cancelled', 'completed']);

/**
 * `pending` is a claim, not a state anyone should stay in: the job inserts the
 * row before it posts to the ledger, so a crash between the two leaves a
 * `pending` row that the next run re-drives (the ledger post is idempotent, so
 * re-driving either finds the original transaction or makes it).
 */
export const executionStatusEnum = bank.enum('execution_status', ['pending', 'settled', 'rejected']);

export const poolKindEnum = bank.enum('pool_kind', ['flexible', 'fixed']);
export const poolStatusEnum = bank.enum('pool_status', ['open', 'closed']);
export const positionStatusEnum = bank.enum('position_status', ['pending', 'active', 'closed']);

/**
 * A SPACE — a name and a policy over a ledger account (§8.1).
 *
 * Not a wallet. Not a balance. The row tells you what the user calls this pot
 * and what rules they set on it; `ledger.balance(accountFor(space))` tells you
 * what is in it, and is the only thing that ever does.
 */
export const spaces = bank.table(
  'spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    /** Which asset this space is denominated in. Multi-currency = many rows. */
    assetId: text('asset_id').notNull(),
    kind: spaceKindEnum('kind').notNull().default('named'),
    /** The user's label. The entire product surface of this table. */
    name: text('name').notNull(),
    /**
     * A savings TARGET the user set — "I want 5000 USDT in here". It is an
     * aspiration, never a holding: it is written when the user sets it and read
     * only to render a progress bar against the LEDGER balance. Nothing in this
     * service ever adds to it.
     */
    goalTarget: amount('goal_target'),
    /**
     * A self-imposed lock date. Policy, enforced by this service on transfers
     * OUT — the ledger has no opinion about it, which is correct: a user
     * locking themselves out of their own money is a product rule, not a
     * property of the book.
     */
    lockedUntil: tstz('locked_until'),
    archivedAt: tstz('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** The list-my-spaces read path. */
    index('spaces_user_asset_idx').on(t.userId, t.assetId),
    /** One space name per user per asset — the label is how a human refers to it. */
    uniqueIndex('spaces_user_asset_name_idx').on(t.userId, t.assetId, t.name),
  ],
);

/**
 * A STANDING ORDER (§8.1 rails).
 *
 * `amount` here is the instruction — "move this much" — and never changes after
 * insert. Editing a standing order cancels it and writes a new one, so the
 * history of what a user actually authorised survives.
 */
export const scheduledTransfers = bank.table(
  'scheduled_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    assetId: text('asset_id').notNull(),
    fromSpaceId: uuid('from_space_id')
      .notNull()
      .references(() => spaces.id),
    toSpaceId: uuid('to_space_id')
      .notNull()
      .references(() => spaces.id),
    amount: amount('amount').notNull(),
    cadence: transferCadenceEnum('cadence').notNull(),
    /**
     * The anchor. Occurrence N is N periods after this instant, which is what
     * makes the idempotency key `bank.transfer:<id>:<occurrence>` derivable
     * from the schedule alone rather than from a counter that can be lost or
     * double-incremented.
     */
    startsAt: tstz('starts_at').notNull(),
    /** NULL = runs until cancelled. */
    endsAt: tstz('ends_at'),
    /** Scheduling index only — the truth of "did occurrence N fire" is the execution row. */
    nextRunAt: tstz('next_run_at').notNull(),
    status: scheduleStatusEnum('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** The job's query: what is due. */
    index('scheduled_transfers_due_idx').on(t.status, t.nextRunAt),
    index('scheduled_transfers_user_idx').on(t.userId),
  ],
);

/**
 * ONE FIRING OF ONE STANDING ORDER — the idempotency ledger of the scheduler.
 *
 * `unique(schedule_id, occurrence)` is what makes "a job that runs twice
 * transfers once" a property of the database rather than a hope about timers.
 * The ledger's own idempotency key is the second line of defence; this is the
 * first, and it also gives the user a reason when a transfer did not happen.
 *
 * `amount` records what was actually moved on this occurrence. It is written
 * once, alongside the ledger transaction id, and never revised.
 */
export const transferExecutions = bank.table(
  'transfer_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => scheduledTransfers.id),
    /** Periods since `starts_at`. Deterministic, so the key is reproducible. */
    occurrence: integer('occurrence').notNull(),
    amount: amount('amount').notNull(),
    status: executionStatusEnum('status').notNull().default('pending'),
    /** svc-ledger's transaction id — the join back to the book. */
    ledgerTxId: text('ledger_tx_id'),
    /** Why a firing was rejected, e.g. 'ledger.insufficient_funds'. */
    rejectionCode: text('rejection_code'),
    attemptedAt: tstz('attempted_at').notNull().defaultNow(),
    settledAt: tstz('settled_at'),
  },
  (t) => [
    /** THE double-fire guard. See the migration's comment. */
    uniqueIndex('transfer_executions_occurrence_idx').on(t.scheduleId, t.occurrence),
    index('transfer_executions_status_idx').on(t.status),
  ],
);

/**
 * AN EARN POOL (§8.1) — flexible or fixed-term, per asset.
 *
 * Deliberately absent: `total_deposited`, `subscribed`, `capacity_used`, or any
 * other figure that would drift. A pool's size is the sum of the ledger `stake`
 * accounts of its open positions, and `earnService.poolSize()` computes it that
 * way every time it is asked.
 */
export const earnPools = bank.table(
  'earn_pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: text('asset_id').notNull(),
    kind: poolKindEnum('kind').notNull(),
    name: text('name').notNull(),
    /** Advertised annual rate. Policy — the accrual job reads it, nothing writes it back. */
    aprBps: bps('apr_bps').notNull(),
    /** NULL for flexible pools; the lock length for fixed ones. */
    termDays: integer('term_days'),
    /** Policy floor on a single deposit. A limit, not a holding. */
    minDeposit: amount('min_deposit').notNull().default('0'),
    status: poolStatusEnum('status').notNull().default('open'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('earn_pools_asset_status_idx').on(t.assetId, t.status)],
);

/**
 * ONE USER'S POSITION IN ONE POOL.
 *
 * `principal` is the amount deposited at open, recorded once — the same shape
 * and the same reason as svc-token's `stakes.amount`. Interest never touches
 * it: yield is paid to the user's available balance, so there is no compounding
 * write that could turn this column into a running total by accident.
 *
 * The value itself sits in `userStake(userId, assetId)` in the ledger, which is
 * shared with svc-token's native staking — which is exactly why svc-bank
 * refuses the native asset in earn pools (see `earn-service.ts`).
 */
export const earnPositions = bank.table(
  'earn_positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => earnPools.id),
    userId: text('user_id').notNull(),
    assetId: text('asset_id').notNull(),
    principal: amount('principal').notNull(),
    openedAt: tstz('opened_at').notNull().defaultNow(),
    /** NULL for flexible. Withdrawal before this is refused on fixed pools. */
    maturesAt: tstz('matures_at'),
    status: positionStatusEnum('status').notNull().default('active'),
    closedAt: tstz('closed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    /** The accrual job sweeps a pool's open positions. */
    index('earn_positions_pool_status_idx').on(t.poolId, t.status),
    index('earn_positions_user_status_idx').on(t.userId, t.status),
  ],
);

/**
 * ONE DAY OF INTEREST FOR ONE POOL — written once, per (pool, date).
 *
 * The unique index is the daily double-fire guard, mirroring
 * `transfer_executions`. `paid_amount` is the audit record of that single day,
 * not a cumulative figure: summing this table gives lifetime interest, and that
 * sum must equal what the ledger paid out of the pool reserve. Two answers,
 * comparable — which is the whole point of not keeping a total.
 */
export const interestAccruals = bank.table(
  'interest_accruals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => earnPools.id),
    /** The accrual day. `date`, not a timestamp — a day is the unit of truth here. */
    accrualDate: date('accrual_date').notNull(),
    /** The rate actually applied, snapshotted so a later APR change cannot rewrite history. */
    rateBps: bps('rate_bps').notNull(),
    paidAmount: amount('paid_amount').notNull(),
    recipients: integer('recipients').notNull().default(0),
    ledgerTxId: text('ledger_tx_id'),
    createdAt: createdAt(),
  },
  (t) => [
    /** ONE ACCRUAL PER POOL PER DAY, forever. */
    uniqueIndex('interest_accruals_pool_date_idx').on(t.poolId, t.accrualDate),
    index('interest_accruals_date_idx').on(t.accrualDate),
  ],
);

export const schema = {
  spaces,
  scheduledTransfers,
  transferExecutions,
  earnPools,
  earnPositions,
  interestAccruals,
};
