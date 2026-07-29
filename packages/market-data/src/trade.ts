/**
 * PUBLIC TRADE TAPE (§5.2 ws.gateway).
 *
 * A trade print is what a terminal shows in the tape: price, size, time, and
 * the engine sequence that makes the print unique. That is the whole public
 * shape. Everything else on `orderFilled` is either private (order ids) or not
 * on the bus yet (aggressor side) — neither may appear here by accident.
 *
 * ── Why this is not the event ───────────────────────────────────────────────
 *
 * `intafaced.matching.order.filled` carries maker/taker order UUIDs so
 * svc-trade can settle. Those ids identify resting and aggressive orders; a
 * public port that re-broadcast them would let anyone correlate a private
 * order stream to a public print. The conversion below is the deliberate
 * strip. Adding fields to the public shape is a packages/market-data change
 * reviewed on its own — never a silent pass-through of the event payload.
 *
 * Money is decimal strings on the wire, never JSON numbers.
 */

/** One public trade print. `type` discriminates it from depth frames on the wire. */
export interface TradePrint {
  readonly type: 'trade';
  readonly marketId: string;
  /** Engine sequence — unique per market, the client-side dedupe key. */
  readonly sequence: number;
  /** Match price, decimal string. */
  readonly price: string;
  /** Match quantity, decimal string. */
  readonly quantity: string;
  /** When the engine printed the fill (ISO-8601 with offset). */
  readonly ts: string;
}

/**
 * Fields taken from an `orderFilled` payload (or anything shaped like one).
 * Order ids are accepted so callers can pass the event through, and are
 * deliberately unused.
 */
export interface FillLike {
  readonly marketId: string;
  readonly price: string;
  readonly qty: string;
  readonly sequence: number;
  readonly ts: string;
  readonly makerOrderId?: string;
  readonly takerOrderId?: string;
}

const DECIMAL = /^\d+(\.\d{1,18})?$/;

/**
 * Build a public print from a fill-shaped payload.
 *
 * Throws when price/qty are not decimal strings or sequence is not a
 * non-negative integer — same rule as depth: refuse garbage rather than
 * coerce it into a float.
 */
export function tradePrintFromFill(fill: FillLike): TradePrint {
  if (typeof fill.marketId !== 'string' || fill.marketId.length === 0) {
    throw new Error('trade print requires a non-empty marketId');
  }
  if (typeof fill.price !== 'string' || !DECIMAL.test(fill.price)) {
    throw new Error('trade print price must be a non-negative decimal string');
  }
  if (typeof fill.qty !== 'string' || !DECIMAL.test(fill.qty)) {
    throw new Error('trade print quantity must be a non-negative decimal string');
  }
  if (typeof fill.sequence !== 'number' || !Number.isInteger(fill.sequence) || fill.sequence < 0) {
    throw new Error('trade print sequence must be a non-negative integer');
  }
  if (typeof fill.ts !== 'string' || fill.ts.length === 0) {
    throw new Error('trade print requires a non-empty ts');
  }

  return {
    type: 'trade',
    marketId: fill.marketId,
    sequence: fill.sequence,
    price: fill.price,
    quantity: fill.qty,
    ts: fill.ts,
  };
}

/** Keys a public print is allowed to carry. Used by tests and any scanner. */
export const TRADE_PRINT_PUBLIC_KEYS = ['type', 'marketId', 'sequence', 'price', 'quantity', 'ts'] as const;
