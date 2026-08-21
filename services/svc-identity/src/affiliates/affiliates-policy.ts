/**
 * ops.affiliates product policy — accrual + payout refuse honesty (DIRECTION §8).
 *
 * Tree and accrual mechanism may ship; rates and payout magnitudes stay owner law.
 */
import { AFFILIATE_ACCRUAL_RATE_RESIDUAL } from './commission-rate-law.js';
import { AFFILIATE_PAYOUT_RESIDUAL } from './admin-tree-read.js';
import { DEFAULT_MAX_REFERRAL_DEPTH } from './referral-tree.js';

export type AffiliatesPolicySummary = ReturnType<typeof describeAffiliatesPolicy>;

/** Public honesty board for ops.affiliates — structure yes, invented rates no. */
export function describeAffiliatesPolicy() {
  return {
    maxReferralDepthCap: DEFAULT_MAX_REFERRAL_DEPTH,
    maxPayoutTierDepth: DEFAULT_MAX_REFERRAL_DEPTH,
    payoutResidual: AFFILIATE_PAYOUT_RESIDUAL,
    accrualRateResidual: AFFILIATE_ACCRUAL_RATE_RESIDUAL,
    inventsCommissionRates: false as const,
    inventsPayoutMagnitudes: false as const,
    moneyViaLedgerClientOnly: true as const,
    tamperedRowReverifyOnPayout: true as const,
  };
}
