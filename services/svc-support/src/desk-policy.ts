/**
 * ops.support desk policy — mountain split, queue honesty, identity grounding.
 * Settlement is refuse-closed: cite articles, never pay.
 */
import { deskVsAgentSplit } from './desk-vs-agent-split.js';
import { identityGroundingHonesty } from './identity-grounding-honesty.js';
import { describeSupportSettlement } from './settlement-refuse.js';
import { queueTimingHonesty } from './sla-honesty.js';

export type SupportDeskPolicy = ReturnType<typeof describeSupportDeskPolicy>;

/** Public honesty board for ops.support — no SLA invent, no agent/desk conflation. */
export function describeSupportDeskPolicy(internalServiceSecret: string | undefined | null) {
  return {
    split: deskVsAgentSplit(),
    queue: queueTimingHonesty(),
    identityGrounding: identityGroundingHonesty(internalServiceSecret),
    settlement: describeSupportSettlement(),
  };
}
