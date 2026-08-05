import { bigint, index, integer, jsonb, numeric, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, bps, createdAt, tstz, updatedAt } from '@intafaced/db';

/**
 * PEER-TO-PEER TRADING (§6.2).
 *
 * Doctrine §0.6, and here it is load-bearing: **this service holds no balances**.
 * Escrowed value lives in the ledger's `escrow` account kind, put there by
 * `escrowLock` and taken out by exactly one of `escrowRelease` / `escrowRefund`.
 * These tables hold the *terms* and the *decisions* — never the money.
 *
 * Which means the interesting column in this file is `p2p_trades.resolution`.
 * It is the recorded decision, written and committed BEFORE the ledger post
 * that acts on it. One row, one resolution, immutable once set: that is what
 * makes "released to both parties" impossible rather than merely unlikely.
 *
 * 100+ fiat currencies are `packages/config/src/fiat.ts`, not a table here
 * (§6.2: "config, not code"). `fiat_currency` is a plain ISO-4217 code
 * validated against that registry at the edge.
 */
export const p2p = pgSchema('p2p');

/** Which way the MAKER trades. A `sell` offer escrows the maker's asset; a `buy` offer escrows the taker's. */
export const offerSideEnum = p2p.enum('offer_side', ['buy', 'sell']);

/** §6.2 `price_type enum[fixed,float]`. */
export const priceTypeEnum = p2p.enum('price_type', ['fixed', 'float']);

/**
 * `paused` is a distinct state, not a flag: a paused offer is invisible to
 * takers but its open trades continue, and a closed offer can never re-open.
 */
export const offerStatusEnum = p2p.enum('offer_status', ['active', 'paused', 'closed']);

/** §6.2, exactly: `created,escrowed,fiat_sent,released,cancelled,disputed`. */
export const tradeStatusEnum = p2p.enum('trade_status', ['created', 'escrowed', 'fiat_sent', 'released', 'cancelled', 'disputed']);

/**
 * WHERE THE LOCKED VALUE WENT. Non-null exactly on a terminal trade.
 *
 *   released — escrow went to the buyer (minus fee)
 *   refunded — escrow went back to the seller, in full
 *   voided   — nothing was ever locked, so nothing had to move
 *
 * `voided` exists because a trade can die between "reserved" and "escrowed",
 * and a terminal trade with a NULL resolution would be a row nobody can explain.
 */
export const tradeResolutionEnum = p2p.enum('trade_resolution', ['released', 'refunded', 'voided']);

export const disputeStatusEnum = p2p.enum('dispute_status', ['open', 'resolved']);

/** A moderator has exactly two options. There is deliberately no third. */
export const disputeResolutionEnum = p2p.enum('dispute_resolution', ['release', 'refund']);

/**
 * §6.2 `offers`.
 *
 * `total_amt` / `remaining_amt` are not in §6.2's sketch and are added
 * deliberately. Without inventory an offer is infinitely takeable, and the only
 * thing stopping the tenth concurrent taker is the seller's available balance
 * running out mid-`escrowLock` — i.e. nine takers discovering the failure one
 * at a time, after committing to a price. Reserving inventory under a row lock
 * moves that rejection to before any value moves (§5: every failure branch).
 */
export const offers = p2p.table(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    makerId: text('maker_id').notNull(),
    side: offerSideEnum('side').notNull(),
    /** Ledger asset id, e.g. 'USDT'. The crypto leg. */
    asset: text('asset').notNull(),
    /** ISO-4217, validated against `packages/config` FIAT_CURRENCIES. */
    fiatCurrency: text('fiat_currency').notNull(),
    priceType: priceTypeEnum('price_type').notNull(),
    /**
     * `fixed` — fiat per one unit of asset.
     * `float` — a multiplier on the reference price supplied at take time
     *           (1.02 = 2% over). This service never *sources* a price; §4.3's
     *           rule that svc-token never decides a price applies here too.
     */
    price: amount('price').notNull(),
    /** Per-trade bounds. A take outside them is rejected before any lock. */
    minAmt: amount('min_amt').notNull(),
    maxAmt: amount('max_amt').notNull(),
    /** Offer inventory. `remaining_amt` is reserved under a row lock on take. */
    totalAmt: amount('total_amt').notNull(),
    remainingAmt: amount('remaining_amt').notNull(),
    /** Payment methods the maker accepts, e.g. `[{"id":"sepa","label":"SEPA"}]`. */
    methods: jsonb('methods').notNull().default([]),
    terms: text('terms').notNull().default(''),
    status: offerStatusEnum('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** The board query: live offers for a pair, best price first. */
    index('offers_book_idx').on(t.asset, t.fiatCurrency, t.side, t.status),
    index('offers_maker_idx').on(t.makerId, t.status),
  ],
);

