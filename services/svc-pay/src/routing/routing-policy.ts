/**
 * pay.routing product policy — smart geo/method/risk selection honesty (D26-P1-P3).
 *
 * Never invents approval rates, cost weights, or missing dimensions.
 */
import { FORBIDDEN_ROUTING_SCORE_FIELDS } from '../routing-inputs.js';

export const ROUTING_REQUIRED_DIMENSIONS = ['geo', 'method', 'risk'] as const;

export type RoutingPolicySummary = ReturnType<typeof describeRoutingPolicy>;

/** Public honesty board for pay.routing — mechanism only, no invented scores. */
export function describeRoutingPolicy() {
  return {
    requiredDimensions: ROUTING_REQUIRED_DIMENSIONS,
    forbiddenInventedScoreFields: [...FORBIDDEN_ROUTING_SCORE_FIELDS],
    optimizesSuccessThenCost: true as const,
    blankDimensionRefuseClosed: true as const,
    approvalRateMustBeOperatorDeclared: true as const,
    inventsApprovalRates: false as const,
    inventsCostWeights: false as const,
    movesMoney: false as const,
  };
}
