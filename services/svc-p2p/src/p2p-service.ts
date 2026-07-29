import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import { isSupportedFiat } from '@intafaced/config';
import type { EventBus } from '@intafaced/events';
import {
  InsufficientFundsError,
  formatAmount,
  parseAmount,
  recipes,
  mulBps,
  tradeEscrowAccount,
  type Amount,
  type LedgerClient,
} from '@intafaced/ledger-client';
import { assertWithinBounds, partiesFor, quote, PricingError, type PriceType, type ReferencePriceSource } from './pricing.js';
import {
  DEFAULT_DEADLINES,
  assertTransition,
  deadlineFor,
  holdsEscrow,
  isTerminal,
  timeoutActionFor,
  withDeadline,
  TradeStateError,
  type DeadlinePolicy,
  type Deadlines,
  type TradeResolution,
  type TradeStatus,
} from './state.js';
import {
  DEFAULT_XP_POLICY,
  EMPTY_COUNTERS,
  applyOutcome,
  snapshotOf,
  xpFor,
  xpKey,
  type P2pXpAction,
  type ReputationCounters,
  type ReputationSnapshot,
  type TradeOutcome,
  type XpPolicy,
} from './reputation.js';
import { withMoneySpan, withSpan } from './tracing.js';

/**
 * svc-p2p — PEER-TO-PEER TRADING WITH ESCROW (§6.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE THING THIS FILE IS FOR
 *
 * Locked funds must always reach exactly one terminal state. Not usually. Not
 * after an operator intervenes. Always, including when the process dies at the
 * worst possible instruction.
 *
 * Two properties do the work, and everything else is bookkeeping around them:
 *
 *   1 · **DECIDE, THEN POST.** A terminal decision is written and committed to
 *       `p2p_trades.resolution` BEFORE the ledger post that acts on it. The
 *       database allows exactly one resolution per trade
 *       (`p2p_trades_resolution_matches_status_ck`), so "released to both
 *       parties" is not a race to lose — it is a row that cannot be written.
 *       Crash between the decision and the post and the funds are *late*, not
 *       stranded: `sweepSettlements()` finds `resolved_at IS NOT NULL AND
 *       settled_at IS NULL` and re-posts, and every recipe is keyed on the
 *       trade id so re-posting moves nothing twice.
 *
 *   2 · **RE-DRIVE, DON'T INTERROGATE.** "Did the escrow lock post?" is
 *       answered by calling `escrowLock` again. Its business key
 *       (`p2p.escrow.lock:<tradeId>`) makes a retry return the original
 *       transaction if it did, and fail on funds if it did not. So a trade
 *       stuck in `created` is never ambiguous, and — critically — a refund is
 *       never posted against an escrow that was never funded. That matters
 *       because escrow is pooled per (user, asset): a spurious refund would not
 *       fail, it would quietly pay the seller out of somebody else's trade.
 *
 * Doctrine §0.6: this service holds no balances. `p2p_trades.amount` is the
 * quantity that was locked, recorded once and never mutated. The value itself
 * is in the ledger's `escrow` account kind, and `escrowIntegrity()` proves the
 * two agree.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type P2pErrorCode =
  | 'p2p.offer_not_found'
  | 'p2p.offer_not_active'
  | 'p2p.offer_method_unsupported'
  | 'p2p.self_trade'
  | 'p2p.trade_not_found'
  | 'p2p.trade_exists'
  | 'p2p.not_a_party'
  | 'p2p.not_the_seller'
  | 'p2p.not_the_buyer'
  | 'p2p.dispute_not_found'
  | 'p2p.dispute_already_open'
  | 'p2p.dispute_already_resolved'
  | 'p2p.escrow_missing'
  | 'p2p.trading_disabled';

export class P2pError extends Error {
  constructor(
    message: string,
    readonly code: P2pErrorCode,
  ) {
    super(message);
    this.name = 'P2pError';
  }
}

export interface P2pServiceOptions {
  /** Platform fee taken off the escrowed amount at release. */
  feeBps?: number;
  deadlines?: DeadlinePolicy;
  xp?: XpPolicy;
  /** Kill-switch. Blocks new offers and takes; never blocks settlement. */
  tradingEnabled?: boolean;
  /** Backstop decision for a dispute no moderator ruled on. Never "neither". */
  disputeBackstopResolution?: 'release' | 'refund';
  backstopModeratorId?: string;
  /** Floating offers need one. Absent = floating offers cannot be taken. */
  referencePrices?: ReferencePriceSource;
}

export interface OfferRecord {
  id: string;
  makerId: string;
  side: 'buy' | 'sell';
  asset: string;
  fiatCurrency: string;
  priceType: PriceType;
  price: Amount;
  minAmt: Amount;
  maxAmt: Amount;
  totalAmt: Amount;
  remainingAmt: Amount;
  methods: unknown[];
  terms: string;
  status: 'active' | 'paused' | 'closed';
  createdAt: Date;
}

export interface TradeRecord {
  id: string;
  offerId: string;
  takerId: string;
  makerId: string;
  sellerId: string;
  buyerId: string;
  asset: string;
  fiatCurrency: string;
  amount: Amount;
  price: Amount;
  fiatAmount: Amount;
  method: string;
  feeBps: number;
  status: TradeStatus;
  resolution: TradeResolution | null;
  resolutionReason: string | null;
  deadlines: Deadlines;
  deadlineAt: Date | null;
  createdAt: Date;
  escrowedAt: Date | null;
  fiatSentAt: Date | null;
  resolvedAt: Date | null;
  settledAt: Date | null;
}

export interface DisputeRecord {
  id: string;
  tradeId: string;
  openedBy: string;
  reason: string;
  evidence: unknown;
  moderatorId: string | null;
  resolution: 'release' | 'refund' | null;
  resolutionNotes: string | null;
  status: 'open' | 'resolved';
  deadlineAt: Date;
  openedAt: Date;
  resolvedAt: Date | null;
}

interface TradeRow {
  id: string;
  offer_id: string;
  taker_id: string;
  maker_id: string;
  seller_id: string;
  buyer_id: string;
  asset: string;
  fiat_currency: string;
  amount: string;
  price: string;
  fiat_amount: string;
  method: string;
  fee_bps: string;
  status: TradeStatus;
  resolution: TradeResolution | null;
  resolution_reason: string | null;
  deadlines: Deadlines;
  deadline_at: Date | null;
  created_at: Date;
  escrowed_at: Date | null;
  fiat_sent_at: Date | null;
  resolved_at: Date | null;
  settled_at: Date | null;
}

interface OfferRow {
  id: string;
  maker_id: string;
  side: 'buy' | 'sell';
  asset: string;
  fiat_currency: string;
  price_type: PriceType;
  price: string;
  min_amt: string;
  max_amt: string;
  total_amt: string;
  remaining_amt: string;
  methods: unknown[];
  terms: string;
  status: 'active' | 'paused' | 'closed';
  created_at: Date;
}

interface DisputeRow {
  id: string;
  trade_id: string;
  opened_by: string;
  reason: string;
  evidence: unknown;
  moderator_id: string | null;
  resolution: 'release' | 'refund' | null;
  resolution_notes: string | null;
  status: 'open' | 'resolved';
  deadline_at: Date;
  opened_at: Date;
  resolved_at: Date | null;
}

