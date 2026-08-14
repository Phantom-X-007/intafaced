/**
 * trade.futures — capability note for bots (GET /api/v1/capabilities).
 *
 * A listed perp is not orderable and does not run funding/liq ticks by default.
 * Realised-profit pot is unnamed by default (N1). D3 ladder numbers stay unset.
 * This does not start jobs, enable orders, name a pot, or invent rates.
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
};

export function presentFuturesJobsCapabilityNote(input: {
  readonly jobsEnabled?: boolean;
  readonly orderableEnabled?: boolean;
  readonly profitSourceConfigured?: boolean;
}): FuturesJobsCapabilityNote {
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
  };
}
