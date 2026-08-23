import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import type { RestLatencyGrade } from '@intafaced/venue-contracts';
import { scoreSorCost, type SorCostTerms } from './cost-model.js';
import { planRoute } from './router.js';
import type { LiquiditySource, QuoteRequest, VenueHealth } from './source.js';

/**
 * execution.sor pin: missing fee / impact / transfer / graded latency refuse
 * with weight 0. Letter grades never become bps. The 5 bps internal
 * preference is not raised. Phase A: existing scoreSorCost + planRoute.
 */

function graded(letter: 'A' | 'B' | 'C' | 'D' | 'F' = 'A'): RestLatencyGrade {
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

function ungraded(): RestLatencyGrade {
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
    feeBps: 10,
    expectedImpactBps: 5,
    transferCostBps: 2,
    latencyGrade: graded(),
    ...over,
  };
}

function venue(o: { id: string; kind: LiquiditySource['kind']; price: string; amount: string; feeBps: number }): LiquiditySource {
  const now = Date.now();
  const health: VenueHealth = { healthy: true, latencyMs: 10, lastUpdate: new Date(now) };
  return {
    id: o.id,
    kind: o.kind,
    capabilities: ['quote', 'orderbook', 'submit'],
    health: () => health,
    markets: async () => [],
    quote: async (req: QuoteRequest) => ({
      venueId: o.id,
      symbol: req.symbol,
      side: req.side,
      amount: amt(o.amount),
      price: amt(o.price),
      feeBps: o.feeBps,
      expiresAt: new Date(now + 30_000),
    }),
    orderBook: async () => ({
      symbol: 'BTC/USDT',
      bids: [[o.price, o.amount]],
      asks: [[o.price, o.amount]],
      timestamp: now,
      datetime: new Date(now).toISOString(),
      nonce: 1,
    }),
    submit: async () => ({
      venueId: o.id,
      venueOrderId: 'v-1',
      filledAmount: amt(o.amount),
      averagePrice: amt(o.price),
      feeAmount: amt('0'),
      feeAsset: 'USDT',
      status: 'filled' as const,
      executedAt: new Date(),
    }),
  };
}

const buy = (amount: string): QuoteRequest => ({ symbol: 'BTC/USDT', side: 'buy', amount: amt(amount) });

function expectRefused(scored: ReturnType<typeof scoreSorCost>, reason: string): void {
  expect(scored.ok).toBe(false);
  if (scored.ok) return;
  expect(scored.routingWeight).toBe(0);
  expect(scored.reason).toBe(reason);
}

describe('scoreSorCost — missing cost terms refuse at weight 0', () => {
  it.each([
    ['feeBps', { feeBps: null }, 'missing_fee'],
    ['expectedImpactBps', { expectedImpactBps: null }, 'missing_impact'],
    ['transferCostBps', { transferCostBps: null }, 'missing_transfer'],
    ['latencyGrade null', { latencyGrade: null }, 'unscored_latency'],
    ['latencyGrade ungraded', { latencyGrade: ungraded() }, 'unscored_latency'],
    ['NaN fee', { feeBps: Number.NaN }, 'missing_fee'],
    ['NaN impact', { expectedImpactBps: Number.NaN }, 'missing_impact'],
    ['NaN transfer', { transferCostBps: Number.NaN }, 'missing_transfer'],
  ] as const)('%s cannot score as a real venue', (_label, over, reason) => {
    expectRefused(scoreSorCost(completeTerms(over)), reason);
  });

  it('letter without p95 is not a live score — weight 0, not invented bps', () => {
    expectRefused(
      scoreSorCost(
        completeTerms({
          latencyGrade: { ...graded('F'), p50Ms: null, p95Ms: null },
        }),
      ),
      'unscored_latency',
    );
  });
});

describe('scoreSorCost — letter grades never become bps', () => {
  it('A/B/C/D/F with the same fee+impact+transfer share one totalCostBps', () => {
    const totals = (['A', 'B', 'C', 'D', 'F'] as const).map((letter) => {
      const scored = scoreSorCost(completeTerms({ latencyGrade: graded(letter) }));
      expect(scored.ok).toBe(true);
      if (!scored.ok) return Number.NaN;
      expect(scored.routingWeight).toBe(1);
      expect(scored.totalCostBps).toBe(17);
      return scored.totalCostBps;
    });
    expect(new Set(totals)).toEqual(new Set([17]));
  });
});

describe('planRoute — a missing cost term cannot become a routed venue', () => {
  it('cheapest quote with a missing term is rejected, not filled as zeros', async () => {
    const plan = await planRoute(
      buy('1'),
      [
        venue({ id: 'cheap-incomplete', kind: 'external-cex', price: '1', amount: '10', feeBps: 0 }),
        venue({ id: 'ok', kind: 'external-cex', price: '100', amount: '10', feeBps: 0 }),
      ],
      {
        costTermsByVenue: {
          'cheap-incomplete': completeTerms({ expectedImpactBps: null }),
          ok: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
        },
      },
    );

    expect(plan.legs.map((l) => l.venueId)).toEqual(['ok']);
    expect(plan.rejected.find((r) => r.venueId === 'cheap-incomplete')?.reason).toBe('incomplete_cost');
    expect(formatAmount(plan.routedAmount)).toBe('1');
  });

  it('F-graded cheaper venue still wins — letter is not invented into all-in bps', async () => {
    const plan = await planRoute(
      buy('1'),
      [
        venue({ id: 'dear-A', kind: 'external-cex', price: '100', amount: '10', feeBps: 0 }),
        venue({ id: 'cheap-F', kind: 'external-cex', price: '99.9', amount: '10', feeBps: 0 }),
      ],
      {
        costTermsByVenue: {
          'dear-A': completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0, latencyGrade: graded('A') }),
          'cheap-F': completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0, latencyGrade: graded('F') }),
        },
      },
    );

    expect(plan.legs[0]?.venueId).toBe('cheap-F');
  });

  it('internal 6 bps dearer still loses — preference stays 5, not raised', async () => {
    const plan = await planRoute(
      buy('1'),
      [
        venue({ id: 'external', kind: 'external-cex', price: '100', amount: '10', feeBps: 0 }),
        venue({ id: 'internal', kind: 'internal', price: '100.06', amount: '10', feeBps: 0 }),
      ],
      {
        costTermsByVenue: {
          external: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
          internal: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
        },
      },
    );

    expect(plan.legs[0]?.venueId).toBe('external');
  });
});
