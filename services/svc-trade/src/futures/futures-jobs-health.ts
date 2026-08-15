/**
 * trade.futures — shipped occupancy of residual jobs on `/health`.
 *
 * Reports whether liquidation / funding ticks are armed. Does not start jobs,
 * does not echo market UUIDs, does not echo a |rate| ceiling, does not 503
 * `/health` when off. `ok: true` on the probe is not "funding is live".
 */
export type FuturesJobsHealthReason = 'jobs_off' | 'liq_only' | 'funding_scheduled';

export type FuturesJobsHealth = {
  readonly enabled: boolean;
  readonly jobsDefault: false;
  readonly liquidationArmed: boolean;
  readonly fundingMarketCount: number;
  readonly fundingScheduled: boolean;
  readonly fundingMaxAbsRateConfigured: boolean;
  readonly fundingMaxAbsRateDefault: false;
  /** True only when a known venue adapter + non-empty symbol map is wired. Never echoes venue id or symbols. */
  readonly venueMarkConfigured: boolean;
  readonly venueMarkDefault: false;
  readonly reason: FuturesJobsHealthReason;
};

export function presentFuturesJobsHealth(input: {
  readonly enabled: boolean;
  readonly fundingMarketCount: number;
  readonly fundingMaxAbsRateConfigured: boolean;
  readonly venueMarkConfigured?: boolean;
}): FuturesJobsHealth {
  const enabled = input.enabled === true;
  const fundingMarketCount =
    Number.isFinite(input.fundingMarketCount) && input.fundingMarketCount > 0 ? Math.floor(input.fundingMarketCount) : 0;
  const fundingScheduled = enabled && fundingMarketCount > 0;
  const fundingMaxAbsRateConfigured = input.fundingMaxAbsRateConfigured === true;
  let reason: FuturesJobsHealthReason = 'jobs_off';
  if (enabled) reason = fundingScheduled ? 'funding_scheduled' : 'liq_only';
  return {
    enabled,
    jobsDefault: false,
    liquidationArmed: enabled,
    fundingMarketCount,
    fundingScheduled,
    fundingMaxAbsRateConfigured,
    fundingMaxAbsRateDefault: false,
    venueMarkConfigured: input.venueMarkConfigured === true,
    venueMarkDefault: false,
    reason,
  };
}
