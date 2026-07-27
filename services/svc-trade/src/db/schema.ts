import { index, integer, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, bps, createdAt, tstz, updatedAt } from '@intafaced/db';

/**
 * THE PRODUCT LAYER (§5.2).
 *
 * What is listed, what was ordered, what was matched. THIS SERVICE'S SCHEMA
 * ONLY — svc-matching owns the book, svc-ledger owns the balances, and neither
 * is reachable from here except through its API.
 *
 * Doctrine §0.6 is the rule that shapes every column below: **this service
 * holds no balances.** `orders.filled_qty` is order state measured in the base
 * asset, not money. `orders.hold_amount` is an immutable record of the ledger
 * post that funded the order — it is written once and never mutated, in the
 * same spirit as `token.stakes.amount`. There is deliberately no
 * `released_amount`, no `available`, and no running total anywhere: the
 * remainder owed back to a user is *derived* (`hold_amount - Σ fills`), so
 * there is nothing here that could drift away from the ledger.
 *
 * Scope of this migration is `trade.spot`. §5.2 also specifies `positions`,
 * `funding_rates`, `insurance_fund`, `copy_leaders`, `copy_follows` and
 * `otc_quotes` — those belong to `trade.futures`, `trade.copy` and `trade.otc`,
 * which are separate tracker features with their own PRs. The `kind` enum
 * already carries their values so listing a futures market later is a row, not
 * a migration.
 */
export const trade = pgSchema('trade');

/** §5.2 `markets.kind`. Only `spot` is served in this PR; the others are listed states. */
export const marketKindEnum = trade.enum('market_kind', ['spot', 'futures', 'options']);

/**
 * Market lifecycle.
 *
 * `halted` is a distinct state from `delisted`, not a flag: a halted market
 * still has live orders and open holds that must be cancellable, while a
 * delisted one must have none. Collapsing them would make "can this order be
 * cancelled" ambiguous at exactly the moment an operator needs it not to be.
 */
export const marketStatusEnum = trade.enum('market_status', ['pending', 'active', 'halted', 'delisted']);

export const orderSideEnum = trade.enum('order_side', ['buy', 'sell']);

/**
 * Order types this service accepts. `stop`, `stop_limit` and `take_profit`
 * exist in `@intafaced/exchange-contract` and in the engine, but are not
 * accepted here — see the SOCKET §13 note in `spot/risk.ts`.
 */
export const orderTypeEnum = trade.enum('order_type', ['market', 'limit']);

export const timeInForceEnum = trade.enum('time_in_force', ['GTC', 'IOC', 'FOK', 'PO']);

/**
 * Order status.
 *
 * `pending` is the state an order occupies between "row written" and "funds
 * held". It exists so that a crash in that window strands nothing: a pending
 * row has no ledger post behind it and no engine presence, so the only correct
 * recovery — delete it — is also the only thing it can do. Every other status
 * implies a hold that is either live or provably released.
 */
export const orderStatusEnum = trade.enum('order_status', ['pending', 'open', 'filled', 'cancelled', 'rejected', 'expired']);

/** Which side of the match a fill leg was. Fee rates differ, so it is stored, not inferred. */
export const liquidityEnum = trade.enum('liquidity', ['maker', 'taker']);

/**
 * A listed market (§5.2).
 *
 * `maker_bps` / `taker_bps` are the *published* rates. What a given user
 * actually pays is these minus their rank's `feeDiscountBps`, resolved once per
 * order and snapshotted on the order row — never re-read at fill time.
 */
export const markets = trade.table(
  'markets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** CCXT unified symbol, e.g. `BTC/USDT`. The id integrators actually use. */
    symbol: text('symbol').notNull(),
    baseAsset: text('base_asset').notNull(),
    quoteAsset: text('quote_asset').notNull(),
    kind: marketKindEnum('kind').notNull().default('spot'),
    /** Minimum price increment. A price that is not a multiple of it is rejected. */
    tickSize: amount('tick_size').notNull(),
    /** Minimum quantity increment. */
    lotSize: amount('lot_size').notNull(),
    /** §5.2 "size limits by rank/KYC tier" — the market's own floor and ceiling. */
    minQty: amount('min_qty').notNull(),
    /** NULL = no per-order ceiling. */
    maxQty: amount('max_qty'),
    /**
     * Smallest order value in the quote asset. This is what stops a fill whose
     * quote amount rounds to zero from ever being possible, which the ledger
     * would refuse to post (a movement of nothing is not a movement).
     */
    minNotional: amount('min_notional').notNull(),
    status: marketStatusEnum('status').notNull().default('pending'),
    makerBps: bps('maker_bps').notNull(),
    takerBps: bps('taker_bps').notNull(),
    listedAt: tstz('listed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** One market per symbol, ever. Two `BTC/USDT` rows would be two books. */
    uniqueIndex('markets_symbol_idx').on(t.symbol),
    index('markets_status_idx').on(t.status),
    index('markets_pair_idx').on(t.baseAsset, t.quoteAsset),
  ],
);

/**
 * An order (§5.2).
 *
 * The row is written *before* the ledger hold and *before* the engine sees it,
 * in `pending`. Read `spot/trade-service.ts` for why that ordering is the one
 * that strands nothing.
 */
