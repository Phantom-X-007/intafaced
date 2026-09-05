import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { parseOwnerIntegerEnv } from '../owner-int-env.js';
import {
  acceptConvertQuote,
  assertFirmConvertQuote,
  buildFirmConvertQuote,
  estimateConvert,
  presentConvertQuote,
  requireConvertQuoteTtlMs,
  snapToTick,
  type FirmConvertQuote,
} from './quote.js';

const TICK = parseAmount('0.01');
const NOW = new Date('2026-08-26T12:00:00.000Z');

function estimateBuy() {
  return estimateConvert({
    side: 'buy',
    qty: parseAmount('2'),
    levels: [
      ['100', '1'],
      ['110', '1'],
    ],
    convertSpreadBps: 100,
    tickSize: TICK,
  });
}

function firm(overrides: Partial<FirmConvertQuote> = {}): FirmConvertQuote {
  const estimate = estimateBuy();
  const built = buildFirmConvertQuote({
    quoteId: 'q-convert-1',
    userId: 'user-1',
    symbol: 'BTC/USDT',
    marketId: 'm-btc',
    side: 'buy',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    requestedQty: parseAmount('2'),
    estimate,
    convertSpreadBps: 100,
    source: { kind: 'book', symbol: 'BTC/USDT', asOf: NOW.toISOString() },
    now: NOW,
    quoteTtlMs: 15_000,
  });
  return { ...built, ...overrides };
}

describe('parseOwnerIntegerEnv', () => {
  it('maps blank/unset/non-integer to null — never invents 10 or 200', () => {
    expect(parseOwnerIntegerEnv(undefined)).toBeNull();
    expect(parseOwnerIntegerEnv(null)).toBeNull();
    expect(parseOwnerIntegerEnv('')).toBeNull();
    expect(parseOwnerIntegerEnv('  ')).toBeNull();
    expect(parseOwnerIntegerEnv('abc')).toBeNull();
    expect(parseOwnerIntegerEnv('10.5')).toBeNull();
    expect(parseOwnerIntegerEnv('10e1')).toBeNull();
    expect(parseOwnerIntegerEnv('+10')).toBeNull();
  });

  it('accepts a published integer string', () => {
    expect(parseOwnerIntegerEnv('0')).toBe(0);
    expect(parseOwnerIntegerEnv('25')).toBe(25);
    expect(parseOwnerIntegerEnv('150')).toBe(150);
  });
});

describe('estimateConvert', () => {
  it('walks asks for a buy and worsens notional by the convert spread', () => {
    const q = estimateBuy();
    expect(q.filledQty).toBe(parseAmount('2'));
    expect(q.bookNotional).toBe(parseAmount('210'));
    expect(q.userNotional).toBe(parseAmount('212.1'));
    expect(q.fullyFilled).toBe(true);
    expect(q.avgPrice >= parseAmount('105')).toBe(true);
  });

  it('walks bids for a sell and reduces what the user receives', () => {
    const q = estimateConvert({
      side: 'sell',
      qty: parseAmount('1'),
      levels: [['100', '5']],
      convertSpreadBps: 100,
      tickSize: TICK,
    });
    expect(q.bookNotional).toBe(parseAmount('100'));
    expect(q.userNotional).toBe(parseAmount('99'));
    expect(q.avgPrice).toBe(parseAmount('99'));
    expect(q.fullyFilled).toBe(true);
  });

  it('reports partial fill when the book is thin', () => {
    const q = estimateConvert({
      side: 'buy',
      qty: parseAmount('10'),
      levels: [['50', '3']],
      convertSpreadBps: 0,
      tickSize: TICK,
    });
    expect(q.filledQty).toBe(parseAmount('3'));
    expect(q.fullyFilled).toBe(false);
  });

  it('refuses an empty book', () => {
    expect(() =>
      estimateConvert({
        side: 'buy',
        qty: parseAmount('1'),
        levels: [],
        convertSpreadBps: 0,
        tickSize: TICK,
      }),
    ).toThrow(/no liquidity/);
  });

  it('refuses unset/non-integer spread rather than inventing 10', () => {
    for (const convertSpreadBps of [null, undefined, Number.NaN, 10.5]) {
      try {
        estimateConvert({
          side: 'buy',
          qty: parseAmount('1'),
          levels: [['100', '1']],
          convertSpreadBps,
          tickSize: TICK,
        });
        throw new Error(`should have thrown for ${String(convertSpreadBps)}`);
      } catch (err) {
        expect((err as { code: string }).code).toBe('trade.convert_spread_unset');
      }
    }
  });
});

