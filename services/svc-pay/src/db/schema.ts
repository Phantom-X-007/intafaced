import { bigserial, boolean, index, integer, jsonb, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, createdAt, tstz, updatedAt } from '@intafaced/db';

/**
 * THE PAYMENTS CORE (§6.1).
 *
 * THIS SERVICE'S SCHEMA ONLY. svc-pay never reads another service's tables and
 * nothing reads these except svc-pay — the per-service Postgres role enforces
 * it, not just the convention (§2).
 *
 * No balances live here. A payment row records what was *agreed*; the value
 * itself sits in the ledger, in `pay:clearing:<merchantId>` until settlement and
 * in the merchant's own available balance afterwards (Doctrine §0.6). Notice
 * what is therefore absent: there is no `captured_amount` and no
 * `refunded_amount` column. Both are derived from `payment_events`, which is the
 * append-only truth — a running total in a row is a second source of truth for
 * money, and the two would eventually disagree.
 */
export const pay = pgSchema('pay');

/** §6.1: three modes, one core. This PR builds `gateway`; the others are separate features. */
export const merchantModeEnum = pay.enum('merchant_mode', ['gateway', 'psp', 'payfac']);

/**
 * §22/§7: KYB follows custody. A gateway merchant settling into a ledger
 * account is on the Fiat Plane, so verification exists and is tiered.
 */
export const kybStatusEnum = pay.enum('kyb_status', ['none', 'pending', 'approved', 'rejected']);

export const merchantStatusEnum = pay.enum('merchant_status', ['pending', 'active', 'suspended', 'closed']);

/**
 * The payment lifecycle (§6.1), verbatim.
 *
 * `disputed` is declared but unreachable in this PR — chargebacks are their own
 * tracker feature. It is in the enum because the enum is the spec's, and adding
 * a value later is a migration against a live payments table.
 */
export const paymentStatusEnum = pay.enum('payment_status', [
  'created',
  'authorized',
  'captured',
  'settled',
  'refunded',
  'disputed',
  'failed',
]);

/**
 * `pending` — the payment set is frozen and the amounts are computed, but no
 * ledger transaction has been posted yet. It is the crash-resumable middle of
 * settlement, and it is a real state rather than an implementation detail.
 */
export const settlementStatusEnum = pay.enum('settlement_status', ['pending', 'posted', 'paid_out', 'failed']);

/**
 * A merchant (§6.1).
 *
 * `user_id` is the key point: a merchant IS a sovereign account. Settlement
 * credits that account's ledger balance, which is "the same balance graph they
 * trade and spend from — the doc's promise, kept".
 */
export const merchants = pay.table(
  'merchants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    kybStatus: kybStatusEnum('kyb_status').notNull().default('none'),
    /** Limits and pricing band. Tier 0 is a fresh signup, not a rejected one. */
    tier: integer('tier').notNull().default(0),
    mode: merchantModeEnum('mode').notNull().default('gateway'),
    /**
     * Pricing (§6.1 "custom pricing"): `{"feeBps": 250}`. jsonb because the
     * pricing model grows — fixed components, per-method rates, volume bands —
     * and each of those would otherwise be a migration.
     */
    pricing: jsonb('pricing').notNull().default({}),
    /** Where and how often the merchant wants paying out. */
    settlementPrefs: jsonb('settlement_prefs').notNull().default({}),
    status: merchantStatusEnum('status').notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** One merchant per sovereign account in this PR — sub-merchants are PayFac. */
    uniqueIndex('merchants_user_idx').on(t.userId),
    index('merchants_status_idx').on(t.status),
  ],
);

/** A checkout configuration a merchant can point payments at (§6.1). */
export const paymentProfiles = pay.table(
  'payment_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    checkoutConfig: jsonb('checkout_config').notNull().default({}),
    /** Fee routing rules — who bears the fee, and where a split lands. */
    feeRouting: jsonb('fee_routing').notNull().default({}),
    /** Origins allowed to open this profile's checkout. */
    domains: text('domains').array().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('payment_profiles_merchant_idx').on(t.merchantId)],
);

/**
 * A payment (§6.1).
 *
 * `amount` is the AUTHORIZED amount — what the payer agreed to. It never
 * changes. What was actually captured and refunded is summed from
 * `payment_events`.
 */
