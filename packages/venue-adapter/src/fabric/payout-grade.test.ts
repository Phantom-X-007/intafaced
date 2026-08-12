import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { VenueUnavailableError, type VenueBookSnapshot } from '@intafaced/venue-contracts';
import {
  DEFAULT_MIN_BEST_LEVEL_NOTIONAL,
  assertPayoutGradeBook,
  assessOrderBookPayoutGrade,
  assessVenueBookPayoutGrade,
  bestLevelMeetsPayoutFloor,
  isPayoutGradeBook,
  isPayoutGradeOrderBook,
  levelNotional,
  minBestLevelNotional,
  withPayoutGradeGate,
} from './payout-grade.js';
import type { MarketDataAdapter, VenueDescriptor } from '@intafaced/venue-contracts';

const SCALE = 10n ** 18n;

function level(price: string, qty: string): readonly [bigint, bigint] {
  return [parseAmount(price), parseAmount(qty)] as const;
}

function snapshot(
  over: {
    bids?: VenueBookSnapshot['bids'];
    asks?: VenueBookSnapshot['asks'];
  } = {},
): VenueBookSnapshot {
  return {
    venueId: 'binance-spot',
    symbol: 'BTC/USDT',
    bids: over.bids ?? [level('30000', '2')],
    asks: over.asks ?? [level('30002', '1')],
    sequence: 1,
    sequenced: true,
    observedAt: new Date(0),
  };
}

describe('DEFAULT_MIN_BEST_LEVEL_NOTIONAL — one number with mark-from-depth', () => {
  it('is the DIRECTION §8 absolute floor string, not a second ruling', () => {
    // Must stay equal to services/svc-trade/.../mark-from-depth.ts.
    expect(DEFAULT_MIN_BEST_LEVEL_NOTIONAL).toBe('100');
    expect(minBestLevelNotional()).toBe(parseAmount('100'));
  });

  it('falls back to the default when the policy string is unreadable', () => {
    expect(minBestLevelNotional({ minBestLevelNotional: 'not-a-decimal' })).toBe(parseAmount('100'));
  });
});

describe('levelNotional / bestLevelMeetsPayoutFloor', () => {
  it('computes quote notional without floats', () => {
    // 30000 × 0.01 = 300
    expect(levelNotional(parseAmount('30000'), parseAmount('0.01'))).toBe(parseAmount('300'));
  });

  it('refuses dust that is fifteen orders of magnitude under the floor', () => {
    // Two 1-wei notionals — the measured exploit shape.
    const dust = [1n, 1n] as const;
    expect(levelNotional(dust[0], dust[1])).toBe(0n); // (1*1)/1e18 truncates to 0
    expect(bestLevelMeetsPayoutFloor(dust)).toBe(false);
  });

  it('accepts a level exactly at the floor', () => {
    // price 100, qty 1 → notional 100
    expect(bestLevelMeetsPayoutFloor(level('100', '1'))).toBe(true);
    // just under
    expect(bestLevelMeetsPayoutFloor([(100n * SCALE) / 2n, 1n])).toBe(false);
  });
});

