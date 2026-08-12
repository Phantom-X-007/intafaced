import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import {
  VenueUnavailableError,
  topOfBook,
  type MarketDataAdapter,
  type VenueBookSnapshot,
  type VenueDescriptor,
} from '@intafaced/venue-contracts';
import {
  assertPayoutGradeBook,
  bestLevelIsPayoutGrade,
  DEFAULT_PAYOUT_GRADE_MIN_BEST_LEVEL_NOTIONAL,
  isPayoutGradeBook,
  isPayoutGradeTop,
  withPayoutGradeRefuse,
} from './payout-grade.js';

const VENUE: VenueDescriptor = {
  id: 'test-venue',
  displayName: 'Test',
  kind: 'external-cex',
  sequencedDepth: true,
};

function snap(over: Partial<VenueBookSnapshot> & Pick<VenueBookSnapshot, 'bids' | 'asks'>): VenueBookSnapshot {
  return {
    venueId: VENUE.id,
    symbol: 'BTC/USDT',
    sequence: 1,
    sequenced: true,
    observedAt: new Date(0),
    ...over,
  };
}

/** Thick enough: 30_000 × 2 = 60_000 quote units ≫ 100. */
const THICK = {
  bids: [[parseAmount('30000'), parseAmount('2')]] as const,
  asks: [[parseAmount('30002'), parseAmount('1')]] as const,
};

/** Dust: one wei a side — the measured exploit shape. */
const DUST = {
  bids: [[parseAmount('1000'), parseAmount('0.000000000000000001')]] as const,
  asks: [[parseAmount('3000'), parseAmount('0.000000000000000001')]] as const,
};

describe('payout-grade absolute floor', () => {
  it('exposes the same placeholder floor the mark path uses', () => {
    expect(DEFAULT_PAYOUT_GRADE_MIN_BEST_LEVEL_NOTIONAL).toBe('100');
  });

  it('accepts a best level worth at least the floor', () => {
    // 100 USDT exactly at price 100 with qty 1.
    expect(bestLevelIsPayoutGrade(parseAmount('100'), parseAmount('1'))).toBe(true);
  });

  it('refuses a best level one wei under the floor', () => {
    // 99.999… quote units.
    expect(bestLevelIsPayoutGrade(parseAmount('100'), parseAmount('0.999999999999999999'))).toBe(false);
  });

  it('refuses non-positive price or quantity', () => {
    expect(bestLevelIsPayoutGrade(0n, parseAmount('1'))).toBe(false);
    expect(bestLevelIsPayoutGrade(parseAmount('100'), 0n)).toBe(false);
  });
});

describe('isPayoutGradeBook', () => {
  it('passes a two-sided thick book', () => {
    expect(isPayoutGradeBook(snap(THICK))).toBe(true);
  });

  it('fails an empty book', () => {
    expect(isPayoutGradeBook(snap({ bids: [], asks: [] }))).toBe(false);
  });

  it('fails a one-sided book', () => {
    expect(isPayoutGradeBook(snap({ bids: THICK.bids, asks: [] }))).toBe(false);
    expect(isPayoutGradeBook(snap({ bids: [], asks: THICK.asks }))).toBe(false);
  });

  it('fails two dust levels that would once have minted a mid of 2000', () => {
    expect(isPayoutGradeBook(snap(DUST))).toBe(false);
  });
});

describe('isPayoutGradeTop', () => {
  it('matches the book gate on a computed top', () => {
    expect(isPayoutGradeTop(topOfBook(THICK.bids, THICK.asks))).toBe(true);
    expect(isPayoutGradeTop(topOfBook(DUST.bids, DUST.asks))).toBe(false);
    expect(isPayoutGradeTop(topOfBook([], []))).toBe(false);
  });
});

describe('assertPayoutGradeBook', () => {
  it('returns the same snapshot when payout-grade', () => {
    const book = snap(THICK);
    expect(assertPayoutGradeBook(book)).toBe(book);
  });

  it('throws VenueUnavailableError no_depth for a dust book', () => {
    try {
      assertPayoutGradeBook(snap(DUST));
      expect.unreachable('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(VenueUnavailableError);
      expect((error as VenueUnavailableError).reason).toBe('no_depth');
      expect((error as VenueUnavailableError).venueId).toBe('test-venue');
      expect((error as VenueUnavailableError).message).toContain('not payout-grade');
      expect((error as VenueUnavailableError).message).toContain('D26-P1-T8');
    }
  });

  it('throws for empty and one-sided books — not a silent empty return', () => {
    expect(() => assertPayoutGradeBook(snap({ bids: [], asks: [] }))).toThrow(VenueUnavailableError);
    expect(() => assertPayoutGradeBook(snap({ bids: THICK.bids, asks: [] }))).toThrow(/not payout-grade/);
  });
});

describe('withPayoutGradeRefuse', () => {
  it('lets a thick snapshot through and refuses a dust one', async () => {
    const inner: MarketDataAdapter = {
      venue: VENUE,
      async markets() {
        return [];
      },
      async snapshotBook() {
        return snap(DUST);
      },
      async streamBook() {
        throw new Error('not used');
      },
    };

    const wrapped = withPayoutGradeRefuse(inner);
    await expect(wrapped.snapshotBook('BTC/USDT')).rejects.toThrow(/not payout-grade/);

    const thickInner: MarketDataAdapter = {
      ...inner,
      async snapshotBook() {
        return snap(THICK);
      },
    };
    const ok = await withPayoutGradeRefuse(thickInner).snapshotBook('BTC/USDT');
    expect(isPayoutGradeBook(ok)).toBe(true);
  });
});