export const payments = pay.table(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    profileId: uuid('profile_id').references(() => paymentProfiles.id),
    amount: amount('amount').notNull(),
    /** Asset id as the ledger knows it: 'USDT', 'BTC', 'EUR'. */
    currency: text('currency').notNull(),
    /** 'card', 'crypto', 'bank_transfer' — what the payer used. */
    method: text('method').notNull(),
    /** Which `RailAdapter` handled it. The adapter's `id`, always. */
    railAdapter: text('rail_adapter').notNull(),
    /** The rail's own reference. NULL until the rail has been asked to authorize. */
    railRef: text('rail_ref'),
    status: paymentStatusEnum('status').notNull().default('created'),
    /** Populated by the risk engine — a separate tracker feature. */
    riskScore: integer('risk_score'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payments_merchant_status_idx').on(t.merchantId, t.status),
    /** The webhook lookup: a rail speaks in its own references, not ours. */
    uniqueIndex('payments_rail_ref_idx').on(t.railAdapter, t.railRef),
    /** The settlement sweep scans a merchant's window in creation order. */
    index('payments_merchant_created_idx').on(t.merchantId, t.createdAt),
  ],
);

/**
 * THE STATE HISTORY (§6.1 "full state history").
 *
 * Append-only, and enforced as such by a trigger in the migration rather than
 * by good intentions: `payments.status` is a projection of this table, so an
 * UPDATE here would rewrite the past a dispute is later argued from.
 *
 * Every transition appends. Nothing is overwritten.
 */
export const paymentEvents = pay.table(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * THE TOTAL ORDER.
     *
     * `ts` inside a transaction is the transaction's start time, so every event
     * appended by one transition shares a timestamp. A history that cannot say
     * whether the capture came before or after the refund is not a history.
     */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    /** 'created' | 'authorized' | 'rail.captured' | 'captured' | 'refunded' | … */
    event: text('event').notNull(),
    payload: jsonb('payload').notNull().default({}),
    /**
     * THE WEBHOOK DEDUPE KEY. The rail's own event id, unique when present.
     *
     * A PSP webhook WILL be delivered twice; that is normal, not exceptional.
     * The unique index below is what makes the second delivery a no-op at the
     * database level, where no amount of application-layer racing can defeat it.
     */
    railEventId: text('rail_event_id'),
    ts: tstz('ts').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payment_events_seq_idx').on(t.seq),
    index('payment_events_payment_idx').on(t.paymentId, t.seq),
    index('payment_events_kind_idx').on(t.paymentId, t.event),
  ],
);

/**
 * A settlement window (§6.1).
 *
 * `asset_id` is not in §6.1's sketch, and it must be: `gross`, `fees` and `net`
 * are meaningless without saying what they are denominated in, and a merchant
 * taking USDT and BTC on the same day has two settlements, not one.
 *
 * There is no `ledger_tx_id` column on purpose — the link to the ledger is the
 * business key `settlement:<merchant>:<window>:<asset>`, derivable from this
 * row, so the two can never drift apart by one being updated and not the other.
 */
export const settlements = pay.table(
  'settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    /** Window label, e.g. '2026-07-27'. Half the business key. */
    window: text('window').notNull(),
    assetId: text('asset_id').notNull(),
    gross: amount('gross').notNull(),
    fees: amount('fees').notNull(),
    net: amount('net').notNull(),
    /** 'ledger' until a payout rail is asked to move it out of the book. */
    payoutMethod: text('payout_method'),
    payoutRef: text('payout_ref'),
    /**
     * How many times a rail has REFUSED a payout for this settlement.
     *
     * Part of the payout hold's ledger idempotency key. A refused payout
     * releases the merchant's hold, so a retry needs a fresh key; it increments
     * on refusal only, never on a crash retry, so a resumed attempt reuses its
     * key and stays idempotent.
     */
    payoutAttempts: integer('payout_attempts').notNull().default(0),
    status: settlementStatusEnum('status').notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** A window settles exactly once per asset. The anti-double-pay rule. */
    uniqueIndex('settlements_window_idx').on(t.merchantId, t.window, t.assetId),
    index('settlements_status_idx').on(t.status),
  ],
);

// ── USER MONEY IN AND OUT ────────────────────────────────────────────────────
//
// Everything above this line is MERCHANT money: a third party pays a merchant,
// and svc-pay clears and settles it. The two tables below are the other half —
// a USER's own balance entering and leaving the book.
//
// They live here because this is the service that owns rails. Value entering
// the book must come from one (§4.2 `deposit(user, asset, amount, rail)`), value
// leaving it goes out through one, and `RailAdapter` + `RailRegistry` are here.
// Putting them anywhere else would mean a second service learning about rails,
// or a money path with no rail behind it at all.
//
// Neither table holds a balance. Both hold a RECORD of an intent and where it
// got to; the value itself is in the ledger, and always was (Doctrine §0.6).

