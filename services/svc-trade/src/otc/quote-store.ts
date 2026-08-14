/**
 * Durable OTC quote store (trade.otc residual after in-memory Maps).
 *
 * Same pattern as TWAP parents / copy follows: process Maps lose a promised
 * quote on restart. This keeps the quoted numbers as built — never a new mid,
 * spread, stake, or TTL.
 */

import type { Sql } from 'postgres';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import type { BoundOtcFill, OtcQuote, OtcSide } from './rfq.js';
import type { OtcCounterpartyMode } from './desk-law.js';

export type OtcQuoteLifecycle = 'open' | 'bound' | 'settled';

export type OtcStoredQuote =
  | { readonly lifecycle: 'open'; readonly quote: OtcQuote }
  | { readonly lifecycle: 'bound'; readonly quote: OtcQuote; readonly bound: BoundOtcFill }
  | { readonly lifecycle: 'settled'; readonly quote: OtcQuote; readonly bound: BoundOtcFill; readonly settledAt: string };

export interface OtcQuoteStore {
  saveOpen(quote: OtcQuote): Promise<void>;
  saveBound(quote: OtcQuote, bound: BoundOtcFill): Promise<void>;
  saveSettled(quote: OtcQuote, bound: BoundOtcFill, settledAt: Date): Promise<void>;
  load(quoteId: string): Promise<OtcStoredQuote | null>;
}

function quoteFromParts(row: {
  quoteId: string;
  userId: string;
  side: OtcSide;
  baseAsset: string;
  quoteAsset: string;
  qty: string;
  midPrice: string;
  quotedPrice: string;
  midNotional: string;
  userNotional: string;
  spreadBps: number;
  spreadNotional: string;
  counterparty: OtcCounterpartyMode;
  counterpartyId: string;
  createdAt: string;
  expiresAt: string;
}): OtcQuote {
  return {
    quoteId: row.quoteId,
    userId: row.userId,
    side: row.side,
    baseAsset: row.baseAsset,
    quoteAsset: row.quoteAsset,
    qty: parseAmount(row.qty),
    midPrice: parseAmount(row.midPrice),
    quotedPrice: parseAmount(row.quotedPrice),
    midNotional: parseAmount(row.midNotional),
    userNotional: parseAmount(row.userNotional),
    spreadBps: row.spreadBps,
    spreadNotional: parseAmount(row.spreadNotional),
    counterparty: row.counterparty,
    counterpartyId: row.counterpartyId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    status: 'open',
  };
}

function boundFromQuote(quote: OtcQuote, acceptedAt: string, fillPrice: string, fillNotional: string): BoundOtcFill {
  return {
    quoteId: quote.quoteId,
    userId: quote.userId,
    side: quote.side,
    baseAsset: quote.baseAsset,
    quoteAsset: quote.quoteAsset,
    qty: quote.qty,
    fillPrice: parseAmount(fillPrice),
    fillNotional: parseAmount(fillNotional),
    spreadBps: quote.spreadBps,
    counterparty: quote.counterparty,
    counterpartyId: quote.counterpartyId,
    acceptedAt,
  };
}

/** In-memory store for unit tests. Share one instance across two desks to prove restart. */
export class MemoryOtcQuoteStore implements OtcQuoteStore {
  private readonly byId = new Map<string, OtcStoredQuote>();

  async saveOpen(quote: OtcQuote): Promise<void> {
    this.byId.set(quote.quoteId, { lifecycle: 'open', quote: { ...quote } });
  }

  async saveBound(quote: OtcQuote, bound: BoundOtcFill): Promise<void> {
    this.byId.set(quote.quoteId, { lifecycle: 'bound', quote: { ...quote }, bound: { ...bound } });
  }

  async saveSettled(quote: OtcQuote, bound: BoundOtcFill, settledAt: Date): Promise<void> {
    this.byId.set(quote.quoteId, {
      lifecycle: 'settled',
      quote: { ...quote },
      bound: { ...bound },
      settledAt: settledAt.toISOString(),
    });
  }

  async load(quoteId: string): Promise<OtcStoredQuote | null> {
    return this.byId.get(quoteId) ?? null;
  }
}

