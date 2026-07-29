import { boolean, date, index, integer, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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

// ── CARDS (§8.1, §18) ───────────────────────────────────────────────────────
//
// Same rule as everything above: no balance, no running total. A card's spend
// against its daily and monthly caps is a SUM over `card_authorizations` in the
// window, computed when it is asked. A `cards.spent_today` column would be a
// second source of truth for money and would drift the first time a reversal
// posted without decrementing it.

/** §18: the funding design is what makes a low-verification tier lawful, or not. */
export const cardFundingSourceEnum = bank.enum('card_funding_source', ['ledger', 'self_custody']);

export const cardProgrammeStatusEnum = bank.enum('card_programme_status', ['draft', 'live', 'suspended']);

export const cardStatusEnum = bank.enum('card_status', ['active', 'frozen', 'closed']);
export const cardFormEnum = bank.enum('card_form', ['virtual', 'physical']);
export const cardChannelEnum = bank.enum('card_channel', ['pos', 'online', 'atm']);

/**
 * `approved` is a promise we have made to a scheme and cannot retract. The
 * other three are what became of it. There is no `pending`: an authorisation
 * that has not been decided does not exist, because the decision and the row
 * are written in the same breath as the ledger hold.
 */
export const cardAuthorizationStatusEnum = bank.enum('card_authorization_status', ['approved', 'declined', 'captured', 'reversed']);

/**
 * AN ISSUER'S PROGRAMME, in one region, at one verification tier (§18).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS TABLE EXISTS BECAUSE WE DO NOT SET THESE NUMBERS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A card is issued by a licensed institution under their programme, and the
 * verification floor and the limits are theirs. `docs/decisions/kyc-posture.md`
 * (owner-directed): "the tier thresholds are an issuer negotiation, not an
 * engineering decision… a configured parameter, not a constant, because the
 * first issuer will change them and the second will disagree with the first."
 *
 * So they are rows. Every numeric column here is a POLICY LIMIT — the ceiling
 * an issuer has agreed to — and none of them ever changes as a result of
 * somebody spending.
 *
 * `reviewed_by` / `reviewed_at` mirror `assertReviewed()` on the jurisdiction
 * matrix, and the CHECK constraint below is the same rule: a programme cannot
 * be `live` without a human name and a date against it.
 */
export const cardProgrammes = bank.table(
  'card_programmes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Operator-facing label — 'sovereign', 'verified'. Never a magic value in code. */
    code: text('code').notNull(),
    /** The `CardIssuerAdapter.id` that runs it — and the ledger boundary account. */
    issuerId: text('issuer_id').notNull(),
    /** The issuer's own identifier for the programme, passed back to them on issue. */
    programmeRef: text('programme_ref').notNull(),
    /** ISO-3166 alpha-2, or '*' for the issuer's default. */
    region: text('region').notNull().default('*'),
    assetId: text('asset_id').notNull(),
    fundingSource: cardFundingSourceEnum('funding_source').notNull(),
    /** The verification floor THE ISSUER requires. Never below what the matrix demands. */
    requiredTier: text('required_tier').notNull(),
    /** POLICY LIMIT: the largest single transaction the issuer will authorise. */
    perAuthorizationLimit: amount('per_authorization_limit').notNull(),
    /** POLICY LIMIT: the daily ceiling. */
    dailyLimit: amount('daily_limit').notNull(),
    /** POLICY LIMIT: the monthly ceiling. */
    monthlyLimit: amount('monthly_limit').notNull(),
    atmEnabled: boolean('atm_enabled').notNull().default(false),
    onlineEnabled: boolean('online_enabled').notNull().default(true),
    crossBorderEnabled: boolean('cross_border_enabled').notNull().default(false),
    /** §18 cashback in IFC. The RATE; the payment is `rewardPay`. */
    cashbackBps: bps('cashback_bps').notNull().default('0'),
    status: cardProgrammeStatusEnum('status').notNull().default('draft'),
    /** Counsel sign-off. Without both, the programme cannot go live. */
    reviewedBy: text('reviewed_by'),
    reviewedAt: tstz('reviewed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** One programme per issuer, code and region. */
    uniqueIndex('card_programmes_issuer_code_region_idx').on(t.issuerId, t.code, t.region),
    index('card_programmes_status_idx').on(t.status, t.region),
  ],
);

/**
 * ONE CARD.
 *
 * A name and a pointer, like every other row in this service. It holds no
 * balance: the money behind a `ledger`-funded card is the user's ordinary
 * available balance, and behind a `self_custody` one it is in their smart
 * account and this service never sees it.
 *
 * There is no column here a PAN, CVV or expiry could be written to, and that is
 * deliberate — it is what keeps svc-bank out of PCI scope. `last_four` is
 * display data the issuer hands back.
 */
export const cards = bank.table(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    programmeId: uuid('programme_id')
      .notNull()
      .references(() => cardProgrammes.id),
    assetId: text('asset_id').notNull(),
    form: cardFormEnum('form').notNull().default('virtual'),
    /** The issuer's reference. Stable for the card's whole life. */
    issuerCardRef: text('issuer_card_ref').notNull(),
    /** Display only. Four digits from the issuer — never a PAN. */
    lastFour: text('last_four'),
    status: cardStatusEnum('status').notNull().default('active'),
    /**
     * §18 self-custody funding: the smart account the JIT settlement would pull
     * from. Recorded so the card is honest about where its money lives even
     * while the settlement leg is unbuilt. Never a key, never a signer.
     */
    fundingAccountRef: text('funding_account_ref'),
    atmEnabled: boolean('atm_enabled').notNull().default(false),
    onlineEnabled: boolean('online_enabled').notNull().default(true),
    crossBorderEnabled: boolean('cross_border_enabled').notNull().default(false),
    frozenAt: tstz('frozen_at'),
    closedAt: tstz('closed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('cards_user_idx').on(t.userId, t.status),
    /** The webhook's lookup: an issuer event names a card by THEIR reference. */
    uniqueIndex('cards_issuer_ref_idx').on(t.issuerCardRef),
  ],
);

/**
 * ONE AUTHORISATION — a RECORD of something that already happened.
 *
 * Written once when the decision is made, updated only to move `status` along
 * its one-way path (`approved` → `captured` | `reversed`). The money columns are
 * never revised: `amount` is what we approved and `captured_amount` is what the
 * scheme actually took, and keeping both is what makes a partial capture
 * auditable instead of a mystery.
 *
 * Summing this table over a window is how a card's daily and monthly spend are
 * computed. That is the reason there is no total column anywhere near it.
 */
export const cardAuthorizations = bank.table(
  'card_authorizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    userId: text('user_id').notNull(),
    assetId: text('asset_id').notNull(),
    /** The issuer's authorisation reference — how a later capture finds this row. */
    issuerAuthRef: text('issuer_auth_ref').notNull(),
    /** What we APPROVED. Immutable after insert. */
    amount: amount('amount').notNull(),
    /** What the scheme actually took. Written once, at capture. */
    capturedAmount: amount('captured_amount'),
    channel: cardChannelEnum('channel').notNull(),
    crossBorder: boolean('cross_border').notNull().default(false),
    merchantName: text('merchant_name'),
    merchantCategoryCode: text('merchant_category_code'),
    status: cardAuthorizationStatusEnum('status').notNull(),
    /** The `AuthorizationCode` — why, in a form a dashboard can group by. */
    decisionCode: text('decision_code').notNull(),
    /** svc-ledger's transaction id for the hold. The join back to the book. */
    holdLedgerTxId: text('hold_ledger_tx_id'),
    captureLedgerTxId: text('capture_ledger_tx_id'),
    occurredAt: tstz('occurred_at').notNull().defaultNow(),
    settledAt: tstz('settled_at'),
    createdAt: createdAt(),
  },
  (t) => [
    /**
     * THE DOUBLE-AUTHORISE GUARD. A scheme redelivers; an issuer retries. One
     * authorisation reference is one authorisation, whatever arrives twice.
     */
    uniqueIndex('card_authorizations_issuer_ref_idx').on(t.issuerAuthRef),
    /** The window query: this card's approved spend since a given instant. */
    index('card_authorizations_card_window_idx').on(t.cardId, t.status, t.occurredAt),
  ],
);

export const schema = {
  spaces,
  scheduledTransfers,
  transferExecutions,
  earnPools,
  earnPositions,
  interestAccruals,
  cardProgrammes,
  cards,
  cardAuthorizations,
};