describe('assertPayoutGradeBook', () => {
  it('passes a thick two-sided book through unchanged', () => {
    const snap = snapshot();
    expect(assertPayoutGradeBook(snap)).toBe(snap);
    expect(isPayoutGradeBook(snap)).toBe(true);
  });

  it('passes an EMPTY book through — absence is a fact, not a dust quote', () => {
    const snap = snapshot({ bids: [], asks: [] });
    expect(assertPayoutGradeBook(snap)).toBe(snap);
    expect(isPayoutGradeBook(snap)).toBe(false);
  });

  it('passes a ONE-SIDED book through — caller refuses the mid, adapter does not invent', () => {
    const snap = snapshot({ asks: [] });
    expect(assertPayoutGradeBook(snap)).toBe(snap);
    expect(isPayoutGradeBook(snap)).toBe(false);
  });

  it('REFUSES a two-sided dust book rather than serving a mid-able quote', () => {
    const snap = snapshot({
      bids: [[1n, 1n]],
      asks: [[2n, 1n]],
    });
    expect(isPayoutGradeBook(snap)).toBe(false);
    try {
      assertPayoutGradeBook(snap);
      expect.unreachable('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(VenueUnavailableError);
      expect((error as VenueUnavailableError).reason).toBe('no_depth');
      expect((error as VenueUnavailableError).message).toMatch(/not payout-grade/);
      expect((error as VenueUnavailableError).message).toMatch(/D26-P1-T8/);
    }
  });

  it('REFUSES when only one side is below the floor', () => {
    const snap = snapshot({
      bids: [level('30000', '2')], // thick
      asks: [level('30002', '0.000001')], // ~0.03 quote — under 100
    });
    try {
      assertPayoutGradeBook(snap);
      expect.unreachable('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(VenueUnavailableError);
      expect((error as VenueUnavailableError).reason).toBe('no_depth');
    }
  });

  it('honours an explicit higher floor without inventing a second default constant', () => {
    const snap = snapshot({
      bids: [level('100', '1')], // notional 100
      asks: [level('100', '1')],
    });
    expect(assertPayoutGradeBook(snap)).toBe(snap);
    expect(() => assertPayoutGradeBook(snap, { minBestLevelNotional: '101' })).toThrow(/not payout-grade/);
  });
});

describe('assessOrderBookPayoutGrade — consolidateBook wire books', () => {
  it('accepts a two-sided book whose best levels clear the floor', () => {
    const verdict = assessOrderBookPayoutGrade({
      bids: [['100', '2']],
      asks: [['101', '2']],
    });
    expect(verdict.ok).toBe(true);
    expect(isPayoutGradeOrderBook({ bids: [['100', '2']], asks: [['101', '2']] })).toBe(true);
  });

  it('refuses dust levels that would mint a mid', () => {
    const verdict = assessOrderBookPayoutGrade({
      bids: [['2000', '0.000000000000000001']],
      asks: [['2001', '0.000000000000000001']],
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/^thin_/);
  });

  it('refuses one-sided and empty books (aggregation must not merge half a mid)', () => {
    expect(assessOrderBookPayoutGrade({ bids: [['100', '2']], asks: [] }).ok).toBe(false);
    const empty = assessOrderBookPayoutGrade({ bids: [], asks: [] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('empty_book');
  });

  it('assesses fabric snapshots on scaled bigint levels', () => {
    const thick: Pick<VenueBookSnapshot, 'bids' | 'asks'> = {
      bids: [level('100', '2')],
      asks: [level('101', '2')],
    };
    const dust: Pick<VenueBookSnapshot, 'bids' | 'asks'> = {
      bids: [[1n, 1n]],
      asks: [[2n, 1n]],
    };
    expect(assessVenueBookPayoutGrade(thick).ok).toBe(true);
    expect(assessVenueBookPayoutGrade(dust).ok).toBe(false);
  });
});

describe('withPayoutGradeGate', () => {
  const venue: VenueDescriptor = {
    id: 'test-venue',
    displayName: 'Test',
    kind: 'external-cex',
    sequencedDepth: true,
  };

  function stubAdapter(snap: VenueBookSnapshot): MarketDataAdapter {
    return {
      venue,
      markets: async () => [],
      snapshotBook: async () => snap,
      streamBook: async () => ({
        deltas: (async function* () {})(),
        close: async () => undefined,
      }),
    };
  }

  it('passes a payout-grade snapshot through', async () => {
    const snap = snapshot({
      bids: [level('100', '2')],
      asks: [level('101', '2')],
    });
    const gated = withPayoutGradeGate(stubAdapter({ ...snap, venueId: venue.id }));
    await expect(gated.snapshotBook('BTC/USDT')).resolves.toMatchObject({ venueId: venue.id });
  });

  it('refuses a thin snapshot as no_depth — never invents a mid', async () => {
    const snap = snapshot({
      bids: [[1n, 1n]],
      asks: [[2n, 1n]],
    });
    const gated = withPayoutGradeGate(stubAdapter({ ...snap, venueId: venue.id }));
    await expect(gated.snapshotBook('BTC/USDT')).rejects.toSatisfy((err: unknown) => {
      return err instanceof VenueUnavailableError && err.reason === 'no_depth' && /not payout-grade/.test(err.message);
    });
  });
});
