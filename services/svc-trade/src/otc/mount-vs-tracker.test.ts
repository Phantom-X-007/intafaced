import { describe, expect, it } from 'vitest';
import { describeOtcPolicy } from './otc-policy.js';
import {
  OTC_DONE_BAR_TEST_FILES,
  OTC_HONEST_GAPS,
  OTC_MOUNTED_DOORS,
  OTC_TRACKER_ID,
  otcDoneBarTestsPresent,
  otcDoorsInRouterSource,
  otcMountMatrixComplete,
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

describe('trade.otc policy invent flags (D48)', () => {
  it('otcPolicyHonest locks all describeOtcPolicy invent flags false', () => {
    const p = describeOtcPolicy();
    expect(p.inventsSpreadBps).toBe(false);
    expect(p.inventsStakeGate).toBe(false);
    expect(p.inventsMakerBook).toBe(false);
    expect(p.inventsMidPrice).toBe(false);
    expect(otcPolicyHonest()).toBe(true);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
  });
});

describe('trade.otc mount matrix (D50)', () => {
  it('otcMountMatrixComplete locks all OTC_MOUNTED_DOORS in router source', () => {
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcMountVsTrackerBoardCard()).toMatchObject({
      doors: OTC_MOUNTED_DOORS.length,
      doorsMounted: OTC_MOUNTED_DOORS.length,
      mountComplete: true,
    });
  });
});

describe('trade.otc mount vs tracker gaps board (D52)', () => {
  it('otcMountVsTrackerBoardCard names honest gaps without flipping backend done bar', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(card.backendDoneBarMet).toBe(true);
    expect(OTC_HONEST_GAPS).toEqual(['gap.owner_desk_law_numbers', 'gap.socket_otc_maker_routing', 'gap.connect_venue_vault_custody']);
  });
});

describe('trade.otc done bar test files (D54)', () => {
  it('otcDoneBarTestsPresent locks all OTC_DONE_BAR_TEST_FILES on disk', () => {
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toEqual([
      'otc-rfq-settle-donebar.test.ts',
      'otc-mount.reachable.test.ts',
      'otc-maker-routing-donebar.test.ts',
      'otc-mid-feed-donebar.test.ts',
    ]);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('trade.otc mount board complete (D56)', () => {
  it('otcMountVsTrackerBoardCard reports mountComplete with policy honesty and all doors', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.doors).toBe(OTC_MOUNTED_DOORS.length);
    expect(otcPolicyHonest()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(OTC_MOUNTED_DOORS).toEqual(['policy', 'deskStatus', 'quote', 'accept', 'settle']);
    expect(card.backendDoneBarMet).toBe(true);
  });
});

describe('trade.otc mounted doors in router (D58)', () => {
  it('otcDoorsInRouterSource lists every OTC_MOUNTED_DOOR in router source', () => {
    const mounted = otcDoorsInRouterSource();
    for (const door of OTC_MOUNTED_DOORS) {
      expect(mounted).toContain(door);
    }
    expect(mounted).toHaveLength(OTC_MOUNTED_DOORS.length);
    expect(otcMountVsTrackerBoardCard().doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
  });
});
