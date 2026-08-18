import { describe, expect, it } from 'vitest';
import { assertReleasePostable, P2pError } from './p2p-service.js';

/**
 * Dust + fee → permanently unpostable release (decide-then-post trap).
 *
 * The ledger refuses a release when the buyer leg is ≤ 0 after ceil fee.
 * Writing resolution=released first would leave the pot late forever.
 */
describe('assertReleasePostable', () => {
  it('accepts a normal amount with a non-zero fee', () => {
    expect(() => assertReleasePostable(100n, 30)).not.toThrow();
  });

  it('accepts dust when the fee is zero', () => {
    expect(() => assertReleasePostable(1n, 0)).not.toThrow();
  });

  it('refuses one scaled unit when any fee would ceil to the whole amount', () => {
    expect(() => assertReleasePostable(1n, 1)).toThrow(P2pError);
    try {
      assertReleasePostable(1n, 30);
    } catch (err) {
      expect(err).toMatchObject({ code: 'p2p.release_unpostable' });
    }
  });

  it('refuses when the fee equals the amount under high bps', () => {
    // 10000 bps is already invalid_fee; 9999 on amount 1 still ceils fee to 1.
    expect(() => assertReleasePostable(1n, 9999)).toThrow(expect.objectContaining({ code: 'p2p.release_unpostable' }));
  });

  it('keeps the fractional-fee refusal separate', () => {
    expect(() => assertReleasePostable(100n, 12.5)).toThrow(expect.objectContaining({ code: 'p2p.invalid_fee_bps' }));
  });
});
