import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import { PricingError, tokenCost, usageCost, windowCost, windowIdFor } from './pricing.js';

/**
 * Cost arithmetic. No database, no ledger, no provider — this is the layer that
 * decides how much a user is charged, and it is a pure function, so it is
 * tested exhaustively and cheaply.
 *
 * The tests that matter most are the two about WHERE the rounding happens.
 * Everything else here is arithmetic; those two are the design.
 */

const price = (input: string, output: string) => ({ inputPerMillion: amt(input), outputPerMillion: amt(output) });

describe('tokenCost', () => {
  it('prices a round million exactly', () => {
    expect(formatAmount(tokenCost(1_000_000, amt('3')))).toBe('3');
    expect(formatAmount(tokenCost(2_500_000, amt('3')))).toBe('7.5');
  });

  it('prices a fraction of a million without touching a float', () => {
    // 1234 tokens at 3 per million = 0.003702 exactly.
    expect(formatAmount(tokenCost(1234, amt('3')))).toBe('0.003702');
  });

  it('is free when the rate is zero', () => {
    expect(tokenCost(999_999, amt('0'))).toBe(0n);
  });

  it('is free when nothing was used', () => {
    expect(tokenCost(0, amt('15'))).toBe(0n);
  });

  it('rounds up, so a non-zero usage is never free', () => {
    // One token at the smallest expressible rate: the true cost is 1e-24, which
    // is below the ledger's precision. Rounding down would make it free, and a
    // fee that rounds to zero is a fee the house pays (ledger-client `mulBps`).
    const dust = amt('0.000000000000000001');
    expect(tokenCost(1, dust)).toBe(1n);
    expect(formatAmount(tokenCost(1, dust))).toBe('0.000000000000000001');
  });

  it('accepts bigint counts, so a window total never has to fit in a double', () => {
    expect(formatAmount(tokenCost(10_000_000_000n, amt('1')))).toBe('10000');
  });

  it('refuses a negative or fractional count rather than pricing it', () => {
    expect(() => tokenCost(-1, amt('1'))).toThrow(PricingError);
    expect(() => tokenCost(1.5, amt('1'))).toThrow(PricingError);
    expect(() => tokenCost(1, -1n)).toThrow(PricingError);
  });
});

describe('usageCost', () => {
  it('charges input and output at their own rates', () => {
    const cost = usageCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, price('3', '15'));
    expect(formatAmount(cost)).toBe('18');
  });

  it('charges nothing for a call that produced nothing', () => {
    expect(usageCost({ inputTokens: 0, outputTokens: 0 }, price('3', '15'))).toBe(0n);
  });
});

describe('windowCost — where the rounding happens', () => {
  it('sums exact token counts and rounds ONCE, not once per call', () => {
    // Three calls of one token each, at the smallest expressible rate.
    //
    //   per-call rounding:  ceil(1e-24) × 3 = 3e-18
    //   window rounding:    ceil(3e-24)     = 1e-18
    //
    // The gap is the whole reason `usage_records` stores counts and never
    // costs. Over a chatty session the per-call error compounds in one
    // direction and is a function of how many times the agent spoke.
    const dust = price('0.000000000000000001', '0');

    const perCall = usageCost({ inputTokens: 1, outputTokens: 0 }, dust) * 3n;
    const perWindow = windowCost([{ inputTokens: 3n, outputTokens: 0n, price: dust }]);

    expect(formatAmount(perCall)).toBe('0.000000000000000003');
    expect(formatAmount(perWindow)).toBe('0.000000000000000001');
    expect(perWindow).toBeLessThan(perCall);
  });

  it('merges groups at the same rate, so the bill does not depend on row grouping', () => {
    const rate = price('0.000000000000000001', '0');

    const split = windowCost([
      { inputTokens: 1n, outputTokens: 0n, price: rate },
      { inputTokens: 1n, outputTokens: 0n, price: rate },
      { inputTokens: 1n, outputTokens: 0n, price: rate },
    ]);
    const whole = windowCost([{ inputTokens: 3n, outputTokens: 0n, price: rate }]);

    expect(split).toBe(whole);
  });

  it('keeps different rates apart — a price change mid-window does not re-price the past', () => {
    const cost = windowCost([
      { inputTokens: 1_000_000n, outputTokens: 0n, price: price('3', '15') },
      { inputTokens: 1_000_000n, outputTokens: 0n, price: price('1', '5') },
    ]);
    expect(formatAmount(cost)).toBe('4');
  });

  it('is zero for a window with no usage', () => {
    expect(windowCost([])).toBe(0n);
  });
});

describe('windowIdFor', () => {
  it('is deterministic and UTC', () => {
    const at = new Date('2026-07-27T13:45:00.000Z');
    expect(windowIdFor(at, 60)).toBe('2026-07-27#0013');
    expect(windowIdFor(at, 60)).toBe(windowIdFor(new Date(at.getTime() + 59_000), 60));
  });

  it('starts a new window at the boundary', () => {
    expect(windowIdFor(new Date('2026-07-27T13:59:59.999Z'), 60)).toBe('2026-07-27#0013');
    expect(windowIdFor(new Date('2026-07-27T14:00:00.000Z'), 60)).toBe('2026-07-27#0014');
  });

  it('never straddles midnight', () => {
    expect(windowIdFor(new Date('2026-07-27T23:59:59.999Z'), 15)).toBe('2026-07-27#0095');
    expect(windowIdFor(new Date('2026-07-28T00:00:00.000Z'), 15)).toBe('2026-07-28#0000');
  });

  it('refuses a window length that does not divide a day', () => {
    // A 7-minute window would drift across midnight, and the window id is half
    // of the ledger idempotency key — an ambiguous id is an ambiguous charge.
    expect(() => windowIdFor(new Date(), 7)).toThrow(PricingError);
    expect(() => windowIdFor(new Date(), 0)).toThrow(PricingError);
  });
});
