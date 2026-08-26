/**
 * Durable block/RFQ quote store.
 *
 * Quotes are firm numbers as built — never a new mid, size, price, or expiry.
 */

import type { Sql } from 'postgres';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import type { BlockQuote, BlockQuoteLifecycle, BlockRfqSide } from './block-rfq.js';

export interface BlockQuoteStore {
  save(quote: BlockQuote): Promise<void>;
  load(quoteId: string): Promise<BlockQuote | null>;
}

export class MemoryBlockQuoteStore implements BlockQuoteStore {
  private readonly byId = new Map<string, BlockQuote>();

  async save(quote: BlockQuote): Promise<void> {
    this.byId.set(quote.quoteId, { ...quote });
  }

  async load(quoteId: string): Promise<BlockQuote | null> {
    const row = this.byId.get(quoteId);
    return row ? { ...row } : null;
  }
}

type QuoteRow = {
  quote_id: string;
  maker_id: string;
  taker_id: string;
  side: BlockRfqSide;
  asset: string;
  fiat_currency: string;
  size: string;
  price: string;
  notional: string;
  created_at: Date | string;
  expires_at: Date | string;
  lifecycle: BlockQuoteLifecycle;
  accepted_at: Date | string | null;
  fill_price: string | null;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToQuote(row: QuoteRow): BlockQuote {
  return {
    quoteId: row.quote_id,
    makerId: row.maker_id,
    takerId: row.taker_id,
    side: row.side,
    asset: row.asset,
    fiatCurrency: row.fiat_currency,
    size: parseAmount(row.size),
    price: parseAmount(row.price),
    notional: parseAmount(row.notional),
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    lifecycle: row.lifecycle,
    acceptedAt: row.accepted_at == null ? null : iso(row.accepted_at),
    fillPrice: row.fill_price == null ? null : parseAmount(row.fill_price),
    bookFill: false,
  };
}

export class SqlBlockQuoteStore implements BlockQuoteStore {
  constructor(private readonly sql: Sql) {}

  async save(quote: BlockQuote): Promise<void> {
    await this.sql`
      INSERT INTO p2p.block_quotes (
        quote_id, maker_id, taker_id, side, asset, fiat_currency,
        size, price, notional, created_at, expires_at, lifecycle,
        accepted_at, fill_price, updated_at
      ) VALUES (
        ${quote.quoteId},
        ${quote.makerId},
        ${quote.takerId},
        ${quote.side},
        ${quote.asset},
        ${quote.fiatCurrency},
        ${formatAmount(quote.size)},
        ${formatAmount(quote.price)},
        ${formatAmount(quote.notional)},
        ${quote.createdAt},
        ${quote.expiresAt},
        ${quote.lifecycle},
        ${quote.acceptedAt},
        ${quote.fillPrice == null ? null : formatAmount(quote.fillPrice)},
        now()
      )
      ON CONFLICT (quote_id) DO UPDATE SET
        lifecycle = EXCLUDED.lifecycle,
        accepted_at = EXCLUDED.accepted_at,
        fill_price = EXCLUDED.fill_price,
        updated_at = now()
    `;
  }

  async load(quoteId: string): Promise<BlockQuote | null> {
    const rows = await this.sql<QuoteRow[]>`
      SELECT
        quote_id, maker_id, taker_id, side, asset, fiat_currency,
        size::text, price::text, notional::text,
        created_at, expires_at, lifecycle,
        accepted_at, fill_price::text
      FROM p2p.block_quotes
      WHERE quote_id = ${quoteId}
    `;
    if (!rows[0]) return null;
    return rowToQuote(rows[0]);
  }
}
