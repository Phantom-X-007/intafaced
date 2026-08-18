import { describe, expect, it } from 'vitest';
import {
  assertFundingRateWithinBound,
  FundingRateBoundError,
  parseFundingMaxAbsRate,
  resolveFundingMaxAbsRateForBoot,
} from './funding-rate-bound.js';

describe('funding-rate-bound', () => {
  it('empty max parses as null (unset — not a product default)', () => {
    expect(parseFundingMaxAbsRate(undefined)).toBeNull();
    expect(parseFundingMaxAbsRate('')).toBeNull();
    expect(parseFundingMaxAbsRate('  ')).toBeNull();
  });

  it('positive absolute decimal is accepted; signed/zero/garbage refused', () => {
    expect(parseFundingMaxAbsRate('0.01')).toBe('0.01');
    expect(parseFundingMaxAbsRate('1')).toBe('1');
    expect(() => parseFundingMaxAbsRate('-0.01')).toThrow(FundingRateBoundError);
    expect(() => parseFundingMaxAbsRate('0')).toThrow(/must be > 0/);
    expect(() => parseFundingMaxAbsRate('not-a-rate')).toThrow(FundingRateBoundError);
  });

  it('boot requires max when funding markets are listed — no silent invent', () => {
    expect(() => resolveFundingMaxAbsRateForBoot({ fundingMarketIds: ['m1'], maxAbsRateRaw: undefined })).toThrow(
      /TRADE_FUTURES_FUNDING_MAX_ABS_RATE is required/,
    );
    expect(resolveFundingMaxAbsRateForBoot({ fundingMarketIds: [], maxAbsRateRaw: undefined })).toBeNull();
    expect(resolveFundingMaxAbsRateForBoot({ fundingMarketIds: ['m1'], maxAbsRateRaw: '0.05' })).toBe('0.05');
  });

  it('unset max refuses any rate application (fail-closed)', () => {
    expect(() => assertFundingRateWithinBound('0.0001', null)).toThrow(
      expect.objectContaining({ code: 'trade.funding_rate_bound_unconfigured' }),
    );
    expect(() => assertFundingRateWithinBound('0.0001', '')).toThrow(FundingRateBoundError);
  });

  /**
   * C12 / BUILD-STOP D2 done bar: absurd published rates cannot charge.
   * Rate `"1000000"` must not pass a configured bound (test max is fixture, not law).
   */
  it('rate 1000000 exceeds a configured max and is refused with clear code', () => {
    // Fixture only — NOT Denon's product ceiling. Proves the refuse path.
    const testMax = '1';
    expect(() => assertFundingRateWithinBound('1000000', testMax)).toThrow(
      expect.objectContaining({ code: 'trade.funding_rate_exceeds_max' }),
    );
    expect(() => assertFundingRateWithinBound('-1000000', testMax)).toThrow(
      expect.objectContaining({ code: 'trade.funding_rate_exceeds_max' }),
    );
    // Legitimate small period rate under the same fixture bound is allowed.
    expect(() => assertFundingRateWithinBound('0.0001', testMax)).not.toThrow();
    expect(() => assertFundingRateWithinBound('-0.0001', testMax)).not.toThrow();
  });

  it('rate equal to max is allowed (bound is inclusive)', () => {
    expect(() => assertFundingRateWithinBound('0.01', '0.01')).not.toThrow();
    expect(() => assertFundingRateWithinBound('-0.01', '0.01')).not.toThrow();
  });
});