describe('snapToTick', () => {
  it('rounds buys up and sells down onto the tick', () => {
    expect(snapToTick(parseAmount('100.001'), TICK, 'buy')).toBe(parseAmount('100.01'));
    expect(snapToTick(parseAmount('100.001'), TICK, 'sell')).toBe(parseAmount('100'));
  });
});

describe('firm convert quote (M27)', () => {
  it('presents source, expiry, and exact in/out decimal strings', () => {
    const q = firm();
    const wire = presentConvertQuote(q);
    expect(wire.quoteId).toBe('q-convert-1');
    expect(wire.source).toEqual({ kind: 'book', symbol: 'BTC/USDT', asOf: NOW.toISOString() });
    expect(wire.expiresAt).toBe('2026-08-26T12:00:15.000Z');
    expect(wire.inAsset).toBe('USDT');
    expect(wire.outAsset).toBe('BTC');
    expect(wire.inAmount).toBe('212.1');
    expect(wire.outAmount).toBe('2');
  });

  it('refuses missing source / expiry / amounts — never invents a mid', () => {
    expect(() => assertFirmConvertQuote(firm({ expiresAt: '' }))).toThrow(/expiry/);
    expect(() => assertFirmConvertQuote(firm({ source: { kind: 'book', symbol: '', asOf: NOW.toISOString() } }))).toThrow(/source/);
    expect(() => assertFirmConvertQuote(firm({ inAmount: 0n }))).toThrow(/amounts/);
  });

  it('accept binds quoted amounts; expiry and last-look refuse', () => {
    const q = firm();
    const bound = acceptConvertQuote({ quote: q, now: new Date('2026-08-26T12:00:01.000Z') });
    expect(bound.fillNotional).toBe(q.userNotional);
    expect(bound.fillPrice).toBe(q.avgPrice);

    expect(() => acceptConvertQuote({ quote: q, now: new Date('2026-08-26T12:00:16.000Z') })).toThrow(/expired/);
    expect(() => acceptConvertQuote({ quote: q, now: new Date('2026-08-26T12:00:01.000Z'), assertedPrice: parseAmount('1') })).toThrow(
      /trade\.convert_price_moved|not the amount/,
    );
  });

  it('refuses unset/non-integer/non-positive TTL rather than inventing 15000', () => {
    for (const quoteTtlMs of [null, undefined, Number.NaN, 10.5, 0, -1]) {
      try {
        buildFirmConvertQuote({
          quoteId: 'q-ttl-unset',
          userId: 'user-1',
          symbol: 'BTC/USDT',
          marketId: 'm-btc',
          side: 'buy',
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          requestedQty: parseAmount('2'),
          estimate: estimateBuy(),
          convertSpreadBps: 100,
          source: { kind: 'book', symbol: 'BTC/USDT', asOf: NOW.toISOString() },
          now: NOW,
          quoteTtlMs,
        });
        throw new Error(`should have thrown for ${String(quoteTtlMs)}`);
      } catch (err) {
        expect((err as { code: string }).code).toBe('trade.convert_quote_ttl_unset');
      }
    }
  });

  it('owner-published 15000 is a legal TTL', () => {
    expect(requireConvertQuoteTtlMs(15_000)).toBe(15_000);
    const q = buildFirmConvertQuote({
      quoteId: 'q-ttl-owner',
      userId: 'user-1',
      symbol: 'BTC/USDT',
      marketId: 'm-btc',
      side: 'buy',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      requestedQty: parseAmount('2'),
      estimate: estimateBuy(),
      convertSpreadBps: 100,
      source: { kind: 'book', symbol: 'BTC/USDT', asOf: NOW.toISOString() },
      now: NOW,
      quoteTtlMs: 15_000,
    });
    expect(q.expiresAt).toBe('2026-08-26T12:00:15.000Z');
  });
});