export const orders = trade.table(
  'orders',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    /**
     * §4.1 sub-accounts. Recorded for reporting only: the ledger's hold and the
     * fill settlement are at USER level, because that is the owner the
     * `orderHold` / `tradeFill` recipes name. A sub-account is a reporting
     * dimension here, not a separate pot of money.
     */
    subAccountId: uuid('sub_account_id'),
    marketId: uuid('market_id')
      .notNull()
      .references(() => markets.id),
    /**
     * Caller-supplied idempotency key. The order id is *derived* from it, so a
     * retry lands on the same row and therefore the same `order.hold:<id>`
     * ledger key. Bots retry; a retry must not open a second position.
     */
    clientOrderId: text('client_order_id'),
    side: orderSideEnum('side').notNull(),
    type: orderTypeEnum('type').notNull(),
    /** NULL for market orders. */
    price: amount('price'),
    qty: amount('qty').notNull(),
    /**
     * Base quantity matched so far. ORDER STATE, NOT MONEY — it is denominated
     * in the base asset but it is not a balance, and no value is derived from
     * it. It must always equal `SUM(fills.qty)` for this order; a test asserts
     * exactly that, which is only possible because the truth is the fills.
     */
    filledQty: amount('filled_qty').notNull().default('0'),
    status: orderStatusEnum('status').notNull().default('pending'),
    tif: timeInForceEnum('tif').notNull().default('GTC'),
    /** Quote for a buy, base for a sell (§5.2 step 2). */
    holdAsset: text('hold_asset').notNull(),
    /**
     * Exactly what `orderHold` posted. Immutable after the hold succeeds — the
     * amount still owed back is `hold_amount - Σ fills.<consumed>`, computed
     * on demand rather than decremented, so it cannot drift.
     */
    holdAmount: amount('hold_amount').notNull(),
    /**
     * The rank perk applied to this order's fees, snapshotted at placement.
     *
     * Snapshotted rather than read at fill time for the same reason
     * `token.stakes.multiplier_bps` is: a rank change must not retroactively
     * re-price an order that was already accepted on the old terms. It also
     * means the fill path makes no network call, which is what keeps a fill
     * settleable when svc-identity is down.
     */
    feeDiscountBps: bps('fee_discount_bps').notNull().default('0'),
    /**
     * The protection price a market BUY was submitted at. A market buy is
     * funded before it is matched, so it is sent to the engine as a marketable
     * IOC limit at this price — the engine then physically cannot fill it above
     * what was held. NULL for every other order.
     */
    protectionPrice: amount('protection_price'),
    /** Engine acceptance sequence — ties an order to the matching journal. */
    engineSequence: integer('engine_sequence'),
    /** Engine reject code (`post_only_would_cross`, `fok_unfillable`, …). */
    rejectCode: text('reject_code'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /**
     * THE RETRY GUARD. One order per (user, market, client id). The derived
     * order id makes this almost redundant — which is the point: the database
     * refuses a double even if the derivation is ever changed.
     */
    uniqueIndex('orders_client_id_idx').on(t.userId, t.marketId, t.clientOrderId),
    /** `fetchOpenOrders` — the hot read path for every terminal and bot. */
    index('orders_user_status_idx').on(t.userId, t.status),
    index('orders_market_status_idx').on(t.marketId, t.status),
    index('orders_created_idx').on(t.createdAt),
  ],
);

/**
 * One leg of one match (§5.2).
 *
 * Two rows per fill — the maker's and the taker's — because each side has its
 * own fee, its own asset received, and its own tax record. The ledger post is
 * ONE transaction covering both legs (`tradeFill` is six entries, atomic); the
 * two rows here are the reporting projection of it, not two settlements.
 */
export const fills = trade.table(
  'fills',
  {
    /** Derived from (market, engine sequence, role) — never random. */
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    /** The other side's order. Not a FK: the counterparty's row is equally real, but the engine is the authority on the pairing. */
    counterOrderId: uuid('counter_order_id').notNull(),
    marketId: uuid('market_id')
      .notNull()
      .references(() => markets.id),
    userId: uuid('user_id').notNull(),
    side: orderSideEnum('side').notNull(),
    liquidity: liquidityEnum('liquidity').notNull(),
    price: amount('price').notNull(),
    qty: amount('qty').notNull(),
    /**
     * price x qty, floored, in the quote asset.
     *
     * Stored rather than recomputed because it is what the ledger actually
     * moved. Recomputing it later with a different rounding mode would produce
     * a number that disagrees with the book by a wei, and "the report disagrees
     * with the ledger" is not a rounding question, it is an incident.
     */
    quoteAmount: amount('quote_amount').notNull(),
    /** The asset the fee was taken in — whatever this side RECEIVED. */
    feeAsset: text('fee_asset').notNull(),
    feeAmount: amount('fee_amount').notNull(),
    /** Effective rate after the rank discount. Stored so a fee is explicable years later. */
    feeBps: bps('fee_bps').notNull(),
    /** Engine sequence. One match, one sequence, forever. */
    sequence: integer('sequence').notNull(),
    ts: tstz('ts').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    /** A match settles once per side. The engine sequence is the business key. */
    uniqueIndex('fills_market_sequence_role_idx').on(t.marketId, t.sequence, t.liquidity),
    index('fills_order_idx').on(t.orderId),
    index('fills_user_ts_idx').on(t.userId, t.ts),
    index('fills_market_ts_idx').on(t.marketId, t.ts),
  ],
);

export const schema = { markets, orders, fills };
