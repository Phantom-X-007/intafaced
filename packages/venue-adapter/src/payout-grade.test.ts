import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import type { MarketDataAdapter, VenueBookSnapshot, VenueDescriptor } from '@intafaced/venue-contracts';
import { VenueUnavailableError } from '@intafaced/venue-contracts';
import {
  DEFAULT_MIN_BEST_LEVEL_NOTIONAL,
  assessOrderBookPayoutGrade,
  assessVenueBookPayoutGrade,
  isPayoutGradeOrderBook,
  withPayoutGradeGate,
} from './payout-grade.js';

describe('payout-grade book gate (D26-P1-T8)', () => {
  it('shares the absolute floor with the futures mark path', () => {
    expect(DEFAULT_MIN_BEST_LEVEL_NOTIONAL).toBe('100');
  });

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

  it('refuses one-sided books', () => {
    const verdict = assessOrderBookPayoutGrade({
      bids: [['100', '2']],
      asks: [],
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('one_sided');
  });

  it('refuses an empty book', () => {
    const verdict = assessOrderBookPayoutGrade({ bids: [], asks: [] });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('empty_book');
  });

  it('assesses fabric snapshots on scaled bigint levels', () => {
    const thick: Pick<VenueBookSnapshot, 'bids' | 'asks'> = {
      bids: [[amt('100'), amt('2')]],
      asks: [[amt('101'), amt('2')]],
    };
    const dust: Pick<VenueBookSnapshot, 'bids' | 'asks'> = {
      bids: [[amt('2000'), amt('0.000000000000000001')]],
      asks: [[amt('2001'), amt('0.000000000000000001')]],
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
    const snap: VenueBookSnapshot = {
      venueId: venue.id,
      symbol: 'BTC/USDT',
      bids: [[amt('100'), amt('2')]],
      asks: [[amt('101'), amt('2')]],
      sequence: 1,
      sequenced: true,
      observedAt: new Date(),
    };
    const gated = withPayoutGradeGate(stubAdapter(snap));
    await expect(gated.snapshotBook('BTC/USDT')).resolves.toBe(snap);
  });

  it('refuses a thin snapshot as no_depth — never invents a mid', async () => {
    const snap: VenueBookSnapshot = {
      venueId: venue.id,
      symbol: 'BTC/USDT',
      bids: [[amt('2000'), amt('0.000000000000000001')]],
      asks: [[amt('2001'), amt('0.000000000000000001')]],
      sequence: 1,
      sequenced: true,
      observedAt: new Date(),
    };
    const gated = withPayoutGradeGate(stubAdapter(snap));
    await expect(gated.snapshotBook('BTC/USDT')).rejects.toSatisfy((err: unknown) => {
      return err instanceof VenueUnavailableError && err.reason === 'no_depth' && /not payout-grade/.test(err.message);
    });
  });
});
