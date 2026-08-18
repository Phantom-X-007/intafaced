import { describe, expect, it } from 'vitest';
import {
  ALLOWED_STRATEGY_COMPARISON_ORDERS,
  assessBacktestSurface,
  assessStrategyComparisonOrder,
  buildPerformanceContextLabels,
  type BacktestSurfaceCandidate,
} from './quant-honesty.js';

function honestCandidate(overrides: Partial<BacktestSurfaceCandidate> = {}): BacktestSurfaceCandidate {
  return {
    runId: 'run-2026-08-12-001',
    strategyId: 'strategy-mean-reversion-v4',
    strategyVariantCount: 37,
    outOfSampleVerdict: {
      status: 'passed',
      evaluatedFrom: '2026-04-01T00:00:00.000Z',
      evaluatedTo: '2026-06-30T23:59:59.999Z',
      sampleCount: 2_184,
    },
    costModel: {
      fees: {
        kind: 'venue-schedule',
        source: 'connect:venue-a:fee-schedule:v7',
      },
      slippage: {
        kind: 'order-book-replay',
        source: 'connect:data-lake:venue-a:depth:v3',
      },
      latency: {
        kind: 'measured-distribution',
        source: 'connect:venue-a:round-trip:2026-q2',
      },
    },
    ...overrides,
  };
}

describe('assessBacktestSurface — D26-P1-X6', () => {
  it('refuses a result without an out-of-sample verdict', () => {
    const result = assessBacktestSurface(honestCandidate({ outOfSampleVerdict: null }));

    expect(result).toEqual({
      ok: false,
      refusal: {
        code: 'missing_out_of_sample_verdict',
        detail: 'out-of-sample verdict is mandatory; the result must not render',
      },
    });
  });

  it.each([
    ['fees', 'missing_fee_model'],
    ['slippage', 'missing_slippage_model'],
    ['latency', 'missing_latency_model'],
  ] as const)('refuses when the %s model is absent', (component, expectedCode) => {
    const candidate = honestCandidate();
    const result = assessBacktestSurface({
      ...candidate,
      costModel: { ...candidate.costModel, [component]: null },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe(expectedCode);
  });

  it('refuses blank cost-model provenance rather than treating a named model as proof', () => {
    const candidate = honestCandidate();
    const result = assessBacktestSurface({
      ...candidate,
      costModel: {
        ...candidate.costModel,
        fees: { kind: 'venue-schedule', source: '   ' },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe('invalid_fee_model');
  });

  it.each([undefined, 0, -1, 2.5])('refuses invalid strategy variant count %s', (strategyVariantCount) => {
    const result = assessBacktestSurface(honestCandidate({ strategyVariantCount }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe('invalid_strategy_count');
  });

  it('refuses an incomplete out-of-sample verdict', () => {
    const result = assessBacktestSurface(
      honestCandidate({
        outOfSampleVerdict: {
          status: 'passed',
          evaluatedFrom: '2026-06-30T00:00:00.000Z',
          evaluatedTo: '2026-04-01T00:00:00.000Z',
          sampleCount: 0,
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe('invalid_out_of_sample_verdict');
  });

  it('builds a renderable surface with mandatory verdict, costs, and strategy count', () => {
    const result = assessBacktestSurface(honestCandidate());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.surface.claimLabel).toBe('Historical simulation — not a forecast');
    expect(result.surface.outOfSample.label).toBe('Out-of-sample: passed');
    expect(result.surface.strategyCount).toEqual({
      value: 37,
      label: '37 strategies tested',
    });
    expect(result.surface.costs.map((cost) => cost.component)).toEqual(['fees', 'slippage', 'latency']);
    expect(result.surface.costs.every((cost) => cost.modelled && cost.source.length > 0)).toBe(true);
  });
});

describe('strategy comparison ordering — no curve-fit leaderboard', () => {
  it('never exposes historical return as an allowed ordering', () => {
    expect(ALLOWED_STRATEGY_COMPARISON_ORDERS).toEqual(['strategy_name', 'created_at']);
    expect(ALLOWED_STRATEGY_COMPARISON_ORDERS).not.toContain('historical_return');
  });

  it('refuses historical-return ranking at runtime', () => {
    expect(assessStrategyComparisonOrder('historical_return')).toEqual({
      ok: false,
      refusal: {
        code: 'returns_ranked_leaderboard_forbidden',
        detail: 'historical return cannot order a strategy comparison',
      },
    });
  });

  it('allows stable non-performance ordering', () => {
    expect(assessStrategyComparisonOrder('strategy_name')).toEqual({
      ok: true,
      order: 'strategy_name',
    });
  });
});

describe('live and backtest context labels', () => {
  it('labels live and simulated performance at equal visual weight', () => {
    expect(buildPerformanceContextLabels()).toEqual({
      live: { text: 'Live performance', visualWeight: 'primary' },
      backtest: { text: 'Historical simulation', visualWeight: 'primary' },
    });
  });
});
