import { describe, expect, it } from 'vitest';
import { INTERNAL_BOOK_FEE_UNSET, InternalBookFeeUnconfiguredError, venuesFor, type VenueSetEnv } from './venue-set.js';
import { ClobFeeUnconfiguredError } from './clob-costs.js';

const base = (overrides: Partial<VenueSetEnv> = {}): VenueSetEnv => ({
  INDEXER_URL: 'http://indexer.test',
  MATCHING_URL: 'http://matching.test',
  QUOTE_MAX_AGE_MS: 2_000,
  DEX_CLOB_FEE_BPS: undefined,
  DEX_CLOB_SETTLEMENT_COST: undefined,
  DEX_INTERNAL_BOOK_ENABLED: true,
  DEX_INTERNAL_BOOK_FEE_BPS: 20,
  DEX_EXTERNAL_VENUES: [],
  ...overrides,
});

describe('S-I3 venue set — CLOB only with an explicit fee schedule', () => {
  it('does not quote intachain-clob when both CLOB knobs are unset', () => {
    expect(venuesFor(base(), 'ROW').map((v) => v.id)).toEqual(['internal-book']);
  });

  it('quotes intachain-clob when the operator copied both venue figures', () => {
    const venues = venuesFor(base({ DEX_CLOB_FEE_BPS: 10, DEX_CLOB_SETTLEMENT_COST: '0' }), 'ROW');
    expect(venues.map((v) => v.id)).toEqual(['intachain-clob', 'internal-book']);
    expect(venues[0]?.feeBps).toBe(10);
    expect(venues[0]?.settlementCost).toBe(0n);
  });

  it('refuses a one-sided CLOB config rather than filling the other knob with zero', () => {
    expect(() => venuesFor(base({ DEX_CLOB_FEE_BPS: 0 }), 'ROW')).toThrow(ClobFeeUnconfiguredError);
  });
});

describe('QUOTE_MAX_AGE_MS unpublished — no invented 2000 timeout', () => {
  it('attaches no venues when max age is unset rather than timing out at 2000', () => {
    expect(
      venuesFor(
        base({
          QUOTE_MAX_AGE_MS: undefined,
          DEX_CLOB_FEE_BPS: 10,
          DEX_CLOB_SETTLEMENT_COST: '0',
        }),
        'ROW',
      ),
    ).toEqual([]);
  });
});

describe('H11 internal-book fee — no silent 20', () => {
  it('refuses an enabled internal book when fee bps are unset rather than inventing 20', () => {
    expect(() => venuesFor(base({ DEX_INTERNAL_BOOK_FEE_BPS: undefined }), 'ROW')).toThrow(InternalBookFeeUnconfiguredError);
    try {
      venuesFor(base({ DEX_INTERNAL_BOOK_FEE_BPS: undefined }), 'ROW');
    } catch (err) {
      expect(err).toBeInstanceOf(InternalBookFeeUnconfiguredError);
      if (err instanceof InternalBookFeeUnconfiguredError) expect(err.code).toBe(INTERNAL_BOOK_FEE_UNSET);
    }
  });

  it('quotes the internal book when the operator published an explicit fee, including honest zero', () => {
    const venues = venuesFor(base({ DEX_INTERNAL_BOOK_FEE_BPS: 0 }), 'ROW');
    expect(venues.map((v) => v.id)).toEqual(['internal-book']);
    expect(venues[0]?.feeBps).toBe(0);
    expect(venues[0]?.kind).toBe('internal');
  });

  it('omits the internal book when the operator disabled it, even with fee unset', () => {
    expect(venuesFor(base({ DEX_INTERNAL_BOOK_ENABLED: false, DEX_INTERNAL_BOOK_FEE_BPS: undefined }), 'ROW')).toEqual([]);
  });
});

describe('Q-dex — do not wire AMM without indexer reserves', () => {
  it('shipped venue set never attaches kind amm', () => {
    const venues = venuesFor(base(), 'ROW');
    expect(venues.map((v) => v.kind)).toEqual(['internal']);
    expect(venues.every((v) => v.kind !== 'amm')).toBe(true);
  });
});
