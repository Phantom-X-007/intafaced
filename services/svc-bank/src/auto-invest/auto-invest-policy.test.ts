import { describe, expect, it } from 'vitest';
import { AUTO_INVEST_RATE_UNSET, describeAutoInvestPolicy } from './auto-invest-policy.js';

describe('describeAutoInvestPolicy — bank.auto-invest honesty door', () => {
  it('reports convert requirement for DCA and cross-asset round-up', () => {
    const policy = describeAutoInvestPolicy({ enabled: true, convertWired: false });
    expect(policy.inventsRates).toBe(false);
    expect(policy.dcaRequiresConvert).toBe(true);
    expect(policy.rateUnsetCode).toBe(AUTO_INVEST_RATE_UNSET);
    expect(policy.kinds).toContain('dca');
  });

  it('reflects enabled and convert wired flags', () => {
    expect(describeAutoInvestPolicy({ enabled: false, convertWired: true }).enabled).toBe(false);
    expect(describeAutoInvestPolicy({ enabled: true, convertWired: true }).convertWired).toBe(true);
  });
});