/**
 * `pending` — the row exists, nothing has been booked. The crash-resumable
 * middle. `credited` — the ledger transaction is posted and the user can spend.
 */
export const depositStatusEnum = pay.enum('deposit_status', ['pending', 'credited']);

/**
 * A user's balance being credited from a rail (§4.2 `deposit`).
 *
 * OPERATOR-CREDENTIALED, never user-facing: a user who can call the thing that
 * credits their own balance does not need to deposit at all. The row records
 * `credited_by` so every unit of value that entered the book this way names the
 * operator who asserted it had arrived.
 *
 * `(rail, rail_ref)` is UNIQUE and that is the whole idempotency story, at the
 * database level rather than in application logic. It is the same key the ledger
 * recipe builds (`deposit:<rail>:<railRef>`), so the two cannot disagree about
 * what "already credited" means — and a webhook redelivery, a double-click, or
 * a retried job all land on the same row.
 */
export const deposits = pay.table(
  'deposits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The beneficiary. `text`, matching `merchants.user_id` — svc-pay does not own the user table. */
    userId: text('user_id').notNull(),
    assetId: text('asset_id').notNull(),
    amount: amount('amount').notNull(),
    /** Which `RailAdapter` the value arrived on. The adapter's `id`, always. */
    rail: text('rail').notNull(),
    /** The rail's own reference — tx hash, PSP id. Half the business key. */
    railRef: text('rail_ref').notNull(),
    /** The operator who credited it. The only record of who asserted the value arrived. */
    creditedBy: text('credited_by').notNull(),
    status: depositStatusEnum('status').notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** THE IDEMPOTENCY. One credit per rail reference, enforced by the database. */
    uniqueIndex('deposits_rail_ref_idx').on(t.rail, t.railRef),
    index('deposits_user_idx').on(t.userId, t.createdAt),
    /** The resume sweep: everything booked at a rail but not yet in the book. */
    index('deposits_status_idx').on(t.status),
  ],
);

/**
 * Where a withdrawal got to.
 *
 * `held` is a real state, not an implementation detail: the user's funds have
 * left `available` and are sitting in a purpose-keyed hold while a rail works.
 * A withdrawal stuck in `held` is the one state where value is immobilised, so
 * it has to be queryable rather than inferred.
 */
export const withdrawalStatusEnum = pay.enum('withdrawal_status', ['pending', 'held', 'sent', 'failed']);

/**
 * A USER moving their own balance off the platform.
 *
 * `trade:withdraw` — an INTERACTIVE_ONLY scope no API key may hold, so a leaked
 * bot key cannot reach it. `client_ref` is required and unique per user, which
 * is what makes the whole hold → settle/reverse sequence resumable: a retry
 * finds the existing row and continues from its status rather than opening a
 * second withdrawal.
 *
 * `attempts` is part of the ledger hold's business key, exactly as
 * `settlements.payout_attempts` is. It advances only on a rail REFUSAL — a
 * refusal reverses the hold, so the next attempt needs a fresh key, while a
 * crash-and-resume reuses its key and stays idempotent.
 */
export const withdrawals = pay.table(
  'withdrawals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    assetId: text('asset_id').notNull(),
    amount: amount('amount').notNull(),
    rail: text('rail').notNull(),
    /**
     * Where the money is going: `{ kind: 'bank' | 'crypto', ref }`.
     *
     * jsonb because a destination's shape is the rail's business, not ours, and
     * because a masked account reference is the sort of thing that must never
     * end up in a WHERE clause by accident.
     */
    destination: jsonb('destination').notNull(),
    /** The caller's own key for this withdrawal. What makes a retry a resume. */
    clientRef: text('client_ref').notNull(),
    /** The rail's reference once it has sent. NULL until then. */
    railRef: text('rail_ref'),
    /** Rail refusals so far. Part of the hold's ledger idempotency key. */
    attempts: integer('attempts').notNull().default(0),
    /** Machine-readable reason the last attempt failed, for the user and the operator. */
    failureCode: text('failure_code'),
    status: withdrawalStatusEnum('status').notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** ONE WITHDRAWAL PER CLIENT REFERENCE. A retry resumes; it does not duplicate. */
    uniqueIndex('withdrawals_client_ref_idx').on(t.userId, t.clientRef),
    index('withdrawals_user_idx').on(t.userId, t.createdAt),
    /** The stuck-in-flight query: whose money is sitting in a hold right now. */
    index('withdrawals_status_idx').on(t.status),
  ],
);