/** Who authorised a terminal decision. Goes on the event and into the trace. */
type Actor = 'seller' | 'buyer' | 'moderator' | 'timeout';

/**
 * THE CLOCK. Postgres', never this process'.
 *
 * `settled_at` is stamped by the database (`SET settled_at = now()`), and the
 * two properties this service exists to guarantee both compare against it:
 * "decide, then post" means `resolved_at <= settled_at`, and
 * `sweepSettlements()` orders the decisions it has to re-drive by `resolved_at`.
 * Reading `new Date()` for one side of those comparisons and `now()` for the
 * other put an unbounded skew term into an ordering that value depends on — a
 * Node clock a few milliseconds ahead of the server's is enough to record a
 * decision as having happened AFTER the movement it authorised, which is an
 * audit trail that contradicts itself.
 *
 * It also does not survive a second replica. Two svc-p2p processes each stamp
 * `resolved_at` from their own hardware, so the sweeper's FIFO becomes an
 * ordering over two clocks that were never synchronised. Postgres is the one
 * clock every replica already shares, so every instant on the row comes from
 * here — not just the two the test happens to compare.
 *
 * `now()` is the TRANSACTION timestamp, not the statement timestamp, and that
 * is deliberate:
 *
 *   · Within one transaction it is a constant, so `resolveDispute` stamps the
 *     trade's `resolved_at` and the dispute's `resolved_at` with the identical
 *     instant. One ruling happened at one moment; two rows disagreeing about
 *     when a moderator decided would be the audit-trail hole all over again.
 *   · Across transactions it still gives strict ordering where we need it.
 *     `settled_at` is written by a LATER, separate transaction — the decision
 *     has committed before the ledger post is even attempted — so its
 *     transaction timestamp is strictly greater. `clock_timestamp()` would buy
 *     no extra strictness here and would cost the constant above.
 *
 * The truncation is also in the safe direction: the driver parses Postgres'
 * microseconds down to JS millisecond precision, so a value read here and bound
 * back into a column is always <= the true transaction timestamp, never past it.
 */
async function txNow(tx: Sql): Promise<Date> {
  const rows = await tx<Array<{ now: Date }>>`SELECT now() AS now`;
  return rows[0]!.now;
}

