import { bigserial, index, integer, jsonb, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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

export const schema = { merchants, paymentProfiles, payments, paymentEvents, settlements };
