import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { DEFAULT_MAX_LEVERAGE, LEVERAGE_INVALID, LEVERAGE_TOO_HIGH, checkLeverage, initialMargin, maxLeverage } from './initial-margin.js';

describe('initialMargin', () => {
  it('1 BTC at 50_000 with 10x → 5_000 quote units (scaled)', () => {
    // 1e18 * 50000e18 / 1e18 / 10 = 5000e18
    const m = initialMargin({
      size: parseAmount('1'),
      entryPrice: parseAmount('50000'),
      leverage: parseAmount('10'),
    });
    expect(m).toBe(parseAmount('5000'));
  });

  it('refuses zero leverage', () => {
    expect(() =>
      initialMargin({
        size: parseAmount('1'),
        entryPrice: parseAmount('100'),
        leverage: parseAmount('0'),
      }),
    ).toThrow(/leverage/);
  });
});

/**
 * THE CEILING THAT DID NOT EXIST.
 *
 * `grep -rn "MAX_LEVERAGE\|maxLeverage"` returned nothing before this change:
 * `> 0` was the whole check, and the only ceiling in the path was
 * `numeric(8, 2)` overflowing at 1,000,000x into a Postgres `22003` and a 500.
 */
describe('checkLeverage', () => {
  const amt = parseAmount;

  it('there is a cap, it is one number, and it is the one the deployment uses', () => {
    expect(DEFAULT_MAX_LEVERAGE).toBe('10');
    expect(maxLeverage()).toBe(amt(DEFAULT_MAX_LEVERAGE));
    // Omitted / non-positive configuration is not "no cap".
    expect(maxLeverage(null)).toBe(amt('10'));
    expect(maxLeverage(0n)).toBe(amt('10'));
  });

  it('admits the range this repository actually trades, and refuses above it', () => {
    for (const ok of ['0.5', '1', '2', '5', '10']) expect(checkLeverage(amt(ok))).toEqual({ ok: true });
    expect(checkLeverage(amt('10.01')).code).toBe(LEVERAGE_TOO_HIGH);
    expect(checkLeverage(amt('100')).code).toBe(LEVERAGE_TOO_HIGH);
    expect(checkLeverage(amt('100000')).code).toBe(LEVERAGE_TOO_HIGH);
  });

  /**
   * THE 500, AT ITS SOURCE. `numeric(8, 2)` holds 999,999.99; `1000000` raised
   * `22003` from the INSERT. It is now a refusal, and one the caller can read.
   */
  it('refuses the value that used to reach Postgres and raise 22003', () => {
    const check = checkLeverage(amt('1000000'));
    expect(check.ok).toBe(false);
    expect(check.code).toBe(LEVERAGE_TOO_HIGH);
    expect(check.reason).toMatch(/1000000x exceeds the maximum of 10x/);
  });

  it('separates "not a leverage" from "too much leverage"', () => {
    expect(checkLeverage(amt('0')).code).toBe(LEVERAGE_INVALID);
    expect(checkLeverage(-1n).code).toBe(LEVERAGE_INVALID);
  });

  /** The ruling has one place to land: an injected maximum, honoured in both directions. */
  it('honours an owner-set maximum without any call site changing', () => {
    expect(checkLeverage(amt('50'), amt('100'))).toEqual({ ok: true });
    expect(checkLeverage(amt('50'), amt('20')).code).toBe(LEVERAGE_TOO_HIGH);
  });
});
