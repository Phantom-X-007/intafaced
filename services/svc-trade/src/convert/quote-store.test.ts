import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { acceptConvertQuote, buildFirmConvertQuote, estimateConvert } from './quote.js';
import { MemoryConvertQuoteStore } from './quote-store.js';

describe('MemoryConvertQuoteStore', () => {
  it('round-trips open → bound → settled without inventing a new price', async () => {
    const store = new MemoryConvertQuoteStore();
    const now = new Date('2026-08-26T12:00:00.000Z');
    const estimate = estimateConvert({
      side: 'buy',
      qty: parseAmount('1'),
      levels: [['200', '2']],
      convertSpreadBps: 50,
      tickSize: parseAmount('0.01'),
    });
    const quote = buildFirmConvertQuote({
      quoteId: 'q-durable-1',
      userId: 'user-1',
      symbol: 'BTC/USDT',
      marketId: 'm1',
      side: 'buy',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      requestedQty: parseAmount('1'),
      estimate,
      convertSpreadBps: 50,
      source: { kind: 'book', symbol: 'BTC/USDT', asOf: now.toISOString() },
      now,
      quoteTtlMs: 15_000,
    });
    await store.saveOpen(quote);
    const open = await store.load('q-durable-1');
    expect(open?.lifecycle).toBe('open');
    if (open?.lifecycle !== 'open') throw new Error('expected open');
    expect(open.quote.avgPrice).toBe(quote.avgPrice);
    expect(open.quote.source.kind).toBe('book');

    const bound = acceptConvertQuote({ quote, now: new Date('2026-08-26T12:00:01.000Z') });
    await store.saveBound(quote, bound);
    const loadedBound = await store.load('q-durable-1');
    expect(loadedBound?.lifecycle).toBe('bound');
    if (loadedBound?.lifecycle !== 'bound') throw new Error('expected bound');
    expect(loadedBound.bound.fillPrice).toBe(quote.avgPrice);

    await store.saveSettled(quote, bound, new Date('2026-08-26T12:00:02.000Z'));
    const settled = await store.load('q-durable-1');
    expect(settled?.lifecycle).toBe('settled');
    if (settled?.lifecycle !== 'settled') throw new Error('expected settled');
    expect(settled.bound.fillNotional).toBe(quote.userNotional);
  });
});
