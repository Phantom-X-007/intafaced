import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import type { SorCostTerms } from '@intafaced/venue-adapter';
import type { RestLatencyGrade } from '@intafaced/venue-contracts';
import type { MmKillConfig, QuoteExternalMmInput } from './market-making.js';
import { massQuoteExternalMm, type MmMassQuoteInput } from './mm-mass-quote.js';
import { EXECUTION_MM_MMP_THRESHOLDS_ENV } from './mm-mmp-thresholds.js';
import { EXECUTION_MM_SPREAD_SKEW_BANDS_ENV } from './mm-spread-skew-bands.js';

function graded(): RestLatencyGrade {
  return {
    venueId: 'v',
    measurement: 'rest-round-trip',
    grade: 'A',
    provisional: false,
    samples: 20,
    p50Ms: 30,
    p95Ms: 40,
    rejectRateBps: 0,
    errorRateBps: 0,
    staleMs: 0,
    reasons: [],
  };
}

function completeTerms(over: Partial<SorCostTerms> = {}): SorCostTerms {
  return {
    feeBps: 0,
    expectedImpactBps: 0,
    transferCostBps: 0,
    latencyGrade: graded(),
    ...over,
  };
}

function clearKill(over: Partial<MmKillConfig> = {}): MmKillConfig {
  return {
    adminKill: false,
    inventory: { position: amt('0'), minPosition: amt('-10'), maxPosition: amt('10') },
    volatility: { realizedVolBps: 50, maxVolBps: 200 },
    ...over,
  };
}

function quote(over: Partial<QuoteExternalMmInput> = {}): QuoteExternalMmInput {
  return {
    symbol: 'BTC/USDT',
    venueId: 'binance',
    kind: 'external-cex',
    mid: amt('100'),
    book: { bidSize: amt('1'), askSize: amt('1') },
    quoteSize: amt('1'),
    halfSpreadBps: 10,
    inventorySkewBps: 0,
    costTerms: completeTerms(),
    kill: clearKill(),
    ...over,
  };
}

const MMP = JSON.stringify({
  maxFilledQuantity: '10',
  maxFilledDelta: 100,
  maxFilledVega: 50,
  maxOpenQuotes: 20,
  observationWindowMs: 1000,
});

const BANDS = JSON.stringify({
  minHalfSpreadBps: 1,
  maxHalfSpreadBps: 50,
  minInventorySkewBps: -25,
  maxInventorySkewBps: 25,
});

const OWNER_ENV = {
  [EXECUTION_MM_MMP_THRESHOLDS_ENV]: MMP,
  [EXECUTION_MM_SPREAD_SKEW_BANDS_ENV]: BANDS,
};

const INSIDE = {
  filledQuantity: amt('1'),
  filledDelta: 0,
  filledVega: 0,
  openQuotes: 1,
} as const;

function baseInput(over: Partial<MmMassQuoteInput> = {}): MmMassQuoteInput {
  return {
    quoteId: 'q-1',
    mmpGroup: 'desk-a',
    cancelOnDisconnect: true,
    frozen: false,
    validUntilMs: null,
    nowMs: null,
    observation: INSIDE,
    observationWindowMs: 1000,
    entries: [{ quoteSetId: 'spot', quote: quote() }],
    ...over,
  };
}

