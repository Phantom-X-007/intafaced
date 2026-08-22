import { describe, expect, it } from 'vitest';
import { describeQuantSurfaceRenderConsumer, evaluateQuantSurfaceRender } from './quant-surface-render-consumer.js';

const honestInput = {
  backtest: {
    outOfSampleVerdict: 'pass' as const,
    costs: { feesModelled: true, slippageModelled: true, latencyModelled: true },
    variantCount: 1,
  },
  leaderboard: { rankedByHistoricalReturn: false, surface: 'backtest' as const },
  compare: {
    showsLivePnl: false,
    showsBacktestPnl: false,
    liveLabelWeight: null,
    backtestLabelWeight: null,
  },
};

describe('quant surface render consumer (D33)', () => {
  it('describeQuantSurfaceRenderConsumer locks consumer wiring', () => {
    expect(describeQuantSurfaceRenderConsumer()).toMatchObject({
      consumerWired: true,
      inventsFraming: false,
      usesRefuseQuantSurfaceRender: true,
    });
  });

  it('evaluateQuantSurfaceRender allows honest framing', () => {
    expect(evaluateQuantSurfaceRender(honestInput)).toEqual({ ok: true });
  });

  it('evaluateQuantSurfaceRender refuses returns leaderboard', () => {
    expect(
      evaluateQuantSurfaceRender({
        ...honestInput,
        leaderboard: { rankedByHistoricalReturn: true, surface: 'copy' },
      }),
    ).toMatchObject({ ok: false, reason: 'returns_leaderboard' });
  });
});
