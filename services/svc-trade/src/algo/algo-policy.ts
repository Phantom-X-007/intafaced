/**
 * trade.algo product policy — TWAP schedule honesty (D-S-04 / ADR algo law).
 *
 * Consolidates capability + cancel disposition + immature-kind refuse from
 * `algo-capability.ts`, `twap-engine.ts`, and `volume-plan.ts`. Does not
 * start jobs, place children, or invent parent fills / VWAP curves / POV tape.
 */
import { presentAlgoCapabilityNote, type AlgoCapabilityNote } from './algo-capability.js';

/** v1 honest product path — parent is a schedule, not an order. */
export const ALGO_PRODUCT_KIND = 'twap' as const;

/** Wire kinds that refuse when lookback / live tape is immature — never a default curve. */
export const ALGO_IMMATURE_KINDS = ['vwap', 'pov'] as const;

/** haltReason when cancel partially failed — resume refused until re-cancel succeeds. */
export const ALGO_CANCEL_INCOMPLETE_HALT = 'cancel_incomplete' as const;

/** Stable refuse when resume is attempted after a partial cancel park. */
export const ALGO_CANCEL_INCOMPLETE_CODE = 'trade.algo_cancel_incomplete' as const;

/** Stable refuse when VWAP/POV volume inputs are absent or all-zero. */
export const ALGO_VOLUME_IMMATURE_CODE = 'trade.algo_volume_immature' as const;

export type AlgoPolicySummary = {
  readonly productKind: typeof ALGO_PRODUCT_KIND;
  readonly capability: AlgoCapabilityNote;
  readonly parentHoldsNoBalance: true;
  readonly progressFromChildFillsOnly: true;
  readonly cancelIncompleteHalt: typeof ALGO_CANCEL_INCOMPLETE_HALT;
  readonly cancelIncompleteCode: typeof ALGO_CANCEL_INCOMPLETE_CODE;
  readonly resumeRefusedOnCancelIncomplete: true;
  readonly vwapPovImmatureRefused: true;
  readonly volumeImmatureCode: typeof ALGO_VOLUME_IMMATURE_CODE;
  readonly immatureKinds: typeof ALGO_IMMATURE_KINDS;
  readonly inventsParentFill: false;
  readonly inventsVwapCurve: false;
  readonly inventsPovVolume: false;
  readonly moneyViaLedgerClientOnly: true;
};

/** Public trade.algo policy door — mirrors capability + cancel + immature-kind law. */
export function describeAlgoPolicy(input?: { readonly createEnabled?: boolean; readonly jobsEnabled?: boolean }): AlgoPolicySummary {
  return {
    productKind: ALGO_PRODUCT_KIND,
    capability: presentAlgoCapabilityNote(input ?? {}),
    parentHoldsNoBalance: true,
    progressFromChildFillsOnly: true,
    cancelIncompleteHalt: ALGO_CANCEL_INCOMPLETE_HALT,
    cancelIncompleteCode: ALGO_CANCEL_INCOMPLETE_CODE,
    resumeRefusedOnCancelIncomplete: true,
    vwapPovImmatureRefused: true,
    volumeImmatureCode: ALGO_VOLUME_IMMATURE_CODE,
    immatureKinds: ALGO_IMMATURE_KINDS,
    inventsParentFill: false,
    inventsVwapCurve: false,
    inventsPovVolume: false,
    moneyViaLedgerClientOnly: true,
  };
}
