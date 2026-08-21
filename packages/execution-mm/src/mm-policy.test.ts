import { describe, expect, it } from 'vitest';
import { describeMarketMakingPolicy } from './mm-policy.js';

describe('describeMarketMakingPolicy', () => {
  it('states external-only MM honesty without inventing owner magnitudes', () => {
    const p = describeMarketMakingPolicy();
    expect(p.externalOnlyV1).toBe(true);
    expect(p.internalHalfBlocked).toBe(true);
    expect(p.killSwitchAppliesFirst).toBe(true);
    expect(p.inventsSpreadMagnitudes).toBe(false);
    expect(p.noSecondMoneyBook).toBe(true);
  });
});
