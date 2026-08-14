/**
 * trade.futures — capability note for bots (GET /api/v1/capabilities).
 *
 * Listing a perp does not mean liquidation/funding ticks are running.
 * Jobs stay default OFF (PKT-B6). This does not start jobs or invent rates.
 */
export type FuturesJobsCapabilityNote = {
  readonly jobsEnabled: boolean;
  readonly jobsDefault: false;
};

export function presentFuturesJobsCapabilityNote(input: { readonly jobsEnabled?: boolean }): FuturesJobsCapabilityNote {
  return {
    jobsEnabled: input.jobsEnabled === true,
    jobsDefault: false,
  };
}