type QuoteRow = {
  quote_id: string;
  user_id: string;
  lifecycle: OtcQuoteLifecycle;
  side: OtcSide;
  base_asset: string;
  quote_asset: string;
  qty: string;
  mid_price: string;
  quoted_price: string;
  mid_notional: string;
  user_notional: string;
  spread_bps: number;
  spread_notional: string;
  counterparty: OtcCounterpartyMode;
  counterparty_id: string;
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

function rowToStored(row: QuoteRow): OtcStoredQuote {
  const quote = quoteFromParts({
    quoteId: row.quote_id,
    userId: row.user_id,
    side: row.side,
    baseAsset: row.base_asset,
    quoteAsset: row.quote_asset,
    qty: row.qty,
    midPrice: row.mid_price,
    quotedPrice: row.quoted_price,
    midNotional: row.mid_notional,
    userNotional: row.user_notional,
    spreadBps: Number(row.spread_bps),
    spreadNotional: row.spread_notional,
    counterparty: row.counterparty,
    counterpartyId: row.counterparty_id,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
  });
  if (row.lifecycle === 'open') {
    return { lifecycle: 'open', quote };
  }
  if (row.accepted_at == null || row.fill_price == null || row.fill_notional == null) {
    return { lifecycle: 'open', quote };
  }
  const bound = boundFromQuote(quote, iso(row.accepted_at), row.fill_price, row.fill_notional);
  if (row.lifecycle === 'settled' && row.settled_at != null) {
    return { lifecycle: 'settled', quote, bound, settledAt: iso(row.settled_at) };
  }
  return { lifecycle: 'bound', quote, bound };
}

export class SqlOtcQuoteStore implements OtcQuoteStore {
  constructor(private readonly sql: Sql) {}

  async saveOpen(quote: OtcQuote): Promise<void> {
    await this.upsert(quote, 'open', null, null, null, null);
  }

  async saveBound(quote: OtcQuote, bound: BoundOtcFill): Promise<void> {
    await this.upsert(quote, 'bound', bound.acceptedAt, formatAmount(bound.fillPrice), formatAmount(bound.fillNotional), null);
  }

  async saveSettled(quote: OtcQuote, bound: BoundOtcFill, settledAt: Date): Promise<void> {
    await this.upsert(
      quote,
      'settled',
      bound.acceptedAt,
      formatAmount(bound.fillPrice),
      formatAmount(bound.fillNotional),
      settledAt.toISOString(),
    );
  }

  async load(quoteId: string): Promise<OtcStoredQuote | null> {
    const rows = await this.sql<QuoteRow[]>`
      SELECT
        quote_id, user_id, lifecycle, side, base_asset, quote_asset,
        qty::text, mid_price::text, quoted_price::text, mid_notional::text,
        user_notional::text, spread_bps, spread_notional::text,
        counterparty, counterparty_id, created_at, expires_at,
        accepted_at, fill_price::text, fill_notional::text, settled_at
      FROM otc_desk_quotes
      WHERE quote_id = ${quoteId}
    `;
    if (!rows[0]) return null;
    return rowToStored(rows[0]);
  }

  private async upsert(
    quote: OtcQuote,
    lifecycle: OtcQuoteLifecycle,
    acceptedAt: string | null,
    fillPrice: string | null,
    fillNotional: string | null,
    settledAt: string | null,
  ): Promise<void> {
    await this.sql`
      INSERT INTO otc_desk_quotes (
        quote_id, user_id, lifecycle, side, base_asset, quote_asset,
        qty, mid_price, quoted_price, mid_notional, user_notional,
        spread_bps, spread_notional, counterparty, counterparty_id,
        created_at, expires_at, accepted_at, fill_price, fill_notional, settled_at, updated_at
      ) VALUES (
        ${quote.quoteId},
        ${quote.userId},
        ${lifecycle},
        ${quote.side},
        ${quote.baseAsset},
        ${quote.quoteAsset},
        ${formatAmount(quote.qty)},
        ${formatAmount(quote.midPrice)},
        ${formatAmount(quote.quotedPrice)},
        ${formatAmount(quote.midNotional)},
        ${formatAmount(quote.userNotional)},
        ${quote.spreadBps},
        ${formatAmount(quote.spreadNotional)},
        ${quote.counterparty},
        ${quote.counterpartyId},
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
