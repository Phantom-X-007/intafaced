/**
 * Declared split-brain (PX-S03 invariant 3). New submits/amends refuse. Cancels stay.
 * Dual-control: two distinct operator identities. Missing/blank/same-as-operator refuses.
 * Last-write-wins on the journal. Replay does not invent a replica count or timeout.
 */
import { dualControlRefuse, MISSING_OPERATOR, readConfirmOperatorId, readOperatorId } from './halt.js';
import type { AmendResult, RejectReason, SplitBrainResult, SubmitResult } from './types.js';

export const SPLIT_BRAIN = 'split_brain' as const;

export type SplitBrainRefuse = typeof SPLIT_BRAIN | typeof MISSING_OPERATOR;

export { readConfirmOperatorId, readOperatorId, dualControlRefuse };

export function splitBrainRefuse(): RejectReason {
  return {
    code: SPLIT_BRAIN,
    message: 'split-brain is declared — new order entry is refused',
  };
}

export function splitBrainSubmitResult(orderId: string): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: { ...splitBrainRefuse(), message: `split-brain is declared — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}

export function splitBrainAmendResult(orderId: string): AmendResult {
  return {
    accepted: false,
    orderId,
    sequence: null,
    version: null,
    priority: null,
    fills: [],
    resting: null,
    rejected: { ...splitBrainRefuse(), message: `split-brain is declared — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}

export function refusedSplitBrain(
  cmd: { readonly operatorId?: string | null; readonly confirmOperatorId?: string | null },
  splitBrain: boolean,
): SplitBrainResult | null {
  const operatorId = readOperatorId(cmd);
  const confirmOperatorId = readConfirmOperatorId(cmd);
  const refuse = dualControlRefuse(operatorId, confirmOperatorId);
  if (!refuse) return null;
  return {
    accepted: false,
    splitBrain,
    operatorId: operatorId,
    confirmOperatorId,
    rejected: refuse,
  };
}

/** Last split_brain / clear_split_brain wins. Not a book — replay does not invent a replica. */
export function replaySplitBrain(records: readonly { readonly kind: string }[]): boolean {
  let declared = false;
  for (const record of records) {
    if (record.kind === 'split_brain') declared = true;
    else if (record.kind === 'clear_split_brain') declared = false;
  }
  return declared;
}
