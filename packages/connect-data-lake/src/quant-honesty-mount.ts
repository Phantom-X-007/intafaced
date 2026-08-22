/**
 * quant.backtest mount honesty — composite gate entry (D31).
 *
 * Surfaces call one gate before rendering quant/copy/backtest UI. Refuses when
 * any ADR D-S-18 rule fails — never partial render with invented framing.
 */

import {
  describeQuantHonestyPolicy,
  gateBacktestRender,
  gateLiveVsBacktestCompare,
  gateReturnsLeaderboard,
  type BacktestRenderGate,
  type BacktestRenderInput,
  type LiveVsBacktestCompareInput,
  type ReturnsLeaderboardInput,
} from './quant-honesty-policy.js';

export type QuantSurfaceRenderInput = {
  readonly backtest: BacktestRenderInput;
  readonly leaderboard: ReturnsLeaderboardInput;
  readonly compare: LiveVsBacktestCompareInput;
};

/** Single mount entry — all three gates must pass before render. */
export function gateQuantSurfaceRender(input: QuantSurfaceRenderInput): BacktestRenderGate {
  const backtest = gateBacktestRender(input.backtest);
  if (!backtest.ok) return backtest;
  const leaderboard = gateReturnsLeaderboard(input.leaderboard);
  if (!leaderboard.ok) return leaderboard;
  return gateLiveVsBacktestCompare(input.compare);
}

export function describeQuantHonestyMount() {
  return {
    ...describeQuantHonestyPolicy(),
    compositeGateWired: true as const,
    inventsFraming: false as const,
  };
}
