import { describe, expect, it } from 'vitest';
import {
  describeQuantHonestyPolicy,
  gateBacktestRender,
  gateLiveVsBacktestCompare,
  gateReturnsLeaderboard,
} from './quant-honesty-policy.js';

describe('quant honesty policy (D-S-18)', () => {
  it('describeQuantHonestyPolicy locks ADR refuse cases', () => {
    expect(describeQuantHonestyPolicy()).toEqual({
      outOfSampleMandatory: true,
      costsMandatory: true,
      variantCountMandatory: true,
      returnsLeaderboardBanned: true,
    });
  });

  it('gateBacktestRender refuses without out-of-sample verdict', () => {
    expect(
      gateBacktestRender({
        outOfSampleVerdict: null,
        costs: { feesModelled: true, slippageModelled: true, latencyModelled: true },
        variantCount: 3,
      }),
    ).toEqual({ ok: false, reason: 'no_out_of_sample_verdict' });
  });

  it('gateBacktestRender refuses unmodelled costs — never run-and-caveat', () => {
    expect(
      gateBacktestRender({
        outOfSampleVerdict: 'pass',
        costs: { feesModelled: true, slippageModelled: false, latencyModelled: true },
        variantCount: 1,
      }),
    ).toEqual({ ok: false, reason: 'unmodelled_costs' });
  });

  it('gateBacktestRender refuses missing variant count', () => {
    expect(
      gateBacktestRender({
        outOfSampleVerdict: 'pass',
        costs: { feesModelled: true, slippageModelled: true, latencyModelled: true },
        variantCount: null,
      }),
    ).toEqual({ ok: false, reason: 'missing_variant_count' });
  });

  it('gateBacktestRender allows honest complete framing', () => {
    expect(
      gateBacktestRender({
        outOfSampleVerdict: 'inconclusive',
        costs: { feesModelled: true, slippageModelled: true, latencyModelled: true },
        variantCount: 12,
      }),
    ).toEqual({ ok: true });
  });

  it('gateReturnsLeaderboard bans historical-return ranking in every room', () => {
    expect(gateReturnsLeaderboard({ rankedByHistoricalReturn: true, surface: 'backtest' })).toEqual({
      ok: false,
      reason: 'returns_leaderboard',
    });
    expect(gateReturnsLeaderboard({ rankedByHistoricalReturn: true, surface: 'copy' })).toEqual({
      ok: false,
      reason: 'returns_leaderboard',
    });
  });

  it('gateLiveVsBacktestCompare requires equal label weight when both P&L shown', () => {
    expect(
      gateLiveVsBacktestCompare({
        showsLivePnl: true,
        showsBacktestPnl: true,
        liveLabelWeight: 'normal',
        backtestLabelWeight: 'muted',
      }),
    ).toEqual({ ok: false, reason: 'mismatched_pnl_label_weight' });
  });
});
