import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import type { VenueLatencyGrade } from '@intafaced/venue-contracts';
import { scoreSorCost, type SorCostTerms } from '../cost-model.js';
import { planRoute } from '../router.js';
import type { LiquiditySource, QuoteRequest, VenueHealth } from '../source.js';
import { isCaptureRoutingHole, routingWeightFromCapture, type CaptureRoutingRecord } from './capture-routing.js';

function graded(): VenueLatencyGrade {
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
    feeBps: 10,
    expectedImpactBps: 5,
    transferCostBps: 2,
    latencyGrade: graded(),
    ...over,
  };
}

function venue(id: string, price: string): LiquiditySource {
  const now = Date.now();
  const health: VenueHealth = { healthy: true, latencyMs: 10, lastUpdate: new Date(now) };
  return {
    id,
    kind: 'external-cex',
    capabilities: ['quote', 'orderbook', 'submit'],
    health: () => health,
    markets: async () => [],
    quote: async (req: QuoteRequest) => ({
      venueId: id,
      symbol: req.symbol,
      side: req.side,
      amount: req.amount,
      price: amt(price),
      feeBps: 10,
      expiresAt: new Date(now + 30_000),
    }),
    orderBook: async () => ({
      symbol: 'BTC/USDT',
      bids: [[price, '1']],
      asks: [[price, '1']],
      timestamp: now,
      datetime: new Date(now).toISOString(),
      nonce: 1,
    }),
    submit: async () => {
      throw new Error('capture-routing tests do not submit');
    },
  };
}

describe('routingWeightFromCapture — D26-P1-X2 deepen (coords #1739)', () => {
  it('a capture hole gets ZERO routing weight — not an empty book', () => {
    const hole: CaptureRoutingRecord = {
      kind: 'hole',
      venueId: 'binance-spot',
      symbol: 'BTC/USDT',
      reason: 'not_connected',
      detail: 'no MarketDataAdapter',
    };
    expect(isCaptureRoutingHole(hole)).toBe(true);
    expect(routingWeightFromCapture(hole)).toBe(0);
  });

  it('a connected book (including quiet empty) is eligible weight 1 — market fact, not absence', () => {
    const book: CaptureRoutingRecord = { kind: 'book', venueId: 'binance-spot', symbol: 'BTC/USDT' };
    expect(isCaptureRoutingHole(book)).toBe(false);
    expect(routingWeightFromCapture(book)).toBe(1);
  });

  it('accepts the #1739 CaptureRecord structural shape (hole + book)', () => {
    // Structural assignability: lake records plug in without a synthetic empty book.
    const lakeHole = {
      kind: 'hole' as const,
      venueId: 'bybit-spot',
      symbol: 'ETH/USDT',
      capturedAt: new Date('2026-08-12T00:00:00.000Z'),
      reason: 'capture_failed',
      detail: 'timeout',
    } satisfies CaptureRoutingRecord & { capturedAt: Date };
    const lakeBook = {
      kind: 'book' as const,
      venueId: 'bybit-spot',
      symbol: 'ETH/USDT',
      capturedAt: new Date('2026-08-12T00:00:00.000Z'),
      snapshot: {/* lake carries snapshot; routing only needs kind */},
    } satisfies CaptureRoutingRecord & { capturedAt: Date; snapshot: object };
    expect(routingWeightFromCapture(lakeHole)).toBe(0);
    expect(routingWeightFromCapture(lakeBook)).toBe(1);
  });
});

describe('scoreSorCost / planRoute — capture hole → zero_weight', () => {
  it('complete fees + graded latency still refuse when capture is a hole', () => {
    const scored = scoreSorCost(
      completeTerms({
        capture: {
          kind: 'hole',
          venueId: 'ghost',
          symbol: 'BTC/USDT',
          reason: 'not_connected',
          detail: 'absent in capture, not an empty book',
        },
      }),
    );
    expect(scored.ok).toBe(false);
    if (!scored.ok) {
      expect(scored.routingWeight).toBe(0);
      expect(scored.reason).toBe('capture_hole');
      expect(scored.detail).toMatch(/absent in capture/);
    }
  });

  it('omitted capture leaves the legacy complete-model path unchanged', () => {
    const scored = scoreSorCost(completeTerms());
    expect(scored.ok).toBe(true);
    if (scored.ok) expect(scored.routingWeight).toBe(1);
  });

  it('does not route to a cheaper venue whose capture is a hole', async () => {
    const now = new Date();
    const plan = await planRoute(
      { symbol: 'BTC/USDT', side: 'buy', amount: amt('0.1') },
      [venue('hole-cheap', '29000'), venue('book-dear', '30000')],
      {
        now,
        costTermsByVenue: {
          'hole-cheap': completeTerms({
            capture: { kind: 'hole', venueId: 'hole-cheap', symbol: 'BTC/USDT', reason: 'not_connected' },
          }),
          'book-dear': completeTerms({
            capture: { kind: 'book', venueId: 'book-dear', symbol: 'BTC/USDT' },
          }),
        },
      },
    );

    expect(plan.legs.map((l) => l.venueId)).toEqual(['book-dear']);
    expect(plan.rejected.find((r) => r.venueId === 'hole-cheap')?.reason).toBe('zero_weight');
    expect(plan.routedAmount).toBe(amt('0.1'));
  });

  it('all capture holes → zero routedAmount (never invent empty-book fills)', async () => {
    const now = new Date();
    const plan = await planRoute({ symbol: 'BTC/USDT', side: 'buy', amount: amt('1') }, [venue('a', '100'), venue('b', '100')], {
      now,
      costTermsByVenue: {
        a: completeTerms({ capture: { kind: 'hole', venueId: 'a', symbol: 'BTC/USDT', reason: 'capture_failed' } }),
        b: completeTerms({ capture: { kind: 'hole', venueId: 'b', symbol: 'BTC/USDT', reason: 'no_depth' } }),
      },
    });
    expect(plan.routedAmount).toBe(0n);
    expect(plan.legs).toEqual([]);
    expect(plan.rejected.every((r) => r.reason === 'zero_weight')).toBe(true);
  });
});
