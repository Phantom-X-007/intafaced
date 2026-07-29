import { div, formatAmount, mul, mulBps, parseAmount, sub, type Amount } from '@intafaced/ledger-client';
import { TradeError, type OrderSide } from '../spot/types.js';

/**
 * CONVERT QUOTE MATH (§5.2 — "RFQ against internal book + spread").
 *
 * Pure. No I/O. Walks a depth ladder the way a one-tap retail convert actually
 * fills: take liquidity level by level until the base quantity is covered, then
 * worsen the average by a published house convert spread so the quote is never
 * better than what the book can deliver.
 *
 * Amounts are scaled bigints. The only JSON numbers a caller ever sees are
 * integer bps and timestamps — never money.
 */

export type DepthLevel = readonly [price: string, size: string];

export interface ConvertQuoteInput {
  side: OrderSide;
  /** Base quantity the user wants to convert (buy or sell). */
  qty: Amount;
  /** Top-of-book first. Buy walks asks; sell walks bids. */
  levels: readonly DepthLevel[];
  /**
   * Extra house edge on top of the book, in bps of the filled notional.
   * Applied against the user: buys pay more, sells receive less.
   */
  convertSpreadBps: number;
  /** Market tick — used only to keep reported prices on-grid after the spread. */
  tickSize: Amount;
}

export interface ConvertQuoteResult {
  /** Base quantity that can be filled against the visible book. */
  filledQty: Amount;
  /** Quote asset notional at the book before house spread. */
  bookNotional: Amount;
  /** Quote asset the user pays (buy) or receives (sell) after house spread. */
  userNotional: Amount;
  /** Volume-weighted average price the user sees after spread. */
  avgPrice: Amount;
  fullyFilled: boolean;
}

function parseLevel(level: DepthLevel): { price: Amount; size: Amount } {
  const price = parseAmount(level[0]);
  const size = parseAmount(level[1]);
  if (price <= 0n || size <= 0n) {
    throw new TradeError('depth level must have positive price and size', 'trade.convert_bad_depth');
  }
  return { price, size };
}

/**
 * Floor/ceil a price onto the tick grid after a spread adjustment.
 * Buys round UP (user never underfunded); sells round DOWN (user never over-credited).
 */
export function snapToTick(price: Amount, tickSize: Amount, side: OrderSide): Amount {
  if (tickSize <= 0n) return price;
  const rem = price % tickSize;
  if (rem === 0n) return price;
  if (side === 'buy') return price + (tickSize - rem);
  return price - rem;
}

/**
 * Walk the book for `qty` base units and apply the convert spread.
 */
export function estimateConvert(input: ConvertQuoteInput): ConvertQuoteResult {
  if (input.qty <= 0n) {
    throw new TradeError('convert quantity must be strictly positive', 'trade.convert_invalid_qty');
  }
  if (input.convertSpreadBps < 0 || input.convertSpreadBps > 5000) {
    throw new TradeError('convert spread bps out of range', 'trade.convert_bad_spread');
  }
  if (input.levels.length === 0) {
    throw new TradeError('no liquidity to quote against', 'trade.convert_no_liquidity');
  }

  let remaining = input.qty;
  let bookNotional = 0n;
  let filledQty = 0n;

  for (const level of input.levels) {
    if (remaining === 0n) break;
    const { price, size } = parseLevel(level);
    const take = size < remaining ? size : remaining;
    // Notional floors the way tradeFill does — never invent wei the book did not offer.
    bookNotional += mul(price, take, 'floor');
    filledQty += take;
    remaining -= take;
  }

  if (filledQty === 0n) {
    throw new TradeError('no liquidity to quote against', 'trade.convert_no_liquidity');
  }

  const spread = mulBps(bookNotional, input.convertSpreadBps, 'ceil');
  const userNotional =
    input.side === 'buy' ? bookNotional + spread : bookNotional > spread ? sub(bookNotional, spread) : 0n;

  if (userNotional <= 0n) {
    throw new TradeError('convert spread consumes the entire fill', 'trade.convert_spread_too_high');
  }

  // VWAP after spread: both legs are SCALE-fixed; use money div (not raw bigint).
  const rawAvg = div(userNotional, filledQty, input.side === 'buy' ? 'ceil' : 'floor');
  const avgPrice = snapToTick(rawAvg, input.tickSize, input.side);

  return {
    filledQty,
    bookNotional,
    userNotional,
    avgPrice,
    fullyFilled: remaining === 0n,
  };
}

/** Present a quote for the wire (decimal strings only for money). */
export function presentConvertQuote(q: ConvertQuoteResult, extra: {
  symbol: string;
  side: OrderSide;
  requestedQty: Amount;
  convertSpreadBps: number;
  expiresAt: string;
}) {
  return {
    symbol: extra.symbol,
    side: extra.side,
    requestedQty: formatAmount(extra.requestedQty),
    filledQty: formatAmount(q.filledQty),
    bookNotional: formatAmount(q.bookNotional),
    userNotional: formatAmount(q.userNotional),
    avgPrice: formatAmount(q.avgPrice),
    fullyFilled: q.fullyFilled,
    convertSpreadBps: extra.convertSpreadBps,
    expiresAt: extra.expiresAt,
  };
}
