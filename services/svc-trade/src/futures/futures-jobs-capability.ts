/**
 * trade.futures — capability note for bots (GET /api/v1/capabilities).
 *
 * A listed perp is not orderable and does not run funding/liq ticks by default.
 * Realised-profit pot is unnamed by default (N1). D3 ladder numbers stay unset.
 * This does not start jobs, enable orders, name a pot, or invent rates / D2 ceilings.
 */
export type FuturesJobsCapabilityNote = {
  readonly orderableEnabled: boolean;
  readonly orderableDefault: false;
  readonly jobsEnabled: boolean;
  readonly jobsDefault: false;
  readonly profitSourceConfigured: boolean;
  readonly profitSourceDefault: false;
  readonly nextFundingTimestamp: 'unpublished';
  readonly indexPrice: 'unpublished';
  readonly ladderNumbers: 'd3_unset';
  /** DIRECTION:33 — empty insurance pot blocks live list. Size stays owner law. */
  readonly insuranceEmptyBlocksLiveList: true;
  readonly insuranceTargetSize: 'owner_unset';
  /** BUILD-STOP D2 — no invented |rate| ceiling. True only when env is a non-empty string. */
  readonly fundingMaxAbsRateConfigured: boolean;
  readonly fundingMaxAbsRateDefault: false;
  /** Count only — never the UUID list. Omitted / non-positive → 0. */
  readonly fundingMarketCount: number;
  /** True only when a known venue adapter + non-empty symbol map is wired. Never echoes venue id or symbols. */
  readonly venueMarkConfigured: boolean;
  readonly venueMarkDefault: false;
  /** True only when TRADE_FUTURES_FUNDING_INTERVAL_MS is a named integer. Never echoes the ms. */
  readonly fundingIntervalConfigured: boolean;
  readonly fundingIntervalDefault: false;
};

export function presentFuturesJobsCapabilityNote(input: {
  readonly jobsEnabled?: boolean;
  readonly orderableEnabled?: boolean;
  readonly profitSourceConfigured?: boolean;
  readonly fundingMaxAbsRateConfigured?: boolean;
  readonly fundingMarketCount?: number;
  readonly venueMarkConfigured?: boolean;
  readonly fundingIntervalConfigured?: boolean;
}): FuturesJobsCapabilityNote {
  const raw = input.fundingMarketCount;
  const fundingMarketCount = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  return {
    orderableEnabled: input.orderableEnabled === true,
    orderableDefault: false,
    jobsEnabled: input.jobsEnabled === true,
    jobsDefault: false,
    profitSourceConfigured: input.profitSourceConfigured === true,
    profitSourceDefault: false,
    nextFundingTimestamp: 'unpublished',
    indexPrice: 'unpublished',
    ladderNumbers: 'd3_unset',
    insuranceEmptyBlocksLiveList: true,
    insuranceTargetSize: 'owner_unset',
    fundingMaxAbsRateConfigured: input.fundingMaxAbsRateConfigured === true,
    fundingMaxAbsRateDefault: false,
    fundingMarketCount,
    venueMarkConfigured: input.venueMarkConfigured === true,
    venueMarkDefault: false,
    fundingIntervalConfigured: input.fundingIntervalConfigured === true,
    fundingIntervalDefault: false,
  };
}