/**
 * §6.2 `p2p_trades` — one taken offer, and the escrow it owns.
 *
 * `seller_id` / `buyer_id` are stored rather than derived from `offers.side` at
 * read time. Every ledger post keys off `seller_id` (escrow lives in the
 * seller's `escrow` account), so a change to the offer must never be able to
 * re-point an open escrow at a different person.
 */
export const p2pTrades = p2p.table(
  'p2p_trades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id),
    takerId: text('taker_id').notNull(),
    /** Denormalised so the reputation sweep does not join a closed offer. */
    makerId: text('maker_id').notNull(),
    /** THE ESCROW OWNER. Snapshotted at take; never recomputed. */
    sellerId: text('seller_id').notNull(),
    buyerId: text('buyer_id').notNull(),
    asset: text('asset').notNull(),
    fiatCurrency: text('fiat_currency').notNull(),
    /** Crypto quantity held in escrow. */
    amount: amount('amount').notNull(),
    /** Effective price at take — snapshotted so a float offer cannot re-price mid-trade. */
    price: amount('price').notNull(),
    /** What the buyer owes off-platform, already quantised to the currency's minor units. */
    fiatAmount: amount('fiat_amount').notNull(),
    method: text('method').notNull(),
    /** Snapshotted at take, for the same reason `token.stakes.multiplier_bps` is. */
    feeBps: bps('fee_bps').notNull().default('0'),
    status: tradeStatusEnum('status').notNull().default('created'),
    /**
     * THE DECISION. Written and committed before the ledger post it authorises.
     *
     * Non-null ⇒ terminal ⇒ no further movement is permitted, by CHECK.
     */
    resolution: tradeResolutionEnum('resolution'),
    resolutionReason: text('resolution_reason'),
    chatThreadId: uuid('chat_thread_id'),
    /** §6.2 `deadlines jsonb` — the full record, for the UI and the audit trail. */
    deadlines: jsonb('deadlines').notNull().default({}),
    /**
     * The one deadline that currently applies, mirrored out of `deadlines` on
     * every transition and NULLed when terminal. The sweeper scans this: a
     * sweeper that has to parse jsonb per row is a sweeper that gets skipped,
     * and a sweep that gets skipped is funds sitting in escrow forever.
     */
    deadlineAt: tstz('deadline_at'),
    createdAt: createdAt(),
    escrowedAt: tstz('escrowed_at'),
    fiatSentAt: tstz('fiat_sent_at'),
    /** When the resolution was recorded. Always ≤ `settled_at`. */
    resolvedAt: tstz('resolved_at'),
    /**
     * When the ledger post for the resolution was confirmed.
     *
     * `resolved_at IS NOT NULL AND settled_at IS NULL` is the settlement
     * sweeper's work queue — a decision that has been made but not yet acted
     * on. It is the only window in which value can be *late*, and it is
     * self-healing because every recipe is keyed on the trade id.
     */
    settledAt: tstz('settled_at'),
  },
  (t) => [
    /** The sweeper: what is overdue, oldest first. */
    index('p2p_trades_deadline_idx').on(t.deadlineAt),
    /** The settlement sweeper: decided but not yet posted. */
    index('p2p_trades_unsettled_idx').on(t.resolvedAt, t.settledAt),
    index('p2p_trades_offer_idx').on(t.offerId),
    index('p2p_trades_seller_idx').on(t.sellerId, t.status),
    index('p2p_trades_buyer_idx').on(t.buyerId, t.status),
  ],
);

