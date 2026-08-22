import { describe, expect, it } from 'vitest';
import { describeQuantHonestyMount, gateQuantSurfaceRender } from './quant-honesty-mount.js';
import { refuseQuantSurfaceRender } from './quant-surface-refuse.js';

const honestInput = {
  backtest: {
    outOfSampleVerdict: 'pass' as const,
    costs: { feesModelled: true, slippageModelled: true, latencyModelled: true },
    variantCount: 2,
  },
  leaderboard: { rankedByHistoricalReturn: false, surface: 'backtest' as const },
  compare: {
    showsLivePnl: true,
    showsBacktestPnl: true,
    liveLabelWeight: 'normal' as const,
    backtestLabelWeight: 'normal' as const,
  },
};

describe('quant honesty mount (D31)', () => {
  it('describeQuantHonestyMount exposes composite gate wiring', () => {
    expect(describeQuantHonestyMount()).toMatchObject({
      outOfSampleMandatory: true,
      compositeGateWired: true,
      inventsFraming: false,
    });
  });

  it('gateQuantSurfaceRender allows honest complete framing', () => {
    expect(gateQuantSurfaceRender(honestInput)).toEqual({ ok: true });
  });

  it('gateQuantSurfaceRender refuses on first failing gate — backtest before leaderboard', () => {
    expect(
      gateQuantSurfaceRender({
        ...honestInput,
        backtest: { ...honestInput.backtest, outOfSampleVerdict: null },
      }),
    ).toEqual({ ok: false, reason: 'no_out_of_sample_verdict' });
  });

  it('gateQuantSurfaceRender refuses returns leaderboard even when backtest passes', () => {
    expect(
      gateQuantSurfaceRender({
        ...honestInput,
        leaderboard: { rankedByHistoricalReturn: true, surface: 'copy' },
      }),
    ).toEqual({ ok: false, reason: 'returns_leaderboard' });
  });
});

describe('gate and refuse quant surface render alignment (D49)', () => {
  it('refuseQuantSurfaceRender ok mirrors gateQuantSurfaceRender for honest input', () => {
    expect(refuseQuantSurfaceRender(honestInput).ok).toBe(gateQuantSurfaceRender(honestInput).ok);
  });

  it('refuseQuantSurfaceRender reason mirrors gate when refused', () => {
    const refused = {
      ...honestInput,
      leaderboard: { rankedByHistoricalReturn: true, surface: 'copy' as const },
    };
    const gate = gateQuantSurfaceRender(refused);
    expect(refuseQuantSurfaceRender(refused)).toMatchObject({ ok: false, reason: gate.reason });
  });
});
