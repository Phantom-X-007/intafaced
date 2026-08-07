import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { acceptOtcQuote, buildOtcQuote, parseOtcMidPrice } from './rfq.js';
import { OtcError } from './errors.js';

const base = {
  quoteId: 'q1',
  userId: 'u1',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  qty: parseAmount('1'),
  midPrice: parseAmount('100'),
  spreadBps: 100,
  counterparty: 'platform' as const,
  counterpartyId: 'platform:otc-desk',
  now: new Date('2026-08-07T10:00:00.000Z'),
  quoteTtlMs: 30_000,
};

describe('buildOtcQuote', () => {
  it('discloses counterparty, size, expiry, spread on buy', () => {
    const q = buildOtcQuote({ ...base, side: 'buy' });
    expect(q.counterparty).toBe('platform');
    expect(q.counterpartyId).toBe('platform:otc-desk');
    expect(formatAmount(q.qty)).toBe('1');
    expect(q.spreadBps).toBe(100);
    expect(formatAmount(q.midNotional)).toBe('100');
    expect(formatAmount(q.userNotional)).toBe('101');
    expect(q.expiresAt).toBe('2026-08-07T10:00:30.000Z');
  });

  it('worsens sell notional by spread', () => {
    const q = buildOtcQuote({ ...base, side: 'sell' });
    expect(formatAmount(q.userNotional)).toBe('99');
  });

  it('refuses blank mid invent', () => {
    expect(() => parseOtcMidPrice('')).toThrow(OtcError);
    expect(() => parseOtcMidPrice(null)).toThrow(OtcError);
  });
});

describe('acceptOtcQuote — no last look', () => {
  it('honours quoted price until expiry', () => {
    const q = buildOtcQuote({ ...base, side: 'buy' });
    const bound = acceptOtcQuote({ quote: q, now: new Date('2026-08-07T10:00:10.000Z') });
    expect(bound.fillPrice).toBe(q.quotedPrice);
    expect(bound.fillNotional).toBe(q.userNotional);
  });

  it('refuses expired — no silent requote', () => {
    const q = buildOtcQuote({ ...base, side: 'buy' });
    expect(() => acceptOtcQuote({ quote: q, now: new Date('2026-08-07T10:00:31.000Z') })).toThrowError(/expired/);
  });

  it('refuses asserted price that differs (last look)', () => {
    const q = buildOtcQuote({ ...base, side: 'buy' });
    expect(() =>
      acceptOtcQuote({
        quote: q,
        now: new Date('2026-08-07T10:00:10.000Z'),
        assertedPrice: parseAmount('999'),
      }),
    ).toThrowError(/Last look/);
  });
});
