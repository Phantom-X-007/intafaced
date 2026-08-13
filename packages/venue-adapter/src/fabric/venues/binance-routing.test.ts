import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { LiquiditySource } from '../../source.js';
import { planRoute } from '../../router.js';
import { routingWeightFromGrade } from '../latency.js';
import type { HttpPort, HttpResponse } from '../transport.js';
import { sorCostTermsFromAdapter } from '../../cost-model.js';
import { BinanceSpotMarketData } from './binance-spot.js';

const T0 = new Date('2026-08-12T00:00:00.000Z').getTime();

describe('D26-P1-X1 — Binance measured connection feeds routing weight', () => {
  it('gives the configured venue zero weight before any request has been measured', () => {
    const adapter = new BinanceSpotMarketData();
    const terms = sorCostTermsFromAdapter(adapter, { feeBps: 10, expectedImpactBps: 0, transferCostBps: 0 }, new Date(T0));

    expect(terms.latencyGrade?.grade).toBeNull();
    expect(routingWeightFromGrade(terms.latencyGrade!)).toBe(0);
  });

  it('routes only after ten real adapter calls produce a non-provisional measured grade', async () => {
    let now = T0;
    const requests: string[] = [];
    const http: HttpPort = {
      async get(url: string): Promise<HttpResponse> {
        requests.push(url);
        now += 40;
        return {
          status: 200,
          body: { symbols: [] },
          header: () => null,
        };
      },
    };
    const adapter = new BinanceSpotMarketData({
      http,
      restBase: 'https://api.binance.test',
      clock: () => now,
    });

    for (let sample = 0; sample < 10; sample += 1) {
      await adapter.markets();
    }

    const measuredAt = new Date(now);
    const terms = sorCostTermsFromAdapter(adapter, { feeBps: 10, expectedImpactBps: 0, transferCostBps: 0 }, measuredAt);
    const grade = terms.latencyGrade!;

    expect(requests).toEqual(Array(10).fill('https://api.binance.test/api/v3/exchangeInfo'));
    expect(grade).toMatchObject({
      venueId: 'binance-spot',
      measurement: 'rest-round-trip',
      grade: 'A',
      samples: 10,
      p95Ms: 40,
      provisional: false,
    });
    expect(routingWeightFromGrade(grade)).toBe(1);

    const source: LiquiditySource = {
      id: adapter.venue.id,
      kind: 'external-cex',
      capabilities: ['quote'],
      health: () => ({ healthy: true, latencyMs: grade.p95Ms!, lastUpdate: measuredAt }),
      markets: async () => [],
      quote: async (request) => ({
        venueId: adapter.venue.id,
        symbol: request.symbol,
        side: request.side,
        amount: request.amount,
        price: parseAmount('60000'),
        feeBps: 10,
        expiresAt: new Date(now + 30_000),
      }),
      orderBook: async () => ({}) as never,
      submit: async () => {
        throw new Error('market-data connection does not claim a trading path');
      },
    };

    const plan = await planRoute({ symbol: 'BTC/USDT', side: 'buy', amount: parseAmount('0.1') }, [source], {
      now: measuredAt,
      costTermsByVenue: { 'binance-spot': terms },
    });

    expect(plan.legs.map((leg) => leg.venueId)).toEqual(['binance-spot']);
    expect(plan.routedAmount).toBe(parseAmount('0.1'));
    expect(plan.rejected).toEqual([]);
  });
});
