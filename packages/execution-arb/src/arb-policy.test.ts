import { describe, expect, it } from 'vitest';
import { CROSS_EXCHANGE_DEFAULT_MID, CROSS_EXCHANGE_DEFAULT_SPREAD_BPS, HOUSE_ARB_PREFERENCE_BPS } from './arbitrage.js';
import { ARB_BRIDGE_FANTASY_REFUSE_REASON, describeArbitragePolicy } from './arb-policy.js';

describe('describeArbitragePolicy', () => {
  it('states external-only arb honesty without default spread or mid', () => {
    const p = describeArbitragePolicy();
    expect(p.externalOnlyV1).toBe(true);
    expect(p.crossExchangeDefaultSpreadBps).toBe(CROSS_EXCHANGE_DEFAULT_SPREAD_BPS);
    expect(p.crossExchangeDefaultMid).toBe(CROSS_EXCHANGE_DEFAULT_MID);
    expect(p.houseArbPreferenceBps).toBe(HOUSE_ARB_PREFERENCE_BPS);
    expect(p.noDefaultSpreadBps).toBe(CROSS_EXCHANGE_DEFAULT_SPREAD_BPS === null);
    expect(p.noDefaultMid).toBe(CROSS_EXCHANGE_DEFAULT_MID === null);
    expect(p.noHouseArbPreference).toBe(HOUSE_ARB_PREFERENCE_BPS === null);
    expect(p.bridgeFantasyRefuseReason).toBe(ARB_BRIDGE_FANTASY_REFUSE_REASON);
    expect(p.bridgeFantasyRefused).toBe(true);
    expect(p.inventsMids).toBe(false);
    expect(p.inventsSpreads).toBe(false);
    expect(p.noSecondMoneyBook).toBe(true);
  });
});
