import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { buildExecutionReport } from './execution-report.js';
import { planRoute } from './router.js';
import type { LiquiditySource } from './source.js';

function venue(o: {
  id: string;
  kind?: LiquiditySource['kind'];
  price: string;
  amount: string;
  feeBps?: number;
  healthy?: boolean;
}): LiquiditySource {
  return {
    id: o.id,
    kind: o.kind ?? 'external-cex',
    capabilities: ['quote'],
    health: () => ({
      healthy: o.healthy ?? true,
      latencyMs: 10,
      lastUpdate: new Date('2026-08-12T00:00:00.000Z'),
    }),
    markets: async () => [],
    quote: async (req) => ({
      venueId: o.id,
      symbol: req.symbol,
      side: req.side,
      amount: parseAmount(o.amount),
      price: parseAmount(o.price),
      feeBps: o.feeBps ?? 10,
      expiresAt: new Date('2026-08-12T01:00:00.000Z'),
    }),
    orderBook: async () => ({}) as never,
    submit: async () => ({}) as never,
  };
}

describe('buildExecutionReport — §28 shortfall + venue attribution', () => {
  it('attributes every routed venue and reports no shortfall when filled', async () => {
    const plan = await planRoute(
      { symbol: 'BTC/USDT', side: 'buy', amount: parseAmount('1') },
      [venue({ id: 'a', price: '30000', amount: '1' })],
      { now: new Date('2026-08-12T00:00:00.000Z') },
    );
    const report = buildExecutionReport(plan);
    expect(report.shortfall).toEqual({ kind: 'none', unfilled: '0' });
    expect(report.venues).toEqual([
      expect.objectContaining({
        venueId: 'a',
        amount: '1',
        price: '30000',
      }),
    ]);
    expect(report.rejected).toEqual([]);
  });

  it('reports unfilled shortfall honestly — never invents a fill', async () => {
    const plan = await planRoute(
      { symbol: 'BTC/USDT', side: 'buy', amount: parseAmount('10') },
      [venue({ id: 'thin', price: '30000', amount: '2' })],
      { now: new Date('2026-08-12T00:00:00.000Z') },
    );
    const report = buildExecutionReport(plan);
    expect(report.shortfall).toEqual({
      kind: 'unfilled',
      unfilled: '8',
      requested: '10',
      routed: '2',
    });
    expect(report.venues.map((v) => v.venueId)).toEqual(['thin']);
    expect(report.routedAmount).toBe('2');
  });

  it('keeps rejected venue attribution separate from filled legs', async () => {
    const plan = await planRoute(
      { symbol: 'BTC/USDT', side: 'buy', amount: parseAmount('1') },
      [
        venue({ id: 'dead', price: '29000', amount: '1', healthy: false }),
        venue({ id: 'live', price: '30000', amount: '1' }),
      ],
      { now: new Date('2026-08-12T00:00:00.000Z') },
    );
    const report = buildExecutionReport(plan);
    expect(report.venues.map((v) => v.venueId)).toEqual(['live']);
    expect(report.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ venueId: 'dead', reason: 'unhealthy' })]));
  });
});
