/**
 * bank.business product policy — maker/checker dual control honesty.
 *
 * Threshold is per-account owner law; this door never invents a default amount.
 */
export const BUSINESS_ROLES = ['admin', 'maker', 'checker'] as const;

export type BusinessPolicySummary = ReturnType<typeof describeBusinessPolicy>;

/** Public honesty board for bank.business — dual control + hold-before-approve. */
export function describeBusinessPolicy() {
  return {
    roles: BUSINESS_ROLES,
    dualControlOverThreshold: true as const,
    holdBeforeCheckerApprove: true as const,
    makerCannotSelfApprove: true as const,
    thresholdPerAccountOwnerLaw: true as const,
    inventsDefaultThreshold: false as const,
    underThresholdPostsImmediately: true as const,
  };
}