/**
 * §6.2 `p2p_disputes`.
 *
 * One dispute per trade, ever (unique index). A second dispute row would mean
 * two moderators could reach two decisions about one escrow.
 */
export const p2pDisputes = p2p.table(
  'p2p_disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tradeId: uuid('trade_id')
      .notNull()
      .references(() => p2pTrades.id),
    openedBy: text('opened_by').notNull(),
    reason: text('reason').notNull().default(''),
    /**
     * APPEND-ONLY, and the database enforces it
     * (`p2p_disputes_evidence_append_only_trg`). A jsonb array of attributed
     * envelopes: `{ seq, submittedBy, submittedAt, item }`. Evidence that can be
     * edited after the fact is not a record of a dispute, it is a draft.
     */
    evidence: jsonb('evidence').notNull().default([]),
    moderatorId: text('moderator_id'),
    resolution: disputeResolutionEnum('resolution'),
    resolutionNotes: text('resolution_notes'),
    status: disputeStatusEnum('status').notNull().default('open'),
    /**
     * Moderator SLA. Past it the dispute ESCALATES — it is never resolved by a
     * clock. A disputed escrow terminates only on a ruling attributed to a
     * human (`p2p_trades_disputed_needs_ruling_trg`).
     */
    deadlineAt: tstz('deadline_at').notNull(),
    openedAt: tstz('opened_at').notNull().defaultNow(),
    resolvedAt: tstz('resolved_at'),
    /**
     * Written by the statement that SERVES this row to a moderator, and by
     * nothing else. "A queue exists" and "a human reached this dispute" are
     * different claims, and only one of them is a fact about the world.
     */
    lastSeenByModeratorAt: tstz('last_seen_by_moderator_at'),
    moderatorViews: integer('moderator_views').notNull().default(0),
    /** SLA breached: re-armed and raised, never disposed of. */
    escalatedAt: tstz('escalated_at'),
    escalations: integer('escalations').notNull().default(0),
  },
  (t) => [
    uniqueIndex('p2p_disputes_trade_idx').on(t.tradeId),
    /** THE MODERATOR QUEUE — `disputes.list` orders by exactly this. */
    index('p2p_disputes_open_idx').on(t.status, t.deadlineAt),
  ],
);

/**
 * §6.2 `p2p_reputation` — completion rate, average release time, disputes lost.
 *
 * Counters, not a derived view, because the read is on the hot path of every
 * offer render and the XP award that follows a trade must see the post-trade
 * numbers in the same transaction that wrote them.
 *
 * This feeds `intafaced.identity.xp.earned` — §6.2 → §4.1, one graph: a
 * spotless P2P record raises limits everywhere.
 */
export const p2pReputation = p2p.table(
  'p2p_reputation',
  {
    userId: text('user_id').primaryKey(),
    /** Trades this user was a party to that reached escrow. */
    tradesTotal: integer('trades_total').notNull().default(0),
    completed: integer('completed').notNull().default(0),
    cancelled: integer('cancelled').notNull().default(0),
    disputed: integer('disputed').notNull().default(0),
    disputesLost: integer('disputes_lost').notNull().default(0),
    /** completed / trades_total, 0..1. Not money — but still not a float. */
    completionRate: numeric('completion_rate', { precision: 6, scale: 4 }).notNull().default('0'),
    /** Accumulators, so the average is exact and does not drift on update. */
    totalReleaseSecs: bigint('total_release_secs', { mode: 'number' }).notNull().default(0),
    releaseSamples: integer('release_samples').notNull().default(0),
    avgReleaseSecs: integer('avg_release_secs').notNull().default(0),
    badges: text('badges').array().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [index('p2p_reputation_completed_idx').on(t.completed)],
);

export const schema = { offers, p2pTrades, p2pDisputes, p2pReputation };
