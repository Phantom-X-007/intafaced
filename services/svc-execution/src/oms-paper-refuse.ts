/**
 * Live algo slice is oms-slice.ts (twap|vwap|pov). Paper stays paper.
 * Trailing / sniper / family twap|vwap|pov files are EXTRA — refuse rather
 * than dual-implement. Never invent a live child from a paper parent.
 * Mill paper/slice/family files are not recut. router.ts is not recut.
 */

export type OmsPaperRefuseReason = 'paper_unsupported';

export type OmsPaperUnsupportedRefuse = {
  readonly ok: false;
  readonly reason: OmsPaperRefuseReason;
  readonly detail: string;
};

const PAPER_KINDS = new Set([
  'paper',
  'paper-twap',
  'paper-vwap',
  'paper-pov',
  'paper-sniper',
  'paper-trailing',
  'paper-trailing-stop',
  'twap-slice',
  'vwap-slice',
  'pov-slice',
]);

export function refuseLiveOmsPaper(input: {
  readonly kind?: string | null;
  readonly paper?: boolean;
}): OmsPaperUnsupportedRefuse | null {
  if (input.paper === true) {
    return {
      ok: false,
      reason: 'paper_unsupported',
      detail: 'paper algo stays paper — refusing rather than submitting a live child',
    };
  }
  const kind = input.kind?.trim().toLowerCase() ?? '';
  if (!kind) return null;
  if (PAPER_KINDS.has(kind)) {
    return {
      ok: false,
      reason: 'paper_unsupported',
      detail: `live OMS kind ${kind} is paper/family extra — refusing rather than dual-implementing slice (oms-slice.ts twap|vwap|pov only)`,
    };
  }
  return null;
}
