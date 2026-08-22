/**
 * quant.backtest honesty policy — D-S-18 / ADR 2026-08-04-predict-quant-connect-law.
 *
 * Contract + refusal only. A backtest is a claim about the past; surfaces must
 * refuse render when framing rules are not met — never invent costs or OOS.
 */

export type OutOfSampleVerdict = 'pass' | 'fail' | 'inconclusive';

export type BacktestCostModel = {
  readonly feesModelled: boolean;
  readonly slippageModelled: boolean;
  readonly latencyModelled: boolean;
};

export type BacktestRenderInput = {
  readonly outOfSampleVerdict: OutOfSampleVerdict | null;
  readonly costs: BacktestCostModel;
  /** How many parameter/strategy variants were tried — must be >= 1 when rendering. */
  readonly variantCount: number | null;
};

export type QuantHonestyRefuseReason =
  'no_out_of_sample_verdict' | 'unmodelled_costs' | 'missing_variant_count' | 'returns_leaderboard' | 'mismatched_pnl_label_weight';

export type BacktestRenderGate = { readonly ok: true } | { readonly ok: false; readonly reason: QuantHonestyRefuseReason };

export type ReturnsLeaderboardInput = {
  readonly rankedByHistoricalReturn: boolean;
  readonly surface: 'backtest' | 'copy' | 'marketplace';
};

/** Out-of-sample is mandatory — null verdict does not render. */
export function gateBacktestRender(input: BacktestRenderInput): BacktestRenderGate {
  if (input.outOfSampleVerdict === null) {
    return { ok: false, reason: 'no_out_of_sample_verdict' };
  }
  if (!input.costs.feesModelled || !input.costs.slippageModelled || !input.costs.latencyModelled) {
    return { ok: false, reason: 'unmodelled_costs' };
  }
  if (input.variantCount === null || !Number.isFinite(input.variantCount) || input.variantCount < 1) {
    return { ok: false, reason: 'missing_variant_count' };
  }
  return { ok: true };
}

/** §8 / §29 — no returns-ranked leaderboard in any room. */
export function gateReturnsLeaderboard(input: ReturnsLeaderboardInput): BacktestRenderGate {
  if (input.rankedByHistoricalReturn) {
    return { ok: false, reason: 'returns_leaderboard' };
  }
  return { ok: true };
}

export type LiveVsBacktestCompareInput = {
  readonly showsLivePnl: boolean;
  readonly showsBacktestPnl: boolean;
  readonly liveLabelWeight: 'normal' | 'muted' | null;
  readonly backtestLabelWeight: 'normal' | 'muted' | null;
};

/** Live P&L beside backtest requires equal visual weight on both labels. */
export function gateLiveVsBacktestCompare(input: LiveVsBacktestCompareInput): BacktestRenderGate {
  if (!input.showsLivePnl || !input.showsBacktestPnl) {
    return { ok: true };
  }
  if (input.liveLabelWeight !== 'normal' || input.backtestLabelWeight !== 'normal') {
    return { ok: false, reason: 'mismatched_pnl_label_weight' };
  }
  return { ok: true };
}

export function describeQuantHonestyPolicy(): {
  readonly outOfSampleMandatory: true;
  readonly costsMandatory: true;
  readonly variantCountMandatory: true;
  readonly returnsLeaderboardBanned: true;
} {
  return {
    outOfSampleMandatory: true,
    costsMandatory: true,
    variantCountMandatory: true,
    returnsLeaderboardBanned: true,
  };
}
