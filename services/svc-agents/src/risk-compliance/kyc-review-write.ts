/**
 * identity.kyc-review `reviewed_by` is an operator column.
 * This agent must never write it — a draft is not an approval.
 */

import type { CopyKey } from '../copy.js';
import { RISK_COMPLIANCE_REFUSE_COPY } from './screening-draft.js';

export type KycReviewWriteRefuse = {
  readonly status: 'refuse';
  readonly reason: 'kyc_review_is_operator_only';
  readonly kind: 'not_a_decision';
  readonly isDecision: false;
  /** Named so tests can grep the boundary without a write landing. */
  readonly column: 'reviewed_by';
  readonly writable: false;
  readonly userMessageKey: CopyKey;
};

export type KycReviewWriteInput = {
  readonly recordId?: string;
  readonly reviewerId?: string;
  readonly decision?: string;
};

/**
 * Refuse every attempt to stamp identity.kyc-review as reviewed.
 * Return shape has no `reviewed_by` value — the agent cannot carry one.
 */
export function refuseIdentityKycReviewWrite(_input: KycReviewWriteInput = {}): KycReviewWriteRefuse {
  return {
    status: 'refuse',
    reason: 'kyc_review_is_operator_only',
    kind: 'not_a_decision',
    isDecision: false,
    column: 'reviewed_by',
    writable: false,
    userMessageKey: RISK_COMPLIANCE_REFUSE_COPY,
  };
}
