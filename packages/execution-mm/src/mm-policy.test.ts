import { describe, expect, it } from 'vitest';
import { describeMarketMakingPolicy } from './mm-policy.js';

describe('describeMarketMakingPolicy', () => {
  it('states external-only MM honesty without inventing owner magnitudes', () => {
    const p = describeMarketMakingPolicy();
    expect(p.externalOnlyV1).toBe(true);
    expect(p.internalHalfBlocked).toBe(true);
    expect(p.killSwitchAppliesFirst).toBe(true);
    expect(p.inventsSpreadMagnitudes).toBe(false);
    expect(p.inventsMmpThresholds).toBe(false);
    expect(p.ownerMmpThresholdsOnly).toBe(true);
    expect(p.unsetMmpDisablesMassQuote).toBe(true);
    expect(p.massQuoteRequiresMmpGroup).toBe(true);
    expect(p.massQuoteRequiresCancelOnDisconnect).toBe(true);
    expect(p.massQuotePerEntryOutcomes).toBe(true);
    expect(p.cancelNamedQuoteGroupNeverCancelsOthers).toBe(true);
    expect(p.missingQuoteGroupRefusesNotCancelAll).toBe(true);
    expect(p.noSecondMoneyBook).toBe(true);
  });
});
