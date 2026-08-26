import { CaptureLog, type CaptureRecord, type VenueConnection } from '@intafaced/connect-data-lake';

/**
 * PUBLIC TRADE TAPE (§5.2 ws.gateway / PTX-M06-R02).
 *
 * A trade print is what a terminal shows in the tape: price, size, time, the
 * engine sequence that makes the print unique, and a disclosure `kind`.
 * Missing kind is `unknown`, never a silent normal trade. Kind is never
 * inferred from L2 (price vs bid/ask). Aggressor *side* is still not on
 * this public shape.
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

/**
 * Public tape disclosure class. Authoritative source only.
 * `unknown` is the honest empty — not a default continuous trade.
 */
export const TRADE_PRINT_KINDS = ['aggressor', 'liquidation', 'block', 'bust', 'correction', 'unknown'] as const;

export type TradePrintKind = (typeof TRADE_PRINT_KINDS)[number];

export const TRADE_PRINT_KIND_UNKNOWN: TradePrintKind = 'unknown';

const TRADE_PRINT_KIND_SET: ReadonlySet<string> = new Set(TRADE_PRINT_KINDS);

export function isTradePrintKind(value: unknown): value is TradePrintKind {
  return typeof value === 'string' && TRADE_PRINT_KIND_SET.has(value);
}

/**
 * Disclose kind only when the fill said it. Missing, null, or garbage →
 * `unknown`. Callers must not pass L2 to this function; there is no
 * book-shaped overload on purpose.
 */
export function tradePrintKindFromFill(fill: { readonly kind?: unknown }): TradePrintKind {
  return isTradePrintKind(fill.kind) ? fill.kind : TRADE_PRINT_KIND_UNKNOWN;
}

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
  /** Disclosure class. Required. Missing source kind is `unknown`. */
  readonly kind: TradePrintKind;
}

/**
 * Fields taken from an `orderFilled` payload (or anything shaped like one).
 * Order ids are accepted so callers can pass the event through, and are
 * deliberately unused. `kind` is optional on the fill; the print always
 * carries one.
 */
export interface FillLike {
  readonly marketId: string;
  readonly price: string;
  readonly qty: string;
  readonly sequence: number;
  readonly ts: string;
  readonly makerOrderId?: string;
  readonly takerOrderId?: string;
  readonly kind?: unknown;
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
    kind: tradePrintKindFromFill(fill),
  };
}

/** Keys a public print is allowed to carry. Used by tests and any scanner. */
export const TRADE_PRINT_PUBLIC_KEYS = ['type', 'marketId', 'sequence', 'price', 'quantity', 'ts', 'kind'] as const;

export interface VenueFillIngest {
  readonly venueId: string;
  readonly connection: VenueConnection;
  readonly fill?: FillLike | null;
}

export interface VenueTickIngest {
  readonly venueId: string;
  readonly connection: VenueConnection;
  readonly marketId: string;
  readonly tick?: { readonly price: string; readonly quantity: string; readonly ts: string } | null;
}

export interface VenueTapeIngestResult {
  readonly record: CaptureRecord;
  readonly print: TradePrint | null;
}

/**
 * Fill ingest with a venue id. Unconnected venues write absent — they do not
 * mint a public print from silence.
 */
export function ingestVenueFill(lake: CaptureLog, input: VenueFillIngest): VenueTapeIngestResult {
  const fill = input.fill ?? null;
  if (input.connection !== 'connected' || fill === null) {
    const record = lake.captureFill({
      venueId: input.venueId,
      marketId: fill?.marketId ?? '',
      connection: input.connection,
      fill: null,
    });
    return { record, print: null };
  }
  const print = tradePrintFromFill(fill);
  const record = lake.captureFill({
    venueId: input.venueId,
    marketId: print.marketId,
    connection: 'connected',
    fill: { price: print.price, quantity: print.quantity, ts: print.ts, sequence: print.sequence },
  });
  return { record, print };
}

/**
 * Tick ingest. Same absent-vs-measured rule as fills: JSON numbers are
 * refuse, never a live tape print. Unconnected / missing ticks write absent
 * without minting a measured row.
 */
export function ingestVenueTick(lake: CaptureLog, input: VenueTickIngest): CaptureRecord {
  const tick = input.tick ?? null;
  if (input.connection !== 'connected' || tick === null) {
    return lake.captureTick({
      venueId: input.venueId,
      marketId: input.marketId,
      connection: input.connection,
      tick: null,
    });
  }
  if (typeof tick.price !== 'string' || !DECIMAL.test(tick.price)) {
    throw new Error('tick price must be a non-negative decimal string');
  }
  if (typeof tick.quantity !== 'string' || !DECIMAL.test(tick.quantity)) {
    throw new Error('tick quantity must be a non-negative decimal string');
  }
  return lake.captureTick({
    venueId: input.venueId,
    marketId: input.marketId,
    connection: 'connected',
    tick: { price: tick.price, quantity: tick.quantity, ts: tick.ts },
  });
}