describe('massQuoteExternalMm — owner MMP set-level refuse', () => {
  it('refuses the whole set when owner MMP thresholds are unset', () => {
    const result = massQuoteExternalMm(baseInput(), { [EXECUTION_MM_SPREAD_SKEW_BANDS_ENV]: BANDS });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('mmp_thresholds_unset');
    expect(result.detail).toMatch(/unset/);
  });

  it('refuses the whole set when MMP is triggered (no quote-storm race)', () => {
    const result = massQuoteExternalMm(baseInput({ observation: { ...INSIDE, filledQuantity: amt('11') } }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('mmp_triggered');
  });

  it('refuses when frozen rather than inventing a reset clock', () => {
    const result = massQuoteExternalMm(baseInput({ frozen: true }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('mmp_frozen');
  });

  it('refuses when cancel-on-disconnect is off', () => {
    const result = massQuoteExternalMm(baseInput({ cancelOnDisconnect: false }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('cancel_on_disconnect_required');
  });

  it('refuses a missing MMP group rather than inventing default', () => {
    const result = massQuoteExternalMm(baseInput({ mmpGroup: '  ' }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('mmp_group_missing');
  });

  it('refuses a missing quoteId rather than inventing a message id', () => {
    const result = massQuoteExternalMm(baseInput({ quoteId: '' }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('quote_id_missing');
  });

  it('refuses when caller window does not match owner observationWindowMs', () => {
    const result = massQuoteExternalMm(baseInput({ observationWindowMs: 5000 }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('mmp_observation_incomplete');
    expect(result.detail).toMatch(/not stretched/);
  });

  it('refuses empty entries rather than inventing quotes', () => {
    const result = massQuoteExternalMm(baseInput({ entries: [] }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('empty_quotes');
  });

  it('refuses duplicate instrument in the same MMP group', () => {
    const result = massQuoteExternalMm(
      baseInput({
        entries: [
          { quoteSetId: 'a', quote: quote() },
          { quoteSetId: 'b', quote: quote() },
        ],
      }),
      OWNER_ENV,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('duplicate_instrument');
  });

  it('refuses when projected open quotes would exceed owner maxOpenQuotes', () => {
    const result = massQuoteExternalMm(baseInput({ observation: { ...INSIDE, openQuotes: 19 } }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('mmp_open_quotes_exceeded');
  });

  it('refuses validUntil when nowMs is unknown rather than inventing a clock', () => {
    const result = massQuoteExternalMm(baseInput({ validUntilMs: 2_000, nowMs: null }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('valid_until_clock_unknown');
  });

  it('refuses when validUntilMs has elapsed', () => {
    const result = massQuoteExternalMm(baseInput({ validUntilMs: 1_000, nowMs: 1_001 }), OWNER_ENV);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('timed_out');
  });

  it('refuses the set when owner spread/skew bands are unset', () => {
    const result = massQuoteExternalMm(baseInput(), { [EXECUTION_MM_MMP_THRESHOLDS_ENV]: MMP });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refuse');
    expect(result.reason).toBe('bands_unset');
  });
});

describe('massQuoteExternalMm — per-entry outcomes', () => {
  it('admits a two-sided external quote when owner MMP and bands are set', () => {
    const result = massQuoteExternalMm(baseInput(), OWNER_ENV);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected admit');
    expect(result.quoteId).toBe('q-1');
    expect(result.mmpGroup).toBe('desk-a');
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry?.ok).toBe(true);
    if (!entry?.ok) throw new Error('expected entry admit');
    expect(entry.quoteSetId).toBe('spot');
    expect(entry.quote.bid.side).toBe('bid');
    expect(entry.quote.ask.side).toBe('ask');
  });

  it('keeps per-entry outcomes: one missing mid does not invent a price for the other', () => {
    const result = massQuoteExternalMm(
      baseInput({
        entries: [
          { quoteSetId: 'spot', quote: quote({ symbol: 'BTC/USDT', mid: null }) },
          { quoteSetId: 'eth', quote: quote({ symbol: 'ETH/USDT' }) },
        ],
      }),
      OWNER_ENV,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected set admit');
    expect(result.entries[0]).toMatchObject({ ok: false, reason: 'missing_mid', quoteSetId: 'spot' });
    expect(result.entries[1]?.ok).toBe(true);
  });

  it('refuses an entry whose spread is outside owner bands without inventing a clamp', () => {
    const result = massQuoteExternalMm(
      baseInput({
        entries: [{ quoteSetId: 'spot', quote: quote({ halfSpreadBps: 80 }) }],
      }),
      OWNER_ENV,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected set admit');
    expect(result.entries[0]).toMatchObject({ ok: false, reason: 'half_spread_out_of_band' });
  });
});
