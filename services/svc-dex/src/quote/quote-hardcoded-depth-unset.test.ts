/**
 * Unit card — MarketDataSource.quote refuse hardcoded depth 50
 *
 * 1. Promise: unpublished / 0 / NaN depth throws (never invent 50).
 *    Owner-explicit 50 (DEX_QUOTE_DEPTH) is a published window, not a git default.
 * 2. Break: `quote()` still called `depth(symbol, 50)` after orderBook mill (#4103).
 * 3. Done bar: unset/0/NaN throw before fetch; 50 reads; no `depth(request.symbol, 50)`.
 *    venue-set forwards DEX_QUOTE_DEPTH (no second invented number).
 * 4. Class N
 * 5. Paths: market-data-source.ts quote(); venue-set.ts depth: env.DEX_QUOTE_DEPTH
 * 6. RED: quote() with unset depth returns a book walked at 50
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client/money';
import { MarketDataSource } from './market-data-source.js';
import type { TimestampedBook } from './venue.js';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const HERE = dirname(fileURLToPath(import.meta.url));
const buyOne = { symbol: 'IFC-USD', side: 'buy' as const, amount: amt('1') };

class LiveVenue extends MarketDataSource {
  readonly id = 'intachain-clob';
  readonly kind = 'external-dex' as const;
  readonly feeBps = 0;
  readonly settlementCost = 0n;
  lastLimit: number | undefined;

  constructor(depth?: number) {
    super({ quoteTtlMs: 2_000, ...(depth !== undefined ? { depth } : {}) });
  }

  protected async fetchDepth(symbol: string, limit: number): Promise<TimestampedBook> {
    this.lastLimit = limit;
    return {
      venueId: this.id,
      symbol,
      bids: [[amt('99'), amt('10')]],
      asks: [[amt('101'), amt('10')]],
      observedAt: NOW,
      sequence: 1,
      chainFinality: 'finalized',
    };
  }
}

describe('MarketDataSource quote depth refuse-closed', () => {
  it('market-data-source.ts has no invented 50 on quote()', () => {
    const src = readFileSync(join(HERE, 'market-data-source.ts'), 'utf8');
    expect(src).not.toMatch(/depth\(request\.symbol,\s*50\)/);
    expect(src).toMatch(/publishedQuoteDepth/);
  });

  it('venue-set.ts reuses DEX_QUOTE_DEPTH (no second invented number)', () => {
    const src = readFileSync(join(HERE, 'venue-set.ts'), 'utf8');
    expect(src).toMatch(/depth:\s*env\.DEX_QUOTE_DEPTH/);
    expect(src).not.toMatch(/depth:\s*50/);
  });

  it('unset depth refuses (no invent 50)', async () => {
    const venue = new LiveVenue();
    await expect(venue.quote(buyOne)).rejects.toThrow(/refuse to invent 50/);
    expect(venue.lastLimit).toBeUndefined();
  });

  it('NaN / 0 depth refuses (no invent 50)', async () => {
    await expect(new LiveVenue(Number.NaN).quote(buyOne)).rejects.toThrow(/refuse to invent 50/);
    await expect(new LiveVenue(0).quote(buyOne)).rejects.toThrow(/refuse to invent 50/);
  });

  it('owner-explicit 50 is published (not invented)', async () => {
    const venue = new LiveVenue(50);
    const quoted = await venue.quote(buyOne);
    expect(venue.lastLimit).toBe(50);
    expect(quoted?.venueId).toBe('intachain-clob');
    expect(quoted?.amount).toBe(amt('1'));
  });
});
