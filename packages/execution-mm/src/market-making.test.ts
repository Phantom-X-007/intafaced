import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import type { SorCostTerms, VenueKind } from '@intafaced/venue-adapter';
import type { VenueLatencyGrade } from '@intafaced/venue-contracts';
import {
  evaluateMmKillSwitches,
  isExternalVenueKind,
  planExternalMmHedge,
  quoteExternalMm,
  refuseInternalMm,
  type MmKillConfig,
  type QuoteExternalMmInput,
} from './market-making.js';

function graded(letter: 'A' | 'B' | 'C' | 'D' | 'F' = 'A'): VenueLatencyGrade {
  return {
    venueId: 'v',
    measurement: 'rest-round-trip',
    grade: letter,
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

function ungraded(): VenueLatencyGrade {
  return {
    venueId: 'v',
    measurement: 'rest-round-trip',
    grade: null,
    provisional: false,
    samples: 0,
    p50Ms: null,
    p95Ms: null,
    rejectRateBps: null,
    errorRateBps: null,
    staleMs: null,
    reasons: ['no observations'],
  };
}

function completeTerms(over: Partial<SorCostTerms> = {}): SorCostTerms {
  return {
    feeBps: 5,
    expectedImpactBps: 2,
    transferCostBps: 1,
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

function baseQuote(over: Partial<QuoteExternalMmInput> = {}): QuoteExternalMmInput {
  return {
    symbol: 'BTC/USDT',
    venueId: 'binance',
    kind: 'external-cex',
    mid: amt('100'),
    book: { bidSize: amt('1'), askSize: amt('1') },
    quoteSize: amt('1'),
    halfSpreadBps: 10,
    inventorySkewBps: 0,
    costTerms: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
    kill: clearKill(),
    ...over,
  };
}

describe('isExternalVenueKind — D26-P0-01', () => {
  it('treats internal as non-external', () => {
    expect(isExternalVenueKind('internal')).toBe(false);
    expect(isExternalVenueKind('external-cex')).toBe(true);
    expect(isExternalVenueKind('external-dex')).toBe(true);
  });
});

describe('evaluateMmKillSwitches', () => {
  it('clears when admin off, vol inside band, inventory inside bands', () => {
    expect(evaluateMmKillSwitches(clearKill())).toEqual({ killed: false });
  });

  it('trips admin_kill', () => {
    const r = evaluateMmKillSwitches(clearKill({ adminKill: true }));
    expect(r.killed).toBe(true);
    if (r.killed) expect(r.reasons).toContain('admin_kill');
  });

  it('trips volatility_breach when realized exceeds owner max', () => {
    const r = evaluateMmKillSwitches(clearKill({ volatility: { realizedVolBps: 500, maxVolBps: 200 } }));
    expect(r.killed).toBe(true);
    if (r.killed) expect(r.reasons).toContain('volatility_breach');
  });

  it('trips volatility_breach when realized vol is unknown (no invent calm)', () => {
    const r = evaluateMmKillSwitches(clearKill({ volatility: { realizedVolBps: null, maxVolBps: 200 } }));
    expect(r.killed).toBe(true);
    if (r.killed) expect(r.reasons).toContain('volatility_breach');
  });

  it('trips inventory_breach outside owner bands', () => {
    const r = evaluateMmKillSwitches(clearKill({ inventory: { position: amt('25'), minPosition: amt('-10'), maxPosition: amt('10') } }));
    expect(r.killed).toBe(true);
    if (r.killed) expect(r.reasons).toContain('inventory_breach');
  });
});

describe('quoteExternalMm — D26-P1-X5', () => {
  it('emits two-sided external quote from owner spread around supplied mid', () => {
    const result = quoteExternalMm(baseQuote());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // halfSpread 10 bps on 100 → 0.10 each side
    expect(formatAmount(result.bid.price)).toBe('99.9');
    expect(formatAmount(result.ask.price)).toBe('100.1');
    expect(result.bid.size).toBe(amt('1'));
    expect(result.ask.size).toBe(amt('1'));
  });

  it('applies positive inventory skew by lowering both sides', () => {
    const result = quoteExternalMm(baseQuote({ inventorySkewBps: 10 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // half 10 + skew 10 → bid 100 - 0.10 - 0.10; ask 100 + 0.10 - 0.10
    expect(formatAmount(result.bid.price)).toBe('99.8');
    expect(formatAmount(result.ask.price)).toBe('100');
  });

  it('refuses internal house venue (external-only seal)', () => {
    const result = quoteExternalMm(baseQuote({ venueId: 'house', kind: 'internal' as VenueKind }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('internal_venue');
    expect(result.detail).toMatch(/D26-P0-01/);
  });

  it('refuseInternalMm always blocks with honest reason', () => {
    const r = refuseInternalMm();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('internal_venue');
  });

  it('refuses missing mid rather than inventing', () => {
    const result = quoteExternalMm(baseQuote({ mid: null }));
    expect(result).toMatchObject({ ok: false, reason: 'missing_mid' });
  });

  it('refuses missing book rather than inventing depth', () => {
    const result = quoteExternalMm(baseQuote({ book: null }));
    expect(result).toMatchObject({ ok: false, reason: 'missing_book' });
  });

  it('refuses insufficient book depth', () => {
    const result = quoteExternalMm(baseQuote({ book: { bidSize: amt('0.5'), askSize: amt('1') }, quoteSize: amt('1') }));
    expect(result).toMatchObject({ ok: false, reason: 'insufficient_book' });
  });

  it('unscored latency → zero_weight', () => {
    const result = quoteExternalMm(baseQuote({ costTerms: completeTerms({ latencyGrade: ungraded() }) }));
    expect(result).toMatchObject({ ok: false, reason: 'zero_weight' });
  });

  it('missing fee → incomplete_cost', () => {
    const result = quoteExternalMm(baseQuote({ costTerms: completeTerms({ feeBps: null }) }));
    expect(result).toMatchObject({ ok: false, reason: 'incomplete_cost' });
  });

  it('kill_switch blocks quoting on volatility breach', () => {
    const result = quoteExternalMm(
      baseQuote({
        kill: clearKill({ volatility: { realizedVolBps: 900, maxVolBps: 100 } }),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('kill_switch');
    expect(result.killReasons).toContain('volatility_breach');
  });

  it('kill_switch blocks quoting on inventory breach', () => {
    const result = quoteExternalMm(
      baseQuote({
        kill: clearKill({
          inventory: { position: amt('-50'), minPosition: amt('-10'), maxPosition: amt('10') },
        }),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('kill_switch');
    expect(result.killReasons).toContain('inventory_breach');
  });
});

describe('planExternalMmHedge — cross-venue', () => {
  it('plans sell hedge for long excess on a distinct external venue', () => {
    const result = planExternalMmHedge({
      symbol: 'BTC/USDT',
      quoteVenueId: 'binance',
      inventory: { position: amt('15'), minPosition: amt('-10'), maxPosition: amt('10') },
      hedge: {
        venueId: 'bybit',
        kind: 'external-cex',
        mid: amt('100'),
        costTerms: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
        availableSize: amt('10'),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.side).toBe('sell');
    expect(result.amount).toBe(amt('5'));
    expect(result.hedgeVenueId).toBe('bybit');
    expect(formatAmount(result.allIn)).toBe('100');
  });

  it('plans buy hedge for short excess', () => {
    const result = planExternalMmHedge({
      symbol: 'BTC/USDT',
      quoteVenueId: 'binance',
      inventory: { position: amt('-15'), minPosition: amt('-10'), maxPosition: amt('10') },
      hedge: {
        venueId: 'bybit',
        kind: 'external-cex',
        mid: amt('100'),
        costTerms: completeTerms({ feeBps: 10, expectedImpactBps: 0, transferCostBps: 0 }),
        availableSize: amt('10'),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.side).toBe('buy');
    expect(result.amount).toBe(amt('5'));
    expect(formatAmount(result.allIn)).toBe('100.1');
  });

  it('refuses internal hedge venue', () => {
    const result = planExternalMmHedge({
      symbol: 'BTC/USDT',
      quoteVenueId: 'binance',
      inventory: { position: amt('15'), minPosition: amt('-10'), maxPosition: amt('10') },
      hedge: {
        venueId: 'house',
        kind: 'internal',
        mid: amt('100'),
        costTerms: completeTerms(),
        availableSize: amt('10'),
      },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
  });

  it('refuses same_venue hedge', () => {
    const result = planExternalMmHedge({
      symbol: 'BTC/USDT',
      quoteVenueId: 'binance',
      inventory: { position: amt('15'), minPosition: amt('-10'), maxPosition: amt('10') },
      hedge: {
        venueId: 'binance',
        kind: 'external-cex',
        mid: amt('100'),
        costTerms: completeTerms(),
        availableSize: amt('10'),
      },
    });
    expect(result).toMatchObject({ ok: false, reason: 'same_venue' });
  });

  it('hedge_not_required inside bands', () => {
    const result = planExternalMmHedge({
      symbol: 'BTC/USDT',
      quoteVenueId: 'binance',
      inventory: { position: amt('0'), minPosition: amt('-10'), maxPosition: amt('10') },
      hedge: {
        venueId: 'bybit',
        kind: 'external-cex',
        mid: amt('100'),
        costTerms: completeTerms(),
        availableSize: amt('10'),
      },
    });
    expect(result).toMatchObject({ ok: false, reason: 'hedge_not_required' });
  });

  it('refuses missing hedge mid', () => {
    const result = planExternalMmHedge({
      symbol: 'BTC/USDT',
      quoteVenueId: 'binance',
      inventory: { position: amt('15'), minPosition: amt('-10'), maxPosition: amt('10') },
      hedge: {
        venueId: 'bybit',
        kind: 'external-cex',
        mid: null,
        costTerms: completeTerms(),
        availableSize: amt('10'),
      },
    });
    expect(result).toMatchObject({ ok: false, reason: 'missing_mid' });
  });

  it('refuses insufficient hedge depth', () => {
    const result = planExternalMmHedge({
      symbol: 'BTC/USDT',
      quoteVenueId: 'binance',
      inventory: { position: amt('15'), minPosition: amt('-10'), maxPosition: amt('10') },
      hedge: {
        venueId: 'bybit',
        kind: 'external-cex',
        mid: amt('100'),
        costTerms: completeTerms(),
        availableSize: amt('1'),
      },
    });
    expect(result).toMatchObject({ ok: false, reason: 'insufficient_hedge_size' });
  });
});
