/**
 * The futures mark gates — `prices.ts`'s vocabulary, in futures' namespace.
 *
 * Each test here names a row of the refuse table in
 * `docs/adr/2026-08-05-futures-risk-and-mark-law.md`.
 */
import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import {
  DEFAULT_FUTURES_MARK_POLICY,
  MARK_INVALID,
  MARK_MISSING,
  MARK_UNUSABLE,
  acceptableForLiquidation,
  acceptableForMarking,
  markMissing,
  type FuturesQuotedMark,
  type MarkPolicy,
  type MarkQuality,
} from './mark-policy.js';

const NOW = new Date('2026-08-06T12:00:00.000Z');

function mark(overrides: Partial<FuturesQuotedMark> = {}): FuturesQuotedMark {
  return {
    marketId: 'btc-perp',
    price: amt('50000'),
    asOf: NOW,
    quality: 'mid',
    ...overrides,
  };
}

function agedSeconds(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1_000);
}

describe('the vocabulary is the one prices.ts already decided', () => {
  it('has the same three qualities and the same four policy fields', () => {
    const qualities: MarkQuality[] = ['mid', 'last', 'index'];
    expect(qualities).toHaveLength(3);

    const keys = Object.keys(DEFAULT_FUTURES_MARK_POLICY).sort();
    expect(keys).toEqual(['liquidationMaxAgeSeconds', 'liquidationQualities', 'maxAgeSeconds', 'maxDeviationBps']);
  });

  it('uses futures-namespaced codes, not the bank ones', () => {
    for (const code of [MARK_UNUSABLE, MARK_MISSING, MARK_INVALID]) {
      expect(code.startsWith('trade.')).toBe(true);
      expect(code.startsWith('bank.')).toBe(false);
    }
  });
});

describe('acceptableForMarking', () => {
  it('accepts a fresh positive mark of any quality — valuing is not seizing', () => {
    for (const quality of ['mid', 'last', 'index'] as const) {
      expect(acceptableForMarking(mark({ quality }), NOW, DEFAULT_FUTURES_MARK_POLICY).ok).toBe(true);
    }
  });

  it('refuses a non-positive mark as invalid, not as a cheap market', () => {
    const check = acceptableForMarking(mark({ price: 0n }), NOW, DEFAULT_FUTURES_MARK_POLICY);
    expect(check.ok).toBe(false);
    expect(check.code).toBe(MARK_INVALID);
  });

  it('refuses a mark past the marking staleness limit', () => {
    const check = acceptableForMarking(mark({ asOf: agedSeconds(301) }), NOW, DEFAULT_FUTURES_MARK_POLICY);
    expect(check.ok).toBe(false);
    expect(check.code).toBe(MARK_UNUSABLE);
  });

  it('refuses a mark dated in the future — a clock problem is how a stale price passes', () => {
    const check = acceptableForMarking(mark({ asOf: new Date(NOW.getTime() + 60_000) }), NOW, DEFAULT_FUTURES_MARK_POLICY);
    expect(check.ok).toBe(false);
    expect(check.code).toBe(MARK_UNUSABLE);
  });
});

describe('acceptableForLiquidation — the strictly higher bar', () => {
  /** THE ADR DONE BAR, item 3. */
  it('refuses `last` as a liquidation basis under the default policy', () => {
    expect(DEFAULT_FUTURES_MARK_POLICY.liquidationQualities).toEqual(['index', 'mid']);

    const lastMark = mark({ quality: 'last' });
    // Good enough to show someone.
    expect(acceptableForMarking(lastMark, NOW, DEFAULT_FUTURES_MARK_POLICY).ok).toBe(true);
    // Not good enough to close their position.
    const check = acceptableForLiquidation(lastMark, null, NOW, DEFAULT_FUTURES_MARK_POLICY);
    expect(check.ok).toBe(false);
    expect(check.code).toBe(MARK_UNUSABLE);
    expect(check.reason).toContain('not a liquidation basis');
  });

  it('accepts index and mid', () => {
    for (const quality of ['index', 'mid'] as const) {
      expect(acceptableForLiquidation(mark({ quality }), null, NOW, DEFAULT_FUTURES_MARK_POLICY).ok).toBe(true);
    }
  });

  /** THE ASYMMETRY. A mark can be fine to warn on and not fine to seize on. */
  it('is stricter about staleness than marking is, on the same mark', () => {
    const stale = mark({ asOf: agedSeconds(90) });
    expect(acceptableForMarking(stale, NOW, DEFAULT_FUTURES_MARK_POLICY).ok).toBe(true);

    const check = acceptableForLiquidation(stale, null, NOW, DEFAULT_FUTURES_MARK_POLICY);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('liquidation limit');
  });

  it('trips the deviation breaker on a move exactly on it — integer bps, rounded up', () => {
    const policy: MarkPolicy = { ...DEFAULT_FUTURES_MARK_POLICY, maxDeviationBps: 2_000 };
    const previous = amt('50000');

    // 20% down = exactly 2000bps. Rounds up, so it trips.
    const onBreaker = acceptableForLiquidation(mark({ price: amt('40000') }), previous, NOW, { ...policy, maxDeviationBps: 1_999 });
    expect(onBreaker.ok).toBe(false);

    // Just inside.
    expect(acceptableForLiquidation(mark({ price: amt('45000') }), previous, NOW, policy).ok).toBe(true);

    // Well outside.
    const blown = acceptableForLiquidation(mark({ price: amt('20000') }), previous, NOW, policy);
    expect(blown.ok).toBe(false);
    expect(blown.reason).toContain('not liquidating through it');
  });

  it('skips the breaker when there is no previous mark', () => {
    expect(acceptableForLiquidation(mark({ price: amt('1') }), null, NOW, DEFAULT_FUTURES_MARK_POLICY).ok).toBe(true);
  });

  it('uses no floats — a bigint price far past Number.MAX_SAFE_INTEGER still judges correctly', () => {
    const huge = amt('9007199254740993');
    const check = acceptableForLiquidation(mark({ price: huge }), huge, NOW, DEFAULT_FUTURES_MARK_POLICY);
    expect(check.ok).toBe(true);
  });
});

describe('a missing mark is not a zero mark', () => {
  /** THE ADR DONE BAR, item 4 (the vocabulary half; the no-liquidation half is in liquidation-tick.test.ts). */
  it('has its own code and says why, rather than producing a price', () => {
    const check = markMissing('btc-perp');
    expect(check.ok).toBe(false);
    expect(check.code).toBe(MARK_MISSING);
    expect(check.reason).toContain('rather than valuing it at nothing');
  });

  it('is a different refusal from a zero mark, because they are different failures', () => {
    expect(markMissing('btc-perp').code).not.toBe(acceptableForMarking(mark({ price: 0n }), NOW, DEFAULT_FUTURES_MARK_POLICY).code);
  });
});
