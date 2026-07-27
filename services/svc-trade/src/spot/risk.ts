import { formatAmount, mul, mulBps, type Amount } from '@intafaced/ledger-client';
import { TradeError, type Market, type OrderSide, type OrderType } from './types.js';

/**
 * RISK CHECKS — §5.2 step 1, and the reason step 2 can be trusted.
 *
 * Pure functions of (market, request). No I/O, no clock, no database. That is
 * not decoration: these run BEFORE any value moves, and a check that needed a
 * network call would be a check that can be skipped by a timeout.
 *
 * What is checked here, and why each one is a money question rather than a
 * validation nicety:
 *
 *   · market status  — a halted market must not accept new holds, because the
 *                      funds would sit locked behind a book nobody is matching.
 *   · lot / tick     — the engine matches on exact bigint equality of price
 *                      levels. An off-grid price makes a level nobody else can
 *                      ever meet, so the order rests forever holding funds.
 *   · size limits    — the floor keeps a fill's quote amount above one wei (the
 *                      ledger refuses to post a movement of nothing); the
 *                      ceiling is the per-order blast radius.
 *   · min notional   — same floor, expressed the way a trader thinks about it.
 */

/** Order types this PR accepts. */
const SUPPORTED_TYPES: ReadonlySet<string> = new Set<OrderType>(['market', 'limit']);

export function assertTradable(market: Market): void {
  if (market.kind !== 'spot') {
    throw new TradeError(
      `${market.symbol} is a ${market.kind} market — this service serves trade.spot only`,
      'trade.market_kind_unsupported',
    );
  }
  if (market.status !== 'active') {
    throw new TradeError(`${market.symbol} is ${market.status}, not accepting orders`, 'trade.market_not_tradable');
  }
}

/**
 * SOCKET §13 — stop and take-profit orders.
 *
 * The engine already matches `stop` and `stop_limit`, and the public contract
 * already carries `take_profit`. They are refused here because funding them
 * honestly is not solved: a stop BUY has no price until it triggers, possibly
 * days later, so either it is funded at submission against a price nobody can
 * predict, or it reaches the engine unfunded — and an unfunded order in the
 * book is the one thing this whole design exists to prevent. The fix is a
 * trigger-time funding callback from the engine, which is a change to
 * svc-matching's contract and therefore its own PR (§15.2).
 */
export function requireSupportedType(type: string): OrderType {
  if (!SUPPORTED_TYPES.has(type)) {
    throw new TradeError(`order type "${type}" is not accepted on spot markets yet`, 'trade.order_type_unsupported');
  }
  return type as OrderType;
}

/** Quantity must sit exactly on the lot grid and inside the market's bounds. */
export function assertQty(market: Market, qty: Amount): void {
  if (qty <= 0n) {
    throw new TradeError('quantity must be strictly positive', 'trade.invalid_qty');
  }
  if (qty % market.lotSize !== 0n) {
    throw new TradeError(`quantity must be a multiple of the ${formatAmount(market.lotSize)} lot size`, 'trade.invalid_qty');
  }
  if (qty < market.minQty) {
    throw new TradeError(`quantity is below the ${formatAmount(market.minQty)} minimum`, 'trade.invalid_qty');
  }
  if (market.maxQty !== null && qty > market.maxQty) {
    throw new TradeError(`quantity is above the ${formatAmount(market.maxQty)} maximum`, 'trade.invalid_qty');
  }
}

/** Price must sit exactly on the tick grid. */
export function assertPrice(market: Market, price: Amount): void {
  if (price <= 0n) {
    throw new TradeError('price must be strictly positive', 'trade.invalid_price');
  }
  if (price % market.tickSize !== 0n) {
    throw new TradeError(`price must be a multiple of the ${formatAmount(market.tickSize)} tick size`, 'trade.invalid_price');
  }
}

/**
 * Order value must clear the market's floor.
 *
 * Floored, matching how a fill's quote amount is computed. Checking with a
 * different rounding mode to the one that settles would let an order pass here
 * and produce a sub-minimum fill.
 */
export function assertNotional(market: Market, price: Amount, qty: Amount): void {
  const notional = mul(price, qty, 'floor');
  if (notional < market.minNotional) {
    throw new TradeError(
      `order value ${formatAmount(notional)} ${market.quoteAsset} is below the ${formatAmount(market.minNotional)} minimum`,
      'trade.below_min_notional',
    );
  }
}

/**
 * THE HOLD.
 *
 * "quote for buys, base for sells" (§5.2 step 2). For a buy the amount is
 * rounded UP: a hold that is a wei short is a fill the ledger will refuse at
 * settlement time, and a refused settlement is a match the engine has already
 * printed and the book has already moved on from.
 *
 * The ceiling is safe against the other direction too. Every fill's quote
 * amount is FLOORED (`mul(price, qty, 'floor')`), and a floored sum of parts
 * can never exceed the ceiling of the whole, so a partially filled order can
 * never consume more hold than it was given. The leftover wei is released with
 * the remainder when the order reaches a terminal state — it is not left behind
 * (see `releasableHold` in trade-service.ts).
 */
export function holdFor(market: Market, side: OrderSide, price: Amount, qty: Amount): { assetId: string; amount: Amount } {
  return side === 'buy' ? { assetId: market.quoteAsset, amount: mul(price, qty, 'ceil') } : { assetId: market.baseAsset, amount: qty };
}

/**
 * The price a market BUY is funded and submitted at.
 *
 * A market order carries no price, so there is no honest amount to hold for it
 * until one is chosen. The choice is the best ask plus a slippage cap, rounded
 * UP to the tick grid, and the order is then sent to the engine as a marketable
 * IOC *limit* at exactly this price. The engine therefore cannot fill it above
 * what was held — the funding invariant survives even if the book moves between
 * this read and the submission, because a book that moved up simply fills less.
 *
 * A market SELL needs none of this: it holds base quantity, which is known
 * exactly whatever the price does.
 */
export function protectionPriceFor(market: Market, bestAsk: Amount | null, slippageCapBps: number): Amount {
  if (bestAsk === null || bestAsk <= 0n) {
    throw new TradeError(`${market.symbol} has no ask to price a market buy against — place a limit order`, 'trade.no_reference_price');
  }

  const capped = bestAsk + mulBps(bestAsk, slippageCapBps, 'ceil');
  const remainder = capped % market.tickSize;
  return remainder === 0n ? capped : capped + (market.tickSize - remainder);
}
