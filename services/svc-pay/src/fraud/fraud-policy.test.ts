import { describe, expect, it } from 'vitest';
import { FRAUD_RULE_IDS, describeFraudPolicy } from './fraud-policy.js';

describe('describeFraudPolicy', () => {
  it('states mechanism honesty without inventing list content', () => {
    const p = describeFraudPolicy();
    expect(p.ruleIds).toEqual(FRAUD_RULE_IDS);
    expect(p.inventsRiskScores).toBe(false);
    expect(p.inventsBlocklistContent).toBe(false);
    expect(p.chargebackLedgerRefuseClosed).toBe(true);
    expect(p.silentAllowForbidden).toBe(true);
  });
});
