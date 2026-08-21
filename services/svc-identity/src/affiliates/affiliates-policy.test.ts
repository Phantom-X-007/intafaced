import { describe, expect, it } from 'vitest';
import { AFFILIATE_PAYOUT_RESIDUAL } from './admin-tree-read.js';
import { describeAffiliatesPolicy } from './affiliates-policy.js';

describe('describeAffiliatesPolicy', () => {
  it('states affiliate honesty without inventing commission rates', () => {
    const p = describeAffiliatesPolicy();
    expect(p.payoutResidual).toBe(AFFILIATE_PAYOUT_RESIDUAL);
    expect(p.inventsCommissionRates).toBe(false);
    expect(p.inventsPayoutMagnitudes).toBe(false);
    expect(p.moneyViaLedgerClientOnly).toBe(true);
    expect(p.maxPayoutTierDepth).toBe(p.maxReferralDepthCap);
  });
});
