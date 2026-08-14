import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { buildOtcQuote } from './rfq.js';
import { MemoryOtcQuoteStore } from './quote-store.js';

describe('MemoryOtcQuoteStore', () => {
  it('round-trips open → bound → settled without inventing a new price', async () => {
    const store = new MemoryOtcQuoteStore();
    const quote = buildOtcQuote({
      quoteId: 'q-durable-1',
      userId: 'user-1',
      side: 'buy',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      qty: parseAmount('1'),
      midPrice: parseAmount('200'),
      spreadBps: 50,
      counterparty: 'platform',
      counterpartyId: 'platform:otc-desk',
      now: new Date('2026-08-14T05:00:00.000Z'),
      quoteTtlMs: 60_000,
    });
    await store.saveOpen(quote);
    const open = await store.load('q-durable-1');
    expect(open?.lifecycle).toBe('open');
    if (open?.lifecycle !== 'open') throw new Error('expected open');
    expect(open.quote.quotedPrice).toBe(quote.quotedPrice);

    const bound = {
      quoteId: quote.quoteId,
      userId: quote.userId,
      side: quote.side,
      baseAsset: quote.baseAsset,
      quoteAsset: quote.quoteAsset,
      qty: quote.qty,
      fillPrice: quote.quotedPrice,
      fillNotional: quote.userNotional,
      spreadBps: quote.spreadBps,
      counterparty: quote.counterparty,
      counterpartyId: quote.counterpartyId,
      acceptedAt: '2026-08-14T05:00:01.000Z',
    };
    await store.saveBound(quote, bound);
    const loadedBound = await store.load('q-durable-1');
    expect(loadedBound?.lifecycle).toBe('bound');
    if (loadedBound?.lifecycle !== 'bound') throw new Error('expected bound');
    expect(loadedBound.bound.fillPrice).toBe(quote.quotedPrice);

    await store.saveSettled(quote, bound, new Date('2026-08-14T05:00:02.000Z'));
    const settled = await store.load('q-durable-1');
    expect(settled?.lifecycle).toBe('settled');
    if (settled?.lifecycle !== 'settled') throw new Error('expected settled');
    expect(settled.bound.fillPrice).toBe(quote.quotedPrice);
  });
});
