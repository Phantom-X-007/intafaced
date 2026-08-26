/**
 * Durable convert quotes. Process Maps lose a promised firm quote on restart.
 * Stored numbers are as built — never a new mid, spread, or TTL.
 */

import type { Sql } from 'postgres';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import type { OrderSide } from '../spot/types.js';
import type { BoundConvertFill, ConvertSource, FirmConvertQuote } from './quote.js';

export type ConvertQuoteLifecycle = 'open' | 'bound' | 'settled';

export type ConvertStoredQuote =
  | { readonly lifecycle: 'open'; readonly quote: FirmConvertQuote }
  | { readonly lifecycle: 'bound'; readonly quote: FirmConvertQuote; readonly bound: BoundConvertFill }
  | {
      readonly lifecycle: 'settled';
      readonly quote: FirmConvertQuote;
      readonly bound: BoundConvertFill;
      readonly settledAt: string;
    };

export interface ConvertQuoteStore {
  saveOpen(quote: FirmConvertQuote): Promise<void>;
  saveBound(quote: FirmConvertQuote, bound: BoundConvertFill): Promise<void>;
  saveSettled(quote: FirmConvertQuote, bound: BoundConvertFill, settledAt: Date): Promise<void>;
  load(quoteId: string): Promise<ConvertStoredQuote | null>;
}

function sourceFrom(_kind: string, symbol: string, asOf: string): ConvertSource {
  return { kind: 'book', symbol, asOf };
}

