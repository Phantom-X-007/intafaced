/**
 * D26-P1-X2 public door — capture hole → SOR weight 0 through the package
 * surface (`@intafaced/venue-adapter` index), not deep fabric imports alone.
 *
 * Promise: a capture `hole` cannot win a route even when its quote is cheaper.
 * Break: importing only internals while the public export omits capture-routing,
 * or treating a hole as an empty book that still routes.
 *
 * Leverage: existing `planRoute` + `scoreSorCost` + `routingWeightFromCapture`
 * (Phase A — wire honesty, no CCXT / invented mids).
 */
import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import type { VenueLatencyGrade } from '@intafaced/venue-contracts';
import {
  planRoute,
  routingWeightFromCapture,
  scoreSorCost,
  type CaptureRoutingRecord,
  type LiquiditySource,
  type QuoteRequest,
  type SorCostTerms,
  type VenueHealth,
} from '../index.js';

function graded(venueId = 'v'): VenueLatencyGrade {
  return {
    venueId,
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
    latencyGrade: graded(typeof over.capture?.venueId === 'string' ? over.capture.venueId : 'v'),
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
      throw new Error('capture-routing public doors do not submit');
    },
  };
}

describe('D26-P1-X2 public door — package export + planRoute', () => {
  it('exports routingWeightFromCapture on the package index', () => {
    const hole: CaptureRoutingRecord = {
      kind: 'hole',
      venueId: 'ghost',
      symbol: 'BTC/USDT',
      reason: 'not_connected',
    };
    expect(routingWeightFromCapture(hole)).toBe(0);
    expect(routingWeightFromCapture({ kind: 'book', venueId: 'ghost', symbol: 'BTC/USDT' })).toBe(1);
  });

  it('package-surface scoreSorCost refuses capture holes with zero_weight mapping', () => {
    const scored = scoreSorCost(
      completeTerms({
        capture: {
          kind: 'hole',
          venueId: 'ghost',
          symbol: 'BTC/USDT',
          reason: 'not_connected',
          detail: 'absent in capture — public door',
        },
      }),
    );
    expect(scored.ok).toBe(false);
    if (!scored.ok) {
      expect(scored.routingWeight).toBe(0);
      expect(scored.reason).toBe('capture_hole');
    }
  });

  it('planRoute through package index never fills a capture-hole venue', async () => {
    const now = new Date();
    const plan = await planRoute(
      { symbol: 'BTC/USDT', side: 'buy', amount: amt('0.25') },
      [venue('hole-cheap', '28000'), venue('book-dear', '31000')],
      {
        now,
        costTermsByVenue: {
          'hole-cheap': completeTerms({
            capture: {
              kind: 'hole',
              venueId: 'hole-cheap',
              symbol: 'BTC/USDT',
              reason: 'not_connected',
              detail: 'public-door: absence ≠ quiet market',
            },
          }),
          'book-dear': completeTerms({
            capture: { kind: 'book', venueId: 'book-dear', symbol: 'BTC/USDT' },
          }),
        },
      },
    );

    expect(plan.legs.map((l) => l.venueId)).toEqual(['book-dear']);
    expect(plan.rejected.find((r) => r.venueId === 'hole-cheap')?.reason).toBe('zero_weight');
    expect(plan.routedAmount).toBe(amt('0.25'));
  });
});
