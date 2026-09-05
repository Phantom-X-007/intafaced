import { div, formatAmount, mul, mulBps, parseAmount, sub, type Amount } from '@intafaced/ledger-client';
import { TradeError, type OrderSide } from '../spot/types.js';

/**
 * CONVERT QUOTE MATH — book is the *source*, not the trade.
 *
 * Walks visible depth to observe a reference, then worsens the average by a
 * published house convert spread. Accept settles those exact decimal amounts
 * against house inventory (ledger-client), never a matching-engine order.
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
   * Unset / non-integer refuses — never invent 10.
   */
  convertSpreadBps: number | null | undefined;
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

/** Book-referenced observation that priced the quote. Never invented. */
export interface ConvertSource {
  readonly kind: 'book';
  readonly symbol: string;
  readonly asOf: string;
}

export interface FirmConvertQuote {
  readonly quoteId: string;
  readonly userId: string;
  readonly symbol: string;
  readonly marketId: string;
  readonly side: OrderSide;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly inAsset: string;
  readonly outAsset: string;
  readonly inAmount: Amount;
  readonly outAmount: Amount;
  readonly requestedQty: Amount;
  readonly filledQty: Amount;
  readonly bookNotional: Amount;
  readonly userNotional: Amount;
  readonly avgPrice: Amount;
  readonly convertSpreadBps: number;
  readonly fullyFilled: boolean;
  readonly source: ConvertSource;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface BoundConvertFill {
  readonly quote: FirmConvertQuote;
  readonly fillPrice: Amount;
  readonly fillNotional: Amount;
  readonly acceptedAt: string;
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
 * Owner convert spread. Blank / unset / non-integer refuses — never invent 10.
 * Out of 0–5000 is `trade.convert_bad_spread` (published but illegal).
 */
export function requireConvertSpreadBps(convertSpreadBps: number | null | undefined): number {
  if (convertSpreadBps == null || !Number.isInteger(convertSpreadBps)) {
    throw new TradeError(
      'TRADE_CONVERT_SPREAD_BPS is unset or not an integer — refuse rather than invent a convert spread',
      'trade.convert_spread_unset',
    );
  }
  if (convertSpreadBps < 0 || convertSpreadBps > 5000) {
    throw new TradeError('convert spread bps out of range', 'trade.convert_bad_spread');
  }
  return convertSpreadBps;
}

/**
 * Owner convert quote TTL (ms). Blank / unset / non-integer / non-positive
 * refuses — never invent 15000. Owner may publish 15000 explicitly.
 */
export function requireConvertQuoteTtlMs(convertQuoteTtlMs: number | null | undefined): number {
  if (convertQuoteTtlMs == null || !Number.isInteger(convertQuoteTtlMs) || convertQuoteTtlMs < 1) {
    throw new TradeError(
      'TRADE_CONVERT_QUOTE_TTL_MS is unset or not a positive integer — refuse rather than invent 15000',
      'trade.convert_quote_ttl_unset',
    );
  }
  return convertQuoteTtlMs;
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
  const convertSpreadBps = requireConvertSpreadBps(input.convertSpreadBps);
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

  const spread = mulBps(bookNotional, convertSpreadBps, 'ceil');
  const userNotional = input.side === 'buy' ? bookNotional + spread : bookNotional > spread ? sub(bookNotional, spread) : 0n;

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

export function legsForConvert(side: OrderSide, baseAsset: string, quoteAsset: string, filledQty: Amount, userNotional: Amount) {
  if (side === 'buy') {
    return { inAsset: quoteAsset, outAsset: baseAsset, inAmount: userNotional, outAmount: filledQty };
  }
  return { inAsset: baseAsset, outAsset: quoteAsset, inAmount: filledQty, outAmount: userNotional };
}

export function assertFirmConvertQuote(q: FirmConvertQuote): void {
  if (!q.quoteId.trim()) {
    throw new TradeError('convert quote id is required — refuse rather than invent', 'trade.convert_quote_missing');
  }
  if (!q.expiresAt.trim()) {
    throw new TradeError('convert quote expiry is required — refuse rather than invent', 'trade.convert_expiry_missing');
  }
  if (!q.source?.kind || q.source.kind !== 'book' || !q.source.asOf.trim() || !q.source.symbol.trim()) {
    throw new TradeError('convert quote source is required — refuse rather than invent a mid', 'trade.convert_source_missing');
  }
  if (q.inAmount <= 0n || q.outAmount <= 0n || q.filledQty <= 0n || q.userNotional <= 0n) {
    throw new TradeError('convert quote amounts are required — refuse rather than invent', 'trade.convert_amounts_missing');
  }
}

export function buildFirmConvertQuote(input: {
  quoteId: string;
  userId: string;
  symbol: string;
  marketId: string;
  side: OrderSide;
  baseAsset: string;
  quoteAsset: string;
  requestedQty: Amount;
  estimate: ConvertQuoteResult;
  convertSpreadBps: number;
  source: ConvertSource;
  now: Date;
  quoteTtlMs: number | null | undefined;
}): FirmConvertQuote {
  const quoteTtlMs = requireConvertQuoteTtlMs(input.quoteTtlMs);
  const legs = legsForConvert(input.side, input.baseAsset, input.quoteAsset, input.estimate.filledQty, input.estimate.userNotional);
  const quote: FirmConvertQuote = {
    quoteId: input.quoteId,
    userId: input.userId,
    symbol: input.symbol,
    marketId: input.marketId,
    side: input.side,
    baseAsset: input.baseAsset,
    quoteAsset: input.quoteAsset,
    ...legs,
    requestedQty: input.requestedQty,
    filledQty: input.estimate.filledQty,
    bookNotional: input.estimate.bookNotional,
    userNotional: input.estimate.userNotional,
    avgPrice: input.estimate.avgPrice,
    convertSpreadBps: input.convertSpreadBps,
    fullyFilled: input.estimate.fullyFilled,
    source: input.source,
    createdAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + quoteTtlMs).toISOString(),
  };
  assertFirmConvertQuote(quote);
  return quote;
}

/**
 * Accept an unexpired firm quote at the quoted in/out amounts.
 * Missing quote/expiry/amounts refuse. Never invent a mid or fee.
 */
export function acceptConvertQuote(input: {
  quote: FirmConvertQuote;
  now: Date;
  /** If supplied, must equal quote.avgPrice — else last-look refuse. */
  assertedPrice?: Amount | null;
}): BoundConvertFill {
  assertFirmConvertQuote(input.quote);
  const expiresAt = Date.parse(input.quote.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    throw new TradeError('convert quote expiry is required — refuse rather than invent', 'trade.convert_expiry_missing');
  }
  if (input.now.getTime() > expiresAt) {
    throw new TradeError('convert quote expired — refuse rather than requote', 'trade.convert_quote_expired');
  }
  if (input.assertedPrice != null && input.assertedPrice !== input.quote.avgPrice) {
    throw new TradeError(
      `convert price ${formatAmount(input.quote.avgPrice)} is not the amount you accepted ${formatAmount(input.assertedPrice)}`,
      'trade.convert_price_moved',
    );
  }
  return {
    quote: input.quote,
    fillPrice: input.quote.avgPrice,
    fillNotional: input.quote.userNotional,
    acceptedAt: input.now.toISOString(),
  };
}

/** Present a quote for the wire (decimal strings only for money). */
export function presentConvertQuote(q: FirmConvertQuote) {
  assertFirmConvertQuote(q);
  return {
    quoteId: q.quoteId,
    symbol: q.symbol,
    side: q.side,
    requestedQty: formatAmount(q.requestedQty),
    filledQty: formatAmount(q.filledQty),
    bookNotional: formatAmount(q.bookNotional),
    userNotional: formatAmount(q.userNotional),
    avgPrice: formatAmount(q.avgPrice),
    fullyFilled: q.fullyFilled,
    convertSpreadBps: q.convertSpreadBps,
    expiresAt: q.expiresAt,
    source: { kind: q.source.kind, symbol: q.source.symbol, asOf: q.source.asOf },
    inAsset: q.inAsset,
    outAsset: q.outAsset,
    inAmount: formatAmount(q.inAmount),
    outAmount: formatAmount(q.outAmount),
  };
}

export function presentBoundConvertFill(
  bound: BoundConvertFill,
  extra: { fillId: string; takerOrderId: string; makerOrderId: string; settledAt: string },
) {
  const q = bound.quote;
  return {
    quoteId: q.quoteId,
    fillId: extra.fillId,
    takerOrderId: extra.takerOrderId,
    makerOrderId: extra.makerOrderId,
    symbol: q.symbol,
    side: q.side,
    inAsset: q.inAsset,
    outAsset: q.outAsset,
    inAmount: formatAmount(q.inAmount),
    outAmount: formatAmount(q.outAmount),
    fillPrice: formatAmount(bound.fillPrice),
    fillNotional: formatAmount(bound.fillNotional),
    convertSpreadBps: q.convertSpreadBps,
    source: { kind: q.source.kind, symbol: q.source.symbol, asOf: q.source.asOf },
    expiresAt: q.expiresAt,
    acceptedAt: bound.acceptedAt,
    settledAt: extra.settledAt,
  };
}

export type ConvertTradeWire = ReturnType<typeof presentBoundConvertFill>;
