/**
 * trade.algo — capability note for bots (GET /api/v1/capabilities).
 *
 * Create may be on while the slice scheduler is still default OFF.
 * Icebergs stay out. This does not start jobs.
 */
export type AlgoCapabilityNote = {
  readonly createEnabled: boolean;
  readonly jobsEnabled: boolean;
  readonly jobsDefault: false;
  readonly icebergs: 'out';
};

export function presentAlgoCapabilityNote(input: { readonly createEnabled?: boolean; readonly jobsEnabled?: boolean }): AlgoCapabilityNote {
  return {
    createEnabled: input.createEnabled !== false,
    jobsEnabled: input.jobsEnabled === true,
    jobsDefault: false,
    icebergs: 'out',
  };
}
