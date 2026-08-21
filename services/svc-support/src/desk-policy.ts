/**
 * ops.support desk policy — mountain split, queue honesty, identity grounding.
 */
import { deskVsAgentSplit } from './desk-vs-agent-split.js';
import { identityGroundingProof } from './identity-grounding-honesty.js';
import { queueTimingHonesty } from './sla-honesty.js';

export type SupportDeskPolicy = ReturnType<typeof describeSupportDeskPolicy>;

/** Public honesty board for ops.support — no SLA invent, no agent/desk conflation. */
export function describeSupportDeskPolicy(internalServiceSecret: string | undefined | null) {
  return {
    split: deskVsAgentSplit(),
    queue: queueTimingHonesty(),
    identityGrounding: identityGroundingProof(internalServiceSecret),
  };
}
