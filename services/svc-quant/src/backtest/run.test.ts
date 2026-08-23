import { describe, expect, it } from 'vitest';
import {
  QUANT_BACKTEST_FILLS_MISSING,
  QUANT_BACKTEST_LAKE_MISSING,
  QUANT_BACKTEST_SURFACE_REFUSED,
  QUANT_BACKTEST_WALK_FORWARD_REQUIRED,
} from '../errors.js';
import type { BacktestLake, LakeFill } from './lake.js';
import { runBacktest } from './run.js';

const walkForward = {
  inSampleFrom: '2026-01-01T00:00:00.000Z',
  inSampleTo: '2026-04-01T00:00:00.000Z',
  outOfSampleFrom: '2026-04-01T00:00:00.000Z',
  outOfSampleTo: '2026-07-01T00:00:00.000Z',
};

const costModel = {
  fees: { kind: 'venue-schedule' as const, source: 'connect:venue-a:fee-schedule:v7' },
  slippage: { kind: 'order-book-replay' as const, source: 'connect:data-lake:venue-a:depth:v3' },
  latency: { kind: 'measured-distribution' as const, source: 'connect:venue-a:round-trip:2026-q2' },
};

const fills: LakeFill[] = [
  { ts: '2026-02-01T00:00:00.000Z', symbol: 'BTC-USD', qty: '0.01', price: '50000' },
  { ts: '2026-05-01T00:00:00.000Z', symbol: 'BTC-USD', qty: '0.02', price: '51000' },
];

function lakeWith(rows: readonly LakeFill[] | null, wired = true): BacktestLake {
  return { wired, fills: () => rows };
}

describe('backtest.run — event-level, walk-forward, lake fills', () => {
  it('refuses missing walk-forward by name', () => {
    expect(() =>
      runBacktest(
        { strategyId: 'alpha', symbol: 'BTC-USD', outOfSampleStatus: 'passed', costModel, strategyVariantCount: 1 },
        lakeWith(fills),
      ),
    ).toThrow(QUANT_BACKTEST_WALK_FORWARD_REQUIRED);
  });

  it('refuses missing lake by name and does not invent candles', () => {
    expect(() =>
      runBacktest(
        { strategyId: 'alpha', symbol: 'BTC-USD', walkForward, outOfSampleStatus: 'passed', costModel, strategyVariantCount: 1 },
        lakeWith(null, false),
      ),
    ).toThrow(QUANT_BACKTEST_LAKE_MISSING);
    expect(() =>
      runBacktest(
        { strategyId: 'alpha', symbol: 'BTC-USD', walkForward, outOfSampleStatus: 'passed', costModel, strategyVariantCount: 1 },
        lakeWith(null, true),
      ),
    ).toThrow(QUANT_BACKTEST_LAKE_MISSING);
  });

  it('refuses missing fills by name and does not invent candles', () => {
    expect(() =>
      runBacktest(
        { strategyId: 'alpha', symbol: 'BTC-USD', walkForward, outOfSampleStatus: 'passed', costModel, strategyVariantCount: 1 },
        lakeWith([]),
      ),
    ).toThrow(QUANT_BACKTEST_FILLS_MISSING);
  });

  it('does not weaken OOS / cost-model refusals from assessBacktestSurface', () => {
    expect(() =>
      runBacktest({ strategyId: 'alpha', symbol: 'BTC-USD', walkForward, costModel, strategyVariantCount: 1 }, lakeWith(fills)),
    ).toThrow(/missing_out_of_sample_verdict/);
    expect(() =>
      runBacktest(
        { strategyId: 'alpha', symbol: 'BTC-USD', walkForward, outOfSampleStatus: 'passed', strategyVariantCount: 1 },
        lakeWith(fills),
      ),
    ).toThrow(/missing_fee_model/);
    try {
      runBacktest({ strategyId: 'alpha', symbol: 'BTC-USD', walkForward, costModel, strategyVariantCount: 1 }, lakeWith(fills));
    } catch (err) {
      expect((err as Error).message).toContain(QUANT_BACKTEST_SURFACE_REFUSED);
    }
  });

  it('metrics come from lake fills as decimal strings — no invented return', () => {
    const ran = runBacktest(
      { strategyId: 'alpha', symbol: 'BTC-USD', walkForward, outOfSampleStatus: 'passed', costModel, strategyVariantCount: 1 },
      lakeWith(fills),
    );
    expect(ran.ok).toBe(true);
    expect(ran.inSample.fillCount).toBe(1);
    expect(ran.inSample.notional).toBe('500');
    expect(typeof ran.inSample.notional).toBe('string');
    expect(ran.outOfSample.fillCount).toBe(1);
    expect(ran.outOfSample.notional).toBe('1020');
    expect('pnl' in ran).toBe(false);
    expect('return' in ran).toBe(false);
    expect(ran.claimLabel).toBe('Historical simulation — not a forecast');
  });
});
