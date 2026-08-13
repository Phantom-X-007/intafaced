import { describe, expect, it } from 'vitest';
import { formatAmount, mul, parseAmount } from '@intafaced/ledger-client';
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

  /**
   * THE PRICE ON THE QUOTE IS A PRICE.
   *
   * `quotedPrice` was computed with raw bigint `/` on two SCALED amounts, which
   * cancels the scale: a 1 BTC buy off a mid of 100 disclosed
   * `0.000000000000000101` instead of `101`. Nothing was mis-settled — settle
   * pays `fillNotional` — but A4.1 requires the quote to state its price, and
   * every suite that touched it compared `bound.fillPrice` to `q.quotedPrice`,
   * i.e. the wrong number to itself.
   *
   * Asserted as a formatted decimal string on purpose. Comparing two `Amount`s
   * is what hid this for the life of the module.
   */
  it('states a per-unit price at the same scale as the notional it charges', () => {
    expect(formatAmount(buildOtcQuote({ ...base, side: 'buy' }).quotedPrice)).toBe('101');
    expect(formatAmount(buildOtcQuote({ ...base, side: 'sell' }).quotedPrice)).toBe('99');
  });

  /** price × qty must land back on the notional, or one of the two is lying. */
  it('keeps price × size consistent with the notional across sizes', () => {
    for (const qty of ['1', '2', '0.5', '7.25']) {
      const q = buildOtcQuote({ ...base, side: 'buy', qty: parseAmount(qty) });
      // 100 mid + 100 bps = 101 per unit, whatever the size.
      expect(formatAmount(q.quotedPrice)).toBe('101');
      expect(formatAmount(q.userNotional)).toBe(formatAmount(mul(q.quotedPrice, q.qty, 'floor')));
    }
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