export class P2pService {
  private readonly feeBps: number;
  private readonly deadlines: DeadlinePolicy;
  private readonly xpPolicy: XpPolicy;
  private readonly backstopResolution: 'release' | 'refund';
  private readonly backstopModeratorId: string;
  private readonly referencePrices: ReferencePriceSource | undefined;
  private tradingEnabled: boolean;

  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly bus: EventBus,
    options: P2pServiceOptions = {},
  ) {
    this.feeBps = options.feeBps ?? 0;
    this.deadlines = options.deadlines ?? DEFAULT_DEADLINES;
    this.xpPolicy = options.xp ?? DEFAULT_XP_POLICY;
    this.tradingEnabled = options.tradingEnabled ?? true;
    this.backstopResolution = options.disputeBackstopResolution ?? 'refund';
    this.backstopModeratorId = options.backstopModeratorId ?? 'system:p2p-backstop';
    this.referencePrices = options.referencePrices;
  }

  /**
   * Kill-switch (§14 admin controls).
   *
   * Blocks new offers and new takes only. Settlement, disputes and both sweeps
   * keep running, because a switch that could freeze settlement would be a
   * switch that strands every open escrow — the exact failure this service
   * exists to make impossible.
   */
  setTradingEnabled(enabled: boolean): void {
    this.tradingEnabled = enabled;
  }

  // ── Offers (§6.2) ──────────────────────────────────────────────────────────

  async createOffer(input: {
    makerId: string;
    side: 'buy' | 'sell';
    asset: string;
    fiatCurrency: string;
    priceType: PriceType;
    price: Amount;
    minAmt: Amount;
    maxAmt: Amount;
    totalAmt?: Amount;
    methods?: unknown[];
    terms?: string;
    offerId?: string;
  }): Promise<OfferRecord> {
    this.assertTradingEnabled();

    const fiatCurrency = input.fiatCurrency.toUpperCase();
    if (!isSupportedFiat(fiatCurrency)) {
      // §6.2: 100+ fiat currencies are config, not code. The registry in
      // packages/config decides what we serve; this service never has a list.
      throw new PricingError(`Fiat currency "${fiatCurrency}" is not enabled`, 'p2p.unsupported_fiat');
    }

    const totalAmt = input.totalAmt ?? input.maxAmt;
    const offerId = input.offerId ?? crypto.randomUUID();

    const rows = await this.sql<OfferRow[]>`
      INSERT INTO p2p.offers (
        id, maker_id, side, asset, fiat_currency, price_type, price,
        min_amt, max_amt, total_amt, remaining_amt, methods, terms, status
      )
      VALUES (
        ${offerId}, ${input.makerId}, ${input.side}, ${input.asset}, ${fiatCurrency},
        ${input.priceType}, ${formatAmount(input.price)}::numeric,
        ${formatAmount(input.minAmt)}::numeric, ${formatAmount(input.maxAmt)}::numeric,
        ${formatAmount(totalAmt)}::numeric, ${formatAmount(totalAmt)}::numeric,
        ${this.sql.json((input.methods ?? []) as never)}, ${input.terms ?? ''}, 'active'
      )
      RETURNING *
    `;

    const offer = toOffer(rows[0]!);

    await this.bus.publish(
      'p2pOfferCreated',
      {
        offerId: offer.id,
        makerId: offer.makerId,
        side: offer.side,
        asset: offer.asset,
        fiatCurrency: offer.fiatCurrency,
        priceType: offer.priceType,
        price: formatAmount(offer.price),
        minAmount: formatAmount(offer.minAmt),
        maxAmount: formatAmount(offer.maxAmt),
      },
      { idempotencyKey: `p2p.offer:${offer.id}` },
    );

    return offer;
  }

  async listOffers(
    filter: {
      asset?: string;
      fiatCurrency?: string;
      side?: 'buy' | 'sell';
      makerId?: string;
      limit?: number;
    } = {},
  ): Promise<OfferRecord[]> {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const rows = await this.sql<OfferRow[]>`
      SELECT * FROM p2p.offers
       WHERE status = 'active'
         AND remaining_amt >= min_amt
         AND (${filter.asset ?? null}::text IS NULL OR asset = ${filter.asset ?? null})
         AND (${filter.fiatCurrency ?? null}::text IS NULL OR fiat_currency = ${filter.fiatCurrency?.toUpperCase() ?? null})
         AND (${filter.side ?? null}::text IS NULL OR side::text = ${filter.side ?? null})
         AND (${filter.makerId ?? null}::text IS NULL OR maker_id = ${filter.makerId ?? null})
       ORDER BY price ASC, created_at ASC
       LIMIT ${limit}
    `;
    return rows.map(toOffer);
  }

  async getOffer(offerId: string): Promise<OfferRecord> {
    const rows = await this.sql<OfferRow[]>`SELECT * FROM p2p.offers WHERE id = ${offerId}`;
    const row = rows[0];
    if (!row) throw new P2pError(`Offer ${offerId} not found`, 'p2p.offer_not_found');
    return toOffer(row);
  }

  /**
   * Close an offer. Open trades against it are unaffected — closing withdraws
   * the *remaining* liquidity, it does not cancel commitments already made.
   */
  async closeOffer(offerId: string, makerId: string): Promise<OfferRecord> {
    const rows = await this.sql<OfferRow[]>`
      UPDATE p2p.offers SET status = 'closed', updated_at = now()
       WHERE id = ${offerId} AND maker_id = ${makerId} AND status <> 'closed'
      RETURNING *
    `;
    if (!rows[0]) {
      const existing = await this.getOffer(offerId);
      if (existing.makerId !== makerId) throw new P2pError('Only the maker can close an offer', 'p2p.not_a_party');
      return existing;
    }
    return toOffer(rows[0]);
  }

  // ── Taking an offer → escrowLock (§6.2) ────────────────────────────────────

  /**
   * Take an offer.
   *
   * Three phases, in this order and no other:
   *
   *   A · Reserve (committed).  Bounds, liquidity and pricing are validated and
   *       the inventory is reserved under a row lock. Nothing has moved yet, so
   *       every rejection here happens **before any lock** — an over-max take,
   *       an under-min take, and the losing side of a concurrent race all fail
   *       with the seller's balance untouched.
   *
   *   B · Lock.  `escrowLock`, keyed `p2p.escrow.lock:<tradeId>`.
   *
   *   C · Advance (committed).  The trade becomes `escrowed`.
   *
   * *If this crashes exactly here, whose funds are stranded?*
   *
   *   · After A, before B — nobody's. Nothing is locked. The trade sits in
   *     `created` with a short deadline and the sweep unwinds it.
   *   · After B, before C — nobody's, but the answer is not obvious, which is
   *     why it is written down. The trade says `created` while the seller's
   *     asset is actually in escrow. The sweep re-calls `escrowLock`; it is
   *     idempotent, returns the original transaction, and the trade is then
   *     known to hold escrow and is refunded. The lock is never *guessed* at,
   *     because a wrong guess in the "it locked" direction pays the seller out
   *     of a different trade's escrow.
   */
  async takeOffer(input: {
    offerId: string;
    takerId: string;
    amount: Amount;
    method: string;
    /** Overrides the service default — e.g. after applying a rank fee discount (§4.1). */
    feeBps?: number;
    tradeId?: string;
  }): Promise<TradeRecord> {
    this.assertTradingEnabled();

    const tradeId = input.tradeId ?? crypto.randomUUID();

    return withMoneySpan(
      'p2p.takeOffer',
      { operation: 'escrow.lock', tradeId, offerId: input.offerId, amount: formatAmount(input.amount) },
      async (span) => {
        const reserved = await this.reserveTrade({ ...input, tradeId });
        span.setAttribute('intafaced.sellerId', reserved.sellerId);
        span.setAttribute('intafaced.buyerId', reserved.buyerId);
        span.setAttribute('intafaced.fiatAmount', formatAmount(reserved.fiatAmount));

        return this.ensureEscrowed(reserved.id);
      },
    );
  }

  /** Phase A — validate, price, reserve inventory, write the `created` row. */
  private async reserveTrade(input: {
    tradeId: string;
    offerId: string;
    takerId: string;
    amount: Amount;
    method: string;
    feeBps?: number;
  }): Promise<TradeRecord> {
    // Read the offer once, unlocked, purely to decide whether a reference price
    // is needed. Fetching a mark price is a network call; holding the offer's
    // row lock across it would serialise every taker behind the slowest feed.
    const preview = await this.getOffer(input.offerId);
    const referencePrice =
      preview.priceType === 'float' ? ((await this.referencePrices?.price(preview.asset, preview.fiatCurrency)) ?? null) : null;

    return transaction(
      this.sql,
      async (tx) => {
        const rows = await tx<OfferRow[]>`SELECT * FROM p2p.offers WHERE id = ${input.offerId} FOR UPDATE`;
        const row = rows[0];
        if (!row) throw new P2pError(`Offer ${input.offerId} not found`, 'p2p.offer_not_found');

        const offer = toOffer(row);
        if (offer.status !== 'active') {
          throw new P2pError(`Offer ${offer.id} is ${offer.status} and cannot be taken`, 'p2p.offer_not_active');
        }
        if (offer.makerId === input.takerId) {
          // Self-trading manufactures a completion record, and a flawless P2P
          // record raises limits platform-wide (§6.2 → §4.1).
          throw new P2pError('A maker cannot take their own offer', 'p2p.self_trade');
        }
        if (!methodAllowed(offer.methods, input.method)) {
          throw new P2pError(`Offer ${offer.id} does not accept "${input.method}"`, 'p2p.offer_method_unsupported');
        }

        // BEFORE ANY LOCK. Both bounds and the remaining liquidity, under the
        // row lock, so two concurrent takers cannot both pass the same check.
        assertWithinBounds(input.amount, { minAmt: offer.minAmt, maxAmt: offer.maxAmt, remainingAmt: offer.remainingAmt });

        const priced = quote({
          amount: input.amount,
          priceType: offer.priceType,
          price: offer.price,
          referencePrice,
          fiatCurrency: offer.fiatCurrency,
        });

        const { sellerId, buyerId } = partiesFor(offer.side, offer.makerId, input.takerId);
        const now = await txNow(tx);
        const deadlineAt = deadlineFor('created', now, this.deadlines);
        const deadlines = withDeadline({}, 'created', deadlineAt);
        const feeBps = input.feeBps ?? this.feeBps;

        await tx`
          UPDATE p2p.offers
             SET remaining_amt = remaining_amt - ${formatAmount(input.amount)}::numeric,
                 updated_at = now()
           WHERE id = ${offer.id}
        `;

        const inserted = await tx<TradeRow[]>`
          INSERT INTO p2p.p2p_trades (
            id, offer_id, taker_id, maker_id, seller_id, buyer_id, asset, fiat_currency,
            amount, price, fiat_amount, method, fee_bps, status, deadlines, deadline_at, created_at
          )
          VALUES (
            ${input.tradeId}, ${offer.id}, ${input.takerId}, ${offer.makerId}, ${sellerId}, ${buyerId},
            ${offer.asset}, ${offer.fiatCurrency},
            ${formatAmount(priced.amount)}::numeric, ${formatAmount(priced.price)}::numeric,
            ${formatAmount(priced.fiatAmount)}::numeric, ${input.method}, ${feeBps},
            'created', ${tx.json(deadlines as never)}, ${deadlineAt}, ${now}
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING *
        `;

        if (!inserted[0]) {
          // A retry of the same take. The inventory was already reserved by the
          // original, so it must not be reserved again — abort the transaction
          // rather than let the decrement above stand.
          throw new P2pError(`Trade ${input.tradeId} already exists`, 'p2p.trade_exists');
        }

        return toTrade(inserted[0]);
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  /**
   * Phase B + C — post `escrowLock` and advance the trade to `escrowed`.
   *
   * Idempotent and re-drivable from anywhere: the sweep calls it, a retry calls
   * it, and calling it on an already-escrowed trade is a no-op read.
   */
  private async ensureEscrowed(tradeId: string): Promise<TradeRecord> {
    const trade = await this.getTrade(tradeId);
    if (trade.status !== 'created') return trade;

    try {
      await this.ledger.post(
        recipes.escrowLock({
          tradeId: trade.id,
          sellerId: trade.sellerId,
          buyerId: trade.buyerId,
          assetId: trade.asset,
          amount: trade.amount,
        }),
      );
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        // DEFINITIVE. The ledger checks idempotency before it checks funds, so
        // an insufficient-funds error proves the lock has never posted — there
        // is nothing in escrow and nothing to refund. Void the trade, hand the
        // liquidity back to the offer, and let the caller see the real error.
        await this.recordDecision({
          tradeId: trade.id,
          to: 'cancelled',
          resolution: 'voided',
          reason: 'seller.escrow_lock_failed_insufficient_funds',
        });
        await this.settle(trade.id);
      }
      throw err;
    }

    // The lock is on the book. From here the trade provably holds escrow, which
    // is what makes the release and refund paths safe to reach.
    return this.advanceToEscrowed(trade.id);
  }

  private async advanceToEscrowed(tradeId: string): Promise<TradeRecord> {
    const updated = await transaction(
      this.sql,
      async (tx) => {
        const rows = await tx<TradeRow[]>`SELECT * FROM p2p.p2p_trades WHERE id = ${tradeId} FOR UPDATE`;
        const row = rows[0];
        if (!row) throw new P2pError(`Trade ${tradeId} not found`, 'p2p.trade_not_found');
        if (row.status !== 'created') return toTrade(row);

        const now = await txNow(tx);
        const deadlineAt = deadlineFor('escrowed', now, this.deadlines);
        const deadlines = withDeadline(row.deadlines ?? {}, 'escrowed', deadlineAt);

        const next = await tx<TradeRow[]>`
          UPDATE p2p.p2p_trades
             SET status = 'escrowed', escrowed_at = ${now}, deadline_at = ${deadlineAt},
                 deadlines = ${tx.json(deadlines as never)}
           WHERE id = ${tradeId} AND status = 'created'
          RETURNING *
        `;

        // Reputation counts a trade from the moment it reaches escrow. A take
        // that never locked cost the counterparty nothing and must not dilute
        // anyone's completion rate.
        await this.bumpReputation(tx, row.seller_id, 'escrowed');
        await this.bumpReputation(tx, row.buyer_id, 'escrowed');

        return toTrade(next[0] ?? row);
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );

    if (updated.status === 'escrowed' && updated.escrowedAt) {
      await this.bus.publish(
        'p2pEscrowLocked',
        {
          tradeId: updated.id,
          offerId: updated.offerId,
          sellerId: updated.sellerId,
          buyerId: updated.buyerId,
          asset: updated.asset,
          amount: formatAmount(updated.amount),
          fiatCurrency: updated.fiatCurrency,
          fiatAmount: formatAmount(updated.fiatAmount),
          paymentDeadline: (updated.deadlineAt ?? updated.escrowedAt).toISOString(),
        },
        { idempotencyKey: `p2p.escrow.lock:${updated.id}` },
      );
    }

    return updated;
  }

  // ── Buyer marks the fiat sent ──────────────────────────────────────────────

  async markFiatSent(tradeId: string, actorId: string): Promise<TradeRecord> {
    return withSpan('p2p.markFiatSent', async () =>
      transaction(
        this.sql,
        async (tx) => {
          const trade = await this.lockTrade(tx, tradeId);
          if (trade.buyerId !== actorId) {
            throw new P2pError('Only the buyer can mark the fiat as sent', 'p2p.not_the_buyer');
          }
          assertTransition(trade.status, 'fiat_sent');

          const now = await txNow(tx);
          const deadlineAt = deadlineFor('fiat_sent', now, this.deadlines);
          const deadlines = withDeadline(trade.deadlines, 'fiat_sent', deadlineAt);

          const rows = await tx<TradeRow[]>`
            UPDATE p2p.p2p_trades
               SET status = 'fiat_sent', fiat_sent_at = ${now}, deadline_at = ${deadlineAt},
                   deadlines = ${tx.json(deadlines as never)}
             WHERE id = ${tradeId} AND status = ${trade.status}
            RETURNING *
          `;
          return toTrade(rows[0]!);
        },
        { isolation: 'read committed', maxAttempts: 5 },
      ),
    );
  }

  // ── Release · refund · dispute ─────────────────────────────────────────────

  /** Seller confirms the fiat landed → `escrowRelease`. The happy path. */
  async confirmFiatReceived(tradeId: string, actorId: string): Promise<TradeRecord> {
    return withMoneySpan('p2p.release', { operation: 'escrow.release', tradeId }, async () => {
      const trade = await this.getTrade(tradeId);
      if (trade.sellerId !== actorId) {
        throw new P2pError('Only the seller can confirm the fiat was received', 'p2p.not_the_seller');
      }
      await this.recordDecision({ tradeId, to: 'released', resolution: 'released', reason: 'seller.confirmed' });
      return this.settle(tradeId);
    });
  }

  /**
   * Cancel → `escrowRefund`, in full, to the seller.
   *
   * Who may cancel, and why the rule is asymmetric:
   *   · from `escrowed`  — either party. The buyer has not claimed to have paid,
   *     so nobody is out of pocket off-platform.
   *   · from `fiat_sent` — the SELLER only. A buyer who says they have paid and
   *     can then cancel would be able to take back their claim after the seller
   *     acted on it; their route is `openDispute`. The seller cancelling here is
   *     just the seller giving the asset back, which needs no protection.
   */
  async cancelTrade(tradeId: string, actorId: string, reason = 'cancelled'): Promise<TradeRecord> {
    return withMoneySpan('p2p.cancel', { operation: 'escrow.refund', tradeId }, async () => {
      const current = await this.getTrade(tradeId);
      if (current.sellerId !== actorId && current.buyerId !== actorId) {
        throw new P2pError('Only a party to the trade can cancel it', 'p2p.not_a_party');
      }
      if (current.status === 'fiat_sent' && current.sellerId !== actorId) {
        throw new P2pError('The buyer has declared the fiat sent — open a dispute rather than cancelling', 'p2p.not_the_seller');
      }
      if (current.status === 'disputed') {
        throw new P2pError('A disputed trade is resolved by a moderator, not cancelled', 'p2p.dispute_already_open');
      }

      const actor: Actor = current.sellerId === actorId ? 'seller' : 'buyer';
      // The reason string carries the actor, so the refund event and the audit
      // trail both say who unwound the trade without a second column.
      return this.unwind(tradeId, `${actor}.${reason}`);
    });
  }

  /**
   * Refund path shared by cancel and the timeout sweep.
   *
   * Always re-drives the lock first. From `created` that is what turns "did it
   * lock?" from a guess into a fact; from `escrowed`/`fiat_sent` it is a no-op.
   */
  private async unwind(tradeId: string, reason: string): Promise<TradeRecord> {
    let trade = await this.getTrade(tradeId);

    if (trade.status === 'created') {
      try {
        trade = await this.ensureEscrowed(tradeId);
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          // ensureEscrowed already voided it — nothing was ever locked.
          return this.getTrade(tradeId);
        }
        throw err;
      }
    }

    if (!holdsEscrow(trade.status) && !isTerminal(trade.status)) {
      throw new P2pError(`Trade ${tradeId} is ${trade.status} and holds no escrow`, 'p2p.escrow_missing');
    }

    await this.recordDecision({ tradeId, to: 'cancelled', resolution: 'refunded', reason });
    return this.settle(tradeId);
  }

  async openDispute(input: {
    tradeId: string;
    openedBy: string;
    reason?: string;
    evidence?: unknown;
    disputeId?: string;
  }): Promise<DisputeRecord> {
    return withSpan('p2p.openDispute', async () => this.openDisputeInner(input, 'party'));
  }

  private async openDisputeInner(
    input: { tradeId: string; openedBy: string; reason?: string; evidence?: unknown; disputeId?: string },
    origin: 'party' | 'timeout',
  ): Promise<DisputeRecord> {
    const disputeId = input.disputeId ?? crypto.randomUUID();

    const dispute = await transaction(
      this.sql,
      async (tx) => {
        const trade = await this.lockTrade(tx, input.tradeId);

        if (origin === 'party' && trade.sellerId !== input.openedBy && trade.buyerId !== input.openedBy) {
          throw new P2pError('Only a party to the trade can open a dispute', 'p2p.not_a_party');
        }
        assertTransition(trade.status, 'disputed');

        const now = await txNow(tx);
        const deadlineAt = deadlineFor('disputed', now, this.deadlines);
        const deadlines = withDeadline(trade.deadlines, 'disputed', deadlineAt);

        const rows = await tx<DisputeRow[]>`
          INSERT INTO p2p.p2p_disputes (id, trade_id, opened_by, reason, evidence, status, deadline_at, opened_at)
          VALUES (
            ${disputeId}, ${input.tradeId}, ${input.openedBy}, ${input.reason ?? ''},
            ${tx.json((input.evidence ?? []) as never)}, 'open', ${deadlineAt}, ${now}
          )
          ON CONFLICT (trade_id) DO NOTHING
          RETURNING *
        `;

        if (!rows[0]) throw new P2pError(`Trade ${input.tradeId} already has a dispute`, 'p2p.dispute_already_open');

        await tx`
          UPDATE p2p.p2p_trades
             SET status = 'disputed', deadline_at = ${deadlineAt}, deadlines = ${tx.json(deadlines as never)}
           WHERE id = ${input.tradeId}
        `;

        await this.bumpReputation(tx, trade.sellerId, 'disputed');
        await this.bumpReputation(tx, trade.buyerId, 'disputed');

        return toDispute(rows[0]);
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );

    await this.bus.publish(
      'p2pTradeDisputed',
      {
        tradeId: dispute.tradeId,
        disputeId: dispute.id,
        openedBy: dispute.openedBy,
        reason: dispute.reason,
        moderatorDeadline: dispute.deadlineAt.toISOString(),
      },
      { idempotencyKey: `p2p.dispute:${dispute.id}` },
    );

    return dispute;
  }

  /**
   * A moderator rules. Release to the buyer, or refund the seller. There is no
   * third option and no "leave it open" — §6.2's escrow promise is that every
   * dispute terminates.
   *
   * The decision is written to `p2p_disputes` AND `p2p_trades.resolution` in one
   * committed transaction, before any ledger post. §5: the audit trail explains
   * every movement, which means the explanation must exist first.
   */
  async resolveDispute(input: {
    tradeId: string;
    moderatorId: string;
    resolution: 'release' | 'refund';
    notes?: string;
    automatic?: boolean;
  }): Promise<TradeRecord> {
    return withMoneySpan(
      'p2p.resolveDispute',
      {
        operation: input.resolution === 'release' ? 'escrow.release' : 'escrow.refund',
        tradeId: input.tradeId,
        moderatorId: input.moderatorId,
        resolution: input.resolution,
      },
      async () => {
        // ONE transaction: the moderator's ruling, the loser's record, and the
        // trade's resolution all commit together or not at all. A ruling that
        // survived without its resolution would be a decision the settlement
        // sweep could never act on.
        const disputeId = await transaction(
          this.sql,
          async (tx) => {
            const trade = await this.lockTrade(tx, input.tradeId);
            const disputes = await tx<DisputeRow[]>`
              SELECT * FROM p2p.p2p_disputes WHERE trade_id = ${input.tradeId} FOR UPDATE
            `;
            const dispute = disputes[0];
            if (!dispute) throw new P2pError(`Trade ${input.tradeId} has no dispute`, 'p2p.dispute_not_found');
            if (dispute.status === 'resolved') {
              throw new P2pError(`Dispute ${dispute.id} is already resolved`, 'p2p.dispute_already_resolved');
            }

            const to: TradeStatus = input.resolution === 'release' ? 'released' : 'cancelled';
            assertTransition(trade.status, to);

            // One reading, used for the dispute row and the trade row below, so
            // the ruling carries a single instant across both.
            const now = await txNow(tx);

            await tx`
              UPDATE p2p.p2p_disputes
                 SET status = 'resolved', moderator_id = ${input.moderatorId}, resolution = ${input.resolution},
                     resolution_notes = ${input.notes ?? null}, resolved_at = ${now}
               WHERE id = ${dispute.id}
            `;

            // The party who lost carries it on their record — the signal §6.2
            // sends into the XP graph as a negative.
            const loser = input.resolution === 'release' ? trade.sellerId : trade.buyerId;
            await this.bumpReputation(tx, loser, 'dispute_lost');

            await this.writeDecision(tx, {
              trade,
              to,
              resolution: input.resolution === 'release' ? 'released' : 'refunded',
              reason: `moderator:${input.resolution}`,
              now,
            });

            return dispute.id;
          },
          { isolation: 'read committed', maxAttempts: 5 },
        );

        // Published after the commit, never inside it: an event for a decision
        // that then rolled back is a consumer acting on something that did not
        // happen.
        await this.bus.publish(
          'p2pDisputeResolved',
          {
            disputeId,
            tradeId: input.tradeId,
            moderatorId: input.moderatorId,
            resolution: input.resolution,
            automatic: input.automatic ?? false,
            ...(input.notes ? { notes: input.notes } : {}),
          },
          { idempotencyKey: `p2p.dispute.resolved:${disputeId}` },
        );

        return this.settle(input.tradeId);
      },
    );
  }

  // ── The two phases, in detail ──────────────────────────────────────────────

  /**
   * PHASE 1 — record the decision. Committed before anything moves.
   *
   * Under the trade's row lock, so two concurrent resolutions cannot both pass
   * the transition check. The loser of that race gets `p2p.trade_terminal` and
   * posts nothing at all.
   */
  private async recordDecision(input: {
    tradeId: string;
    to: TradeStatus;
    resolution: TradeResolution;
    /** `<actor>.<what happened>` — carried onto the event and the audit trail. */
    reason: string;
  }): Promise<void> {
    await transaction(
      this.sql,
      async (tx) => {
        const trade = await this.lockTrade(tx, input.tradeId);
        assertTransition(trade.status, input.to);

        if (input.resolution !== 'voided' && !holdsEscrow(trade.status)) {
          // Releasing or refunding requires the escrow to provably exist. From
          // `created` it does not, and posting anyway would move value out of
          // the seller's pooled escrow account — value belonging to a different
          // trade.
          throw new P2pError(
            `Trade ${input.tradeId} is ${trade.status}; there is no escrow to ${input.resolution === 'released' ? 'release' : 'refund'}`,
            'p2p.escrow_missing',
          );
        }

        await this.writeDecision(tx, { trade, to: input.to, resolution: input.resolution, reason: input.reason, now: await txNow(tx) });
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  /**
   * The decision write itself, shared by the plain and the moderator paths.
   *
   * `now` must be `txNow(tx)` — `settled_at` is compared against the
   * `resolved_at` written here, so a caller that reaches for its own clock
   * reopens the skew this service cannot tolerate.
   */
  private async writeDecision(
    tx: Sql,
    args: { trade: TradeRecord; to: TradeStatus; resolution: TradeResolution; reason: string; now: Date },
  ): Promise<void> {
    const { trade, to, resolution, reason, now } = args;

    await tx`
      UPDATE p2p.p2p_trades
         SET status = ${to}, resolution = ${resolution}, resolution_reason = ${reason},
             resolved_at = ${now}, deadline_at = NULL
       WHERE id = ${trade.id} AND resolution IS NULL
    `;

    // Liquidity that never traded goes back on the board. Only for a refund or
    // a void — a released trade consumed its inventory for real.
    if (resolution !== 'released') {
      await tx`
        UPDATE p2p.offers
           SET remaining_amt = LEAST(total_amt, remaining_amt + ${formatAmount(trade.amount)}::numeric),
               updated_at = now()
         WHERE id = ${trade.offerId} AND status <> 'closed'
      `;
    }

    if (resolution === 'released') {
      const releaseSecs = trade.escrowedAt ? Math.max(0, Math.round((now.getTime() - trade.escrowedAt.getTime()) / 1000)) : 0;
      await this.bumpReputation(tx, trade.sellerId, 'completed', releaseSecs);
      await this.bumpReputation(tx, trade.buyerId, 'completed', releaseSecs);
    } else if (resolution === 'refunded') {
      await this.bumpReputation(tx, trade.sellerId, 'cancelled');
      await this.bumpReputation(tx, trade.buyerId, 'cancelled');
    }
  }

  /**
   * PHASE 2 — act on the recorded decision.
   *
   * Idempotent from end to end: the recipe is keyed on the trade id, so a
   * re-run returns the original transaction rather than moving value again, and
   * `settled_at` is only stamped once the post has succeeded. Everything
   * between the decision and this stamp is the sweeper's responsibility.
   */
  async settle(tradeId: string): Promise<TradeRecord> {
    const trade = await this.getTrade(tradeId);

    if (!trade.resolution) throw new P2pError(`Trade ${tradeId} has no recorded resolution to settle`, 'p2p.escrow_missing');
    if (trade.settledAt) return trade;

    let fee: Amount = 0n;

    if (trade.resolution === 'released') {
      fee = mulBps(trade.amount, trade.feeBps);
      await this.ledger.post(
        recipes.escrowRelease({
          tradeId: trade.id,
          sellerId: trade.sellerId,
          buyerId: trade.buyerId,
          assetId: trade.asset,
          amount: trade.amount,
          feeBps: trade.feeBps,
        }),
      );
    } else if (trade.resolution === 'refunded') {
      await this.ledger.post(
        recipes.escrowRefund({
          tradeId: trade.id,
          sellerId: trade.sellerId,
          buyerId: trade.buyerId,
          assetId: trade.asset,
          amount: trade.amount,
          resolution: trade.resolutionReason ?? 'cancelled',
        }),
      );
    }
    // `voided` posts nothing: the lock never happened, so there is nothing to
    // move. The row still terminates, which is what stops it being swept again.

    const rows = await this.sql<TradeRow[]>`
      UPDATE p2p.p2p_trades SET settled_at = now() WHERE id = ${tradeId} AND settled_at IS NULL
      RETURNING *
    `;
    const settled = rows[0] ? toTrade(rows[0]) : await this.getTrade(tradeId);

    await this.announceSettlement(settled, fee);
    return settled;
  }

  private async announceSettlement(trade: TradeRecord, fee: Amount): Promise<void> {
    const resolvedBy = resolvedByOf(trade.resolutionReason);

    if (trade.resolution === 'released') {
      const releaseSeconds =
        trade.escrowedAt && trade.resolvedAt
          ? Math.max(0, Math.round((trade.resolvedAt.getTime() - trade.escrowedAt.getTime()) / 1000))
          : 0;

      await this.bus.publish(
        'p2pEscrowReleased',
        {
          tradeId: trade.id,
          sellerId: trade.sellerId,
          buyerId: trade.buyerId,
          asset: trade.asset,
          amount: formatAmount(trade.amount),
          fee: formatAmount(fee),
          resolvedBy: resolvedBy === 'moderator' ? 'moderator' : 'seller',
          releaseSeconds,
        },
        { idempotencyKey: `p2p.escrow.release:${trade.id}` },
      );

      await this.awardXp(trade.id, trade.sellerId, 'trade.completed.seller');
      await this.awardXp(trade.id, trade.buyerId, 'trade.completed.buyer');
    } else if (trade.resolution === 'refunded') {
      await this.bus.publish(
        'p2pEscrowRefunded',
        {
          tradeId: trade.id,
          sellerId: trade.sellerId,
          buyerId: trade.buyerId,
          asset: trade.asset,
          amount: formatAmount(trade.amount),
          resolvedBy,
          reason: trade.resolutionReason ?? 'cancelled',
        },
        { idempotencyKey: `p2p.escrow.refund:${trade.id}` },
      );
    }

    // A dispute the moderator ruled against costs the loser XP. Emitted here so
    // it rides the same idempotency guarantee as the award on the winning side.
    if (trade.resolutionReason?.startsWith('moderator:')) {
      const loser = trade.resolution === 'released' ? trade.sellerId : trade.buyerId;
      await this.awardXp(trade.id, loser, 'dispute.lost');
    }
  }

  /**
   * §6.2 → §4.1: "Reputation events feed the same XP graph."
   *
   * Published, not called: svc-identity is the only writer to `rank_state`, and
   * `intafaced.identity.xp.earned` is the declared way in (§4.1). The key is a
   * business key, so a redelivered event finds the original award.
   */
  private async awardXp(tradeId: string, userId: string, action: P2pXpAction): Promise<void> {
    const xpDelta = xpFor(action, this.xpPolicy);
    if (xpDelta === 0) return;

    await this.bus.publish(
      'xpEarned',
      { userId, sourceModule: 'p2p', action, xpDelta, meta: { tradeId } },
      { idempotencyKey: xpKey(tradeId, userId, action) },
    );
  }

  // ── The sweeps — why a trade cannot sit in escrow forever ──────────────────

  /**
   * TIMEOUT SWEEP.
   *
   * Every live state carries a deadline (the database refuses one without:
   * `p2p_trades_live_has_deadline_ck`), and every deadline maps to an action
   * (`timeoutActionFor`, which is total over the status enum). So this loop is
   * the proof that no trade can sit in escrow indefinitely — there is no live
   * state it cannot pick up and no state it picks up that it leaves unchanged.
   *
   * Trades are processed one at a time and independently. One trade that fails
   * to settle must not stop the sweep reaching the next.
   */
  async sweepDeadlines(now?: Date, limit = 100): Promise<{ swept: number; failed: number }> {
    // Every `deadline_at` was derived from the server clock, so the cutoff this
    // compares them against has to come from there too. A caller may still pass
    // its own instant — that is how a test asks "what would be due at T?" — but
    // the default must not reintroduce this process' clock.
    const at = now ?? (await txNow(this.sql));

    const due = await this.sql<Array<{ id: string; status: TradeStatus }>>`
      SELECT id, status FROM p2p.p2p_trades
       WHERE deadline_at IS NOT NULL AND deadline_at <= ${at} AND resolution IS NULL
       ORDER BY deadline_at ASC
       LIMIT ${limit}
    `;

    let swept = 0;
    let failed = 0;

    for (const row of due) {
      try {
        await this.applyTimeout(row.id, row.status);
        swept++;
      } catch {
        // Left with its deadline in the past, so the next sweep retries it. A
        // trade that cannot be resolved must keep asking, not go quiet.
        failed++;
      }
    }

    return { swept, failed };
  }

  private async applyTimeout(tradeId: string, status: TradeStatus): Promise<void> {
    const action = timeoutActionFor(status);
    if (!action) return;

    switch (action) {
      case 'settle_or_void': {
        // `created` — the take never finished. Re-drive the lock so we KNOW
        // whether anything is in escrow, then unwind whatever we find.
        const result = await this.unwind(tradeId, 'timeout.escrow_incomplete');
        await this.publishExpired(tradeId, status, result.resolution === 'voided' ? 'voided' : 'refunded');
        return;
      }

      case 'refund': {
        // `escrowed` — the buyer never even claimed to have paid. The seller's
        // asset goes home in full.
        await this.unwind(tradeId, 'timeout.payment_window_elapsed');
        await this.publishExpired(tradeId, status, 'refunded');
        return;
      }

      case 'open_dispute': {
        // `fiat_sent` — the buyer says paid and the seller has not confirmed.
        // That is two people disagreeing, not a stall. Auto-releasing here would
        // hand the asset to anyone willing to click "I paid" and wait.
        await this.openDisputeInner(
          {
            tradeId,
            openedBy: (await this.getTrade(tradeId)).buyerId,
            reason: 'timeout.seller_did_not_confirm',
          },
          'timeout',
        );
        await this.publishExpired(tradeId, status, 'disputed');
        return;
      }

      case 'backstop_resolve': {
        // `disputed` — no moderator ruled within the SLA. A dispute that can
        // stay open forever is the same bug as an escrow that can stay locked
        // forever; it just has a person's name attached to the delay. So the
        // backstop decides, and the decision is attributed to a named system
        // moderator in the audit trail rather than happening anonymously.
        await this.resolveDispute({
          tradeId,
          moderatorId: this.backstopModeratorId,
          resolution: this.backstopResolution,
          notes: 'Resolved by the moderator-SLA backstop — no ruling within the dispute window',
          automatic: true,
        });
        await this.publishExpired(tradeId, status, this.backstopResolution === 'release' ? 'released' : 'refunded');
        return;
      }
    }
  }

  private async publishExpired(
    tradeId: string,
    from: TradeStatus,
    outcome: 'released' | 'refunded' | 'voided' | 'disputed',
  ): Promise<void> {
    await this.bus.publish('p2pTradeExpired', { tradeId, from, outcome }, { idempotencyKey: `p2p.trade.expired:${tradeId}:${from}` });
  }

  /**
   * SETTLEMENT SWEEP — the other half of "decide, then post".
   *
   * A trade with a recorded resolution and no `settled_at` is a decision that
   * was made but not yet acted on: the only window in which P2P value can be
   * late. This closes it, and it is self-healing because every recipe is keyed
   * on the trade id.
   */
  async sweepSettlements(limit = 100): Promise<{ settled: number; failed: number }> {
    const pending = await this.sql<Array<{ id: string }>>`
      SELECT id FROM p2p.p2p_trades
       WHERE resolved_at IS NOT NULL AND settled_at IS NULL
       ORDER BY resolved_at ASC
       LIMIT ${limit}
    `;

    let settled = 0;
    let failed = 0;

    for (const row of pending) {
      try {
        await this.settle(row.id);
        settled++;
      } catch {
        failed++;
      }
    }

    return { settled, failed };
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async getTrade(tradeId: string): Promise<TradeRecord> {
    const rows = await this.sql<TradeRow[]>`SELECT * FROM p2p.p2p_trades WHERE id = ${tradeId}`;
    const row = rows[0];
    if (!row) throw new P2pError(`Trade ${tradeId} not found`, 'p2p.trade_not_found');
    return toTrade(row);
  }

  async listTrades(userId: string, limit = 50): Promise<TradeRecord[]> {
    const rows = await this.sql<TradeRow[]>`
      SELECT * FROM p2p.p2p_trades
       WHERE seller_id = ${userId} OR buyer_id = ${userId}
       ORDER BY created_at DESC
       LIMIT ${Math.min(Math.max(limit, 1), 200)}
    `;
    return rows.map(toTrade);
  }

  async getDispute(tradeId: string): Promise<DisputeRecord> {
    const rows = await this.sql<DisputeRow[]>`SELECT * FROM p2p.p2p_disputes WHERE trade_id = ${tradeId}`;
    const row = rows[0];
    if (!row) throw new P2pError(`Trade ${tradeId} has no dispute`, 'p2p.dispute_not_found');
    return toDispute(row);
  }

  async reputationOf(userId: string): Promise<ReputationSnapshot> {
    const rows = await this.sql<
      Array<{
        trades_total: number;
        completed: number;
        cancelled: number;
        disputed: number;
        disputes_lost: number;
        total_release_secs: number;
        release_samples: number;
      }>
    >`
      SELECT trades_total, completed, cancelled, disputed, disputes_lost, total_release_secs, release_samples
        FROM p2p.p2p_reputation WHERE user_id = ${userId}
    `;

    const row = rows[0];
    // No history is an empty record, not a perfect one. Rendering an unknown
    // trader as flawless is how a fresh account borrows a merchant's trust.
    if (!row) return snapshotOf(EMPTY_COUNTERS);

    return snapshotOf({
      tradesTotal: Number(row.trades_total),
      completed: Number(row.completed),
      cancelled: Number(row.cancelled),
      disputed: Number(row.disputed),
      disputesLost: Number(row.disputes_lost),
      totalReleaseSecs: Number(row.total_release_secs),
      releaseSamples: Number(row.release_samples),
    });
  }

  /**
   * DOCTRINE §0.6, as a query.
   *
   * "How much is in P2P escrow" has two independent answers: sum the trades
   * this service believes hold escrow, and read the ledger's `escrow` accounts.
   * They must agree per (seller, asset). That they CAN be compared is the whole
   * reason value lives in the ledger and only terms live here.
   *
   * A trade that is decided but not yet settled still holds escrow — the post
   * has not happened — so it counts on this side too.
   */
  async escrowIntegrity(): Promise<
    { ok: true } | { ok: false; drift: Array<{ sellerId: string; asset: string; expected: string; actual: string }> }
  > {
    // Per-trade pots (L3-4). Aggregate-by-seller would hide cross-trade theft.
    const rows = await this.sql<Array<{ id: string; seller_id: string; asset: string; amount: string }>>`
      SELECT id, seller_id, asset, amount
        FROM p2p.p2p_trades
       WHERE status IN ('escrowed', 'fiat_sent', 'disputed')
          OR (resolution IN ('released', 'refunded') AND settled_at IS NULL)
    `;

    const bySeller = new Map<string, { expected: bigint; actual: bigint; sellerId: string; asset: string }>();

    for (const row of rows) {
      const key = `${row.seller_id}\0${row.asset}`;
      const expectedPart = parseAmount(row.amount);
      const actualPart = (await this.ledger.balance(tradeEscrowAccount(row.seller_id, row.asset, row.id))).amount;
      const cur = bySeller.get(key) ?? { expected: 0n, actual: 0n, sellerId: row.seller_id, asset: row.asset };
      cur.expected += expectedPart;
      cur.actual += actualPart;
      bySeller.set(key, cur);
    }

    const drift: Array<{ sellerId: string; asset: string; expected: string; actual: string }> = [];
    for (const row of bySeller.values()) {
      if (row.expected !== row.actual) {
        drift.push({
          sellerId: row.sellerId,
          asset: row.asset,
          expected: formatAmount(row.expected),
          actual: formatAmount(row.actual),
        });
      }
    }

    return drift.length === 0 ? { ok: true } : { ok: false, drift };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private assertTradingEnabled(): void {
    if (!this.tradingEnabled) {
      throw new P2pError('P2P trading is disabled by the operator kill-switch', 'p2p.trading_disabled');
    }
  }

  private async lockTrade(tx: Sql, tradeId: string): Promise<TradeRecord> {
    const rows = await tx<TradeRow[]>`SELECT * FROM p2p.p2p_trades WHERE id = ${tradeId} FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new P2pError(`Trade ${tradeId} not found`, 'p2p.trade_not_found');
    return toTrade(row);
  }

  /**
   * Reputation counters, updated inside the caller's transaction.
   *
   * Read-modify-write under the trade's row lock rather than a bare UPDATE …
   * SET x = x + 1, because the badge set and the completion rate are derived
   * from the whole row and must be recomputed from the post-increment values,
   * not from whatever a second statement would read back.
   */
  private async bumpReputation(tx: Sql, userId: string, outcome: TradeOutcome, releaseSecs?: number): Promise<void> {
    const rows = await tx<
      Array<{
        trades_total: number;
        completed: number;
        cancelled: number;
        disputed: number;
        disputes_lost: number;
        total_release_secs: number;
        release_samples: number;
      }>
    >`
      SELECT trades_total, completed, cancelled, disputed, disputes_lost, total_release_secs, release_samples
        FROM p2p.p2p_reputation WHERE user_id = ${userId} FOR UPDATE
    `;

    const current: ReputationCounters = rows[0]
      ? {
          tradesTotal: Number(rows[0].trades_total),
          completed: Number(rows[0].completed),
          cancelled: Number(rows[0].cancelled),
          disputed: Number(rows[0].disputed),
          disputesLost: Number(rows[0].disputes_lost),
          totalReleaseSecs: Number(rows[0].total_release_secs),
          releaseSamples: Number(rows[0].release_samples),
        }
      : EMPTY_COUNTERS;

    const next = snapshotOf(applyOutcome(current, outcome, releaseSecs));

    await tx`
      INSERT INTO p2p.p2p_reputation (
        user_id, trades_total, completed, cancelled, disputed, disputes_lost,
        completion_rate, total_release_secs, release_samples, avg_release_secs, badges, updated_at
      )
      VALUES (
        ${userId}, ${next.tradesTotal}, ${next.completed}, ${next.cancelled}, ${next.disputed}, ${next.disputesLost},
        ${next.completionRate}, ${next.totalReleaseSecs}, ${next.releaseSamples}, ${next.avgReleaseSecs},
        ${toPgTextArray(next.badges)}::text[], now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        trades_total = EXCLUDED.trades_total,
        completed = EXCLUDED.completed,
        cancelled = EXCLUDED.cancelled,
        disputed = EXCLUDED.disputed,
        disputes_lost = EXCLUDED.disputes_lost,
        completion_rate = EXCLUDED.completion_rate,
        total_release_secs = EXCLUDED.total_release_secs,
        release_samples = EXCLUDED.release_samples,
        avg_release_secs = EXCLUDED.avg_release_secs,
        badges = EXCLUDED.badges,
        updated_at = now()
    `;
  }
}

// ── Row mapping ──────────────────────────────────────────────────────────────

function toOffer(row: OfferRow): OfferRecord {
  return {
    id: row.id,
    makerId: row.maker_id,
    side: row.side,
    asset: row.asset,
    fiatCurrency: row.fiat_currency,
    priceType: row.price_type,
    price: parseAmount(row.price),
    minAmt: parseAmount(row.min_amt),
    maxAmt: parseAmount(row.max_amt),
    totalAmt: parseAmount(row.total_amt),
    remainingAmt: parseAmount(row.remaining_amt),
    methods: Array.isArray(row.methods) ? row.methods : [],
    terms: row.terms,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toTrade(row: TradeRow): TradeRecord {
  return {
    id: row.id,
    offerId: row.offer_id,
    takerId: row.taker_id,
    makerId: row.maker_id,
    sellerId: row.seller_id,
    buyerId: row.buyer_id,
    asset: row.asset,
    fiatCurrency: row.fiat_currency,
    amount: parseAmount(row.amount),
    price: parseAmount(row.price),
    fiatAmount: parseAmount(row.fiat_amount),
    method: row.method,
    feeBps: Number(row.fee_bps),
    status: row.status,
    resolution: row.resolution,
    resolutionReason: row.resolution_reason,
    deadlines: (row.deadlines ?? {}) as Deadlines,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    escrowedAt: row.escrowed_at,
    fiatSentAt: row.fiat_sent_at,
    resolvedAt: row.resolved_at,
    settledAt: row.settled_at,
  };
}

function toDispute(row: DisputeRow): DisputeRecord {
  return {
    id: row.id,
    tradeId: row.trade_id,
    openedBy: row.opened_by,
    reason: row.reason,
    evidence: row.evidence,
    moderatorId: row.moderator_id,
    resolution: row.resolution,
    resolutionNotes: row.resolution_notes,
    status: row.status,
    deadlineAt: row.deadline_at,
    openedAt: row.opened_at,
    resolvedAt: row.resolved_at,
  };
}

function methodAllowed(methods: unknown[], method: string): boolean {
  // An offer with no declared methods accepts anything — the maker's terms text
  // is the contract in that case. An offer WITH methods accepts only those.
  if (methods.length === 0) return true;
  return methods.some((m) => {
    if (typeof m === 'string') return m === method;
    if (m && typeof m === 'object' && 'id' in m) return (m as { id: unknown }).id === method;
    return false;
  });
}

/**
 * Badges as a Postgres array literal.
 *
 * Sent as a string with an explicit `::text[]` cast rather than as a JS array:
 * the driver infers an array's element type from its first element, and the
 * common case here — a new trader with no badges yet — has no first element.
 */
function toPgTextArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/(["\\])/g, '\\$1')}"`).join(',')}}`;
}

function resolvedByOf(reason: string | null): 'buyer' | 'seller' | 'moderator' | 'timeout' {
  if (!reason) return 'seller';
  if (reason.startsWith('moderator:')) return 'moderator';
  if (reason.startsWith('timeout.')) return 'timeout';
  if (reason.startsWith('buyer')) return 'buyer';
  return 'seller';
}

export { TradeStateError, PricingError };