/**
 * Shareable payment link (§6.1). The raw token is shown once; only the hash
 * is stored. Public resolve returns checkout intent, never merchant secrets.
 */
export const paymentLinks = pay.table(
  'payment_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    profileId: uuid('profile_id').references(() => paymentProfiles.id),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    label: text('label').notNull(),
    amount: amount('amount'),
    currency: text('currency'),
    active: boolean('active').notNull().default(true),
    /**
     * NULL means unbounded, and that is a decision rather than an omission.
     *
     * A use is consumed by a COMPLETED payment, and a completed payment against
     * a merchant's own link is revenue, not abuse. What actually makes a
     * capability URL dangerous is living forever — which is why `expires_at` is
     * defaulted and capped by the service while this stays opt-in: a merchant
     * sets it to 1 for an invoice that must only ever be paid once.
     */
    maxUses: integer('max_uses'),
    /**
     * Completed payments against this link.
     *
     * Advisory under concurrency, on purpose. It is checked at session open,
     * where nothing has moved yet; it is NEVER allowed to refuse the booking of
     * money that has already arrived, which is the same rule that stops a
     * deposit being refused at the boundary.
     */
    uses: integer('uses').notNull().default(0),
    expiresAt: tstz('expires_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('payment_links_token_hash_idx').on(t.tokenHash), index('payment_links_merchant_idx').on(t.merchantId)],
);

/**
 * `open` — a payer is mid-checkout. `completed` — the payment behind it was
 * captured. `expired` — the browser handoff lapsed. `cancelled` — abandoned.
 */
export const checkoutSessionStatusEnum = pay.enum('checkout_session_status', ['open', 'completed', 'expired', 'cancelled']);

/**
 * A HOSTED CHECKOUT SESSION — one anonymous payer, one attempt, one frozen
 * amount.
 *
 * This is the public surface that takes money from somebody who is not logged
 * in, so every column here exists to take a decision away from the browser:
 *
 *   · `amount` / `currency` are frozen at open and never re-read from a request
 *     afterwards. That is what makes client-side amount tampering impossible
 *     rather than merely discouraged.
 *   · `rail_adapter` is chosen SERVER-SIDE from configuration. A hosted checkout
 *     that lets its caller name a rail is the route straight back to the P0 that
 *     `rails/posture.ts` closed; the payer names a method at most.
 *   · `token_hash`, never a token, and its own token rather than the link's — a
 *     link is a many-payer capability and a session is one payer's.
 *
 * A SESSION EXPIRING DOES NOT EXPIRE THE PAYMENT. The session is a browser
 * handoff measured in minutes; the payment is a claim on money and does not
 * expire at all. A payer who sends funds ten minutes after their tab timed out
 * has still sent them to an acceptance address derived from the payment id, and
 * the rail's webhook still matches that payment by `rail_ref` and still books
 * it. Expiring both together is what would strand them.
 */
export const checkoutSessions = pay.table(
  'checkout_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    linkId: uuid('link_id')
      .notNull()
      .references(() => paymentLinks.id),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    /** The payment this session opened. Written in the same transaction as the session. */
    paymentId: uuid('payment_id').references(() => payments.id),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    amount: amount('amount').notNull(),
    currency: text('currency').notNull(),
    railAdapter: text('rail_adapter').notNull(),
    /** What this one payer needs in order to pay — an acceptance address, and what to send. */
    instruction: jsonb('instruction').notNull().default({}),
    status: checkoutSessionStatusEnum('status').notNull().default('open'),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('checkout_sessions_token_hash_idx').on(t.tokenHash),
    /** One session per payment: two browsers must never be told they own the same money. */
    uniqueIndex('checkout_sessions_payment_idx').on(t.paymentId),
    index('checkout_sessions_link_status_idx').on(t.linkId, t.status),
    index('checkout_sessions_expiry_idx').on(t.status, t.expiresAt),
  ],
);

/**
 * Outbound crypto broadcast journal (Class M). Not money — only idempotency keys
 * and tx hashes so multi-replica live rails cannot double-send.
 */
export const cryptoBroadcasts = pay.table('crypto_broadcasts', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  txHash: text('tx_hash').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const schema = {
  merchants,
  paymentProfiles,
  paymentLinks,
  checkoutSessions,
  payments,
  paymentEvents,
  settlements,
  deposits,
  withdrawals,
  cryptoBroadcasts,
};
