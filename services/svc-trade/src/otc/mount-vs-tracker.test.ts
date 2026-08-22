import { describe, expect, it } from 'vitest';
import { describeOtcPolicy } from './otc-policy.js';
import {
  OTC_MOUNTED_DOORS,
  OTC_TRACKER_ID,
  otcDoneBarTestsPresent,
  otcDoorsInRouterSource,
  otcMountVsTrackerBoardCard,
  otcPolicyHonest,
  otcTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('trade.otc mount vs tracker honest gaps (D26-P1-T2)', () => {
  it('backend done bar met on tip', () => {
    expect(OTC_TRACKER_ID).toBe('trade.otc');
    expect(Array.from(otcDoorsInRouterSource()).sort()).toEqual(Array.from(OTC_MOUNTED_DOORS).sort());
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('trade.otc policy honesty mount (D46)', () => {
  it('otcPolicyHonest locks bootMidFeedWiring flag_off and mid-feed honesty board', () => {
    expect(otcPolicyHonest()).toBe(true);
    const p = describeOtcPolicy();
    expect(p.bootMidFeedWiring.wiring).toBe('flag_off');
    expect(p.inventsMidPrice).toBe(false);
    expect(p.midFeedWiringHonest).toBe(true);
    expect(p.midFeedWiringStates).toHaveLength(4);
    expect(p.moneyViaLedgerClientOnly).toBe(true);
  });
});
