import { describe, expect, it } from 'vitest';
import { describeQuantSurfaceRefuse, refuseQuantSurfaceRender } from './quant-surface-refuse.js';

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

describe('quant surface refuse (D32)', () => {
  it('describeQuantSurfaceRefuse locks consumer honesty', () => {
    expect(describeQuantSurfaceRefuse()).toMatchObject({
      compositeGateWired: true,
      inventsFraming: false,
      refuseMessagesLocked: true,
      edgeSurfaceRenderDoor: '/quant/honesty/assess-surface-render',
      edgeCompositeHonestyDoor: '/quant/honesty/assess-composite',
      edgeDoorNotProxiedToSvcQuant: true,
    });
  });

  it('refuseQuantSurfaceRender allows honest framing', () => {
    expect(refuseQuantSurfaceRender(honestInput)).toEqual({ ok: true });
  });

  it('refuseQuantSurfaceRender returns stable message for returns leaderboard', () => {
    expect(
      refuseQuantSurfaceRender({
        ...honestInput,
        leaderboard: { rankedByHistoricalReturn: true, surface: 'marketplace' },
      }),
    ).toEqual({
      ok: false,
      reason: 'returns_leaderboard',
      message: 'Returns-ranked leaderboard is banned on every surface',
    });
  });

  it('refuseQuantSurfaceRender returns stable message for missing OOS verdict', () => {
    expect(
      refuseQuantSurfaceRender({
        ...honestInput,
        backtest: { ...honestInput.backtest, outOfSampleVerdict: null },
      }),
    ).toMatchObject({
      ok: false,
      reason: 'no_out_of_sample_verdict',
    });
  });
});