function quoteFromParts(row: {
  quoteId: string;
  userId: string;
  symbol: string;
  marketId: string;
  side: OrderSide;
  baseAsset: string;
  quoteAsset: string;
  inAsset: string;
  outAsset: string;
  inAmount: string;
  outAmount: string;
  requestedQty: string;
  filledQty: string;
  bookNotional: string;
  userNotional: string;
  avgPrice: string;
  convertSpreadBps: number;
  fullyFilled: boolean;
  sourceKind: string;
  sourceSymbol: string;
  sourceAsOf: string;
  createdAt: string;
  expiresAt: string;
}): FirmConvertQuote {
  return {
    quoteId: row.quoteId,
    userId: row.userId,
    symbol: row.symbol,
    marketId: row.marketId,
    side: row.side,
    baseAsset: row.baseAsset,
    quoteAsset: row.quoteAsset,
    inAsset: row.inAsset,
    outAsset: row.outAsset,
    inAmount: parseAmount(row.inAmount),
    outAmount: parseAmount(row.outAmount),
    requestedQty: parseAmount(row.requestedQty),
    filledQty: parseAmount(row.filledQty),
    bookNotional: parseAmount(row.bookNotional),
    userNotional: parseAmount(row.userNotional),
    avgPrice: parseAmount(row.avgPrice),
    convertSpreadBps: row.convertSpreadBps,
    fullyFilled: row.fullyFilled,
    source: sourceFrom(row.sourceKind, row.sourceSymbol, row.sourceAsOf),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/** In-memory store for unit tests. Share one instance across two services to prove restart. */
export class MemoryConvertQuoteStore implements ConvertQuoteStore {
  private readonly byId = new Map<string, ConvertStoredQuote>();

  async saveOpen(quote: FirmConvertQuote): Promise<void> {
    this.byId.set(quote.quoteId, { lifecycle: 'open', quote: { ...quote, source: { ...quote.source } } });
  }

  async saveBound(quote: FirmConvertQuote, bound: BoundConvertFill): Promise<void> {
    this.byId.set(quote.quoteId, { lifecycle: 'bound', quote: { ...quote }, bound: { ...bound, quote } });
  }

  async saveSettled(quote: FirmConvertQuote, bound: BoundConvertFill, settledAt: Date): Promise<void> {
    this.byId.set(quote.quoteId, {
      lifecycle: 'settled',
      quote: { ...quote },
      bound: { ...bound, quote },
      settledAt: settledAt.toISOString(),
    });
  }

  async load(quoteId: string): Promise<ConvertStoredQuote | null> {
    return this.byId.get(quoteId) ?? null;
  }
}

type QuoteRow = {
  quote_id: string;
  user_id: string;
  lifecycle: ConvertQuoteLifecycle;
  symbol: string;
  market_id: string;
  side: OrderSide;
  base_asset: string;
  quote_asset: string;
  in_asset: string;
  out_asset: string;
  in_amount: string;
  out_amount: string;
  requested_qty: string;
  filled_qty: string;
  book_notional: string;
  user_notional: string;
  avg_price: string;
  convert_spread_bps: number;
  fully_filled: boolean;
  source_kind: string;
  source_symbol: string;
  source_as_of: Date | string;
  created_at: Date | string;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  fill_price: string | null;
  fill_notional: string | null;
  settled_at: Date | string | null;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToStored(row: QuoteRow): ConvertStoredQuote {
  const quote = quoteFromParts({
    quoteId: row.quote_id,
    userId: row.user_id,
    symbol: row.symbol,
    marketId: row.market_id,
    side: row.side,
    baseAsset: row.base_asset,
    quoteAsset: row.quote_asset,
    inAsset: row.in_asset,
    outAsset: row.out_asset,
    inAmount: row.in_amount,
    outAmount: row.out_amount,
    requestedQty: row.requested_qty,
    filledQty: row.filled_qty,
    bookNotional: row.book_notional,
    userNotional: row.user_notional,
    avgPrice: row.avg_price,
    convertSpreadBps: Number(row.convert_spread_bps),
    fullyFilled: row.fully_filled,
    sourceKind: row.source_kind,
    sourceSymbol: row.source_symbol,
    sourceAsOf: iso(row.source_as_of),
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
  });
  if (row.lifecycle === 'open') {
    return { lifecycle: 'open', quote };
  }
  if (row.accepted_at == null || row.fill_price == null || row.fill_notional == null) {
    return { lifecycle: 'open', quote };
  }
  const bound: BoundConvertFill = {
    quote,
    fillPrice: parseAmount(row.fill_price),
    fillNotional: parseAmount(row.fill_notional),
    acceptedAt: iso(row.accepted_at),
  };
  if (row.lifecycle === 'settled' && row.settled_at != null) {
    return { lifecycle: 'settled', quote, bound, settledAt: iso(row.settled_at) };
  }
  return { lifecycle: 'bound', quote, bound };
}

export class SqlConvertQuoteStore implements ConvertQuoteStore {
  constructor(private readonly sql: Sql) {}

  async saveOpen(quote: FirmConvertQuote): Promise<void> {
    await this.upsert(quote, 'open', null, null, null, null);
  }

  async saveBound(quote: FirmConvertQuote, bound: BoundConvertFill): Promise<void> {
    await this.upsert(quote, 'bound', bound.acceptedAt, formatAmount(bound.fillPrice), formatAmount(bound.fillNotional), null);
  }

  async saveSettled(quote: FirmConvertQuote, bound: BoundConvertFill, settledAt: Date): Promise<void> {
    await this.upsert(
      quote,
      'settled',
      bound.acceptedAt,
      formatAmount(bound.fillPrice),
      formatAmount(bound.fillNotional),
      settledAt.toISOString(),
    );
  }

  async load(quoteId: string): Promise<ConvertStoredQuote | null> {
    const rows = await this.sql<QuoteRow[]>`
      SELECT
        quote_id, user_id, lifecycle, symbol, market_id, side,
        base_asset, quote_asset, in_asset, out_asset,
        in_amount::text, out_amount::text, requested_qty::text, filled_qty::text,
        book_notional::text, user_notional::text, avg_price::text,
        convert_spread_bps, fully_filled,
        source_kind, source_symbol, source_as_of,
        created_at, expires_at, accepted_at, fill_price::text, fill_notional::text, settled_at
      FROM convert_quotes
      WHERE quote_id = ${quoteId}
    `;
    if (!rows[0]) return null;
    return rowToStored(rows[0]);
  }

  private async upsert(
    quote: FirmConvertQuote,
    lifecycle: ConvertQuoteLifecycle,
    acceptedAt: string | null,
    fillPrice: string | null,
    fillNotional: string | null,
    settledAt: string | null,
  ): Promise<void> {
    await this.sql`
      INSERT INTO convert_quotes (
        quote_id, user_id, lifecycle, symbol, market_id, side,
        base_asset, quote_asset, in_asset, out_asset,
        in_amount, out_amount, requested_qty, filled_qty,
        book_notional, user_notional, avg_price,
        convert_spread_bps, fully_filled,
        source_kind, source_symbol, source_as_of,
        created_at, expires_at, accepted_at, fill_price, fill_notional, settled_at, updated_at
      ) VALUES (
        ${quote.quoteId},
        ${quote.userId},
        ${lifecycle},
        ${quote.symbol},
        ${quote.marketId},
        ${quote.side},
        ${quote.baseAsset},
        ${quote.quoteAsset},
        ${quote.inAsset},
        ${quote.outAsset},
        ${formatAmount(quote.inAmount)},
        ${formatAmount(quote.outAmount)},
        ${formatAmount(quote.requestedQty)},
        ${formatAmount(quote.filledQty)},
        ${formatAmount(quote.bookNotional)},
        ${formatAmount(quote.userNotional)},
        ${formatAmount(quote.avgPrice)},
        ${quote.convertSpreadBps},
        ${quote.fullyFilled},
        ${quote.source.kind},
        ${quote.source.symbol},
        ${quote.source.asOf},
        ${quote.createdAt},
        ${quote.expiresAt},
        ${acceptedAt},
        ${fillPrice},
        ${fillNotional},
        ${settledAt},
        now()
      )
      ON CONFLICT (quote_id) DO UPDATE SET
        lifecycle = EXCLUDED.lifecycle,
        accepted_at = EXCLUDED.accepted_at,
        fill_price = EXCLUDED.fill_price,
        fill_notional = EXCLUDED.fill_notional,
        settled_at = EXCLUDED.settled_at,
        updated_at = now()
    `;
  }
}
