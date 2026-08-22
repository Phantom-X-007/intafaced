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

describe('trade.otc backend done bar complete (D60)', () => {
  it('otcTrackerBackendDoneBarMet requires policy honesty, mount matrix, and done bar tests', () => {
    expect(otcPolicyHonest()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountVsTrackerBoardCard()).toMatchObject({
      mountComplete: true,
      backendDoneBarMet: true,
      gaps: OTC_HONEST_GAPS.length,
    });
  });
});

describe('trade.otc tracker identity and policy board (D62)', () => {
  it('otcMountVsTrackerBoardCard reports tracker id and honest policy without inventing', () => {
    expect(OTC_TRACKER_ID).toBe('trade.otc');
    const policy = describeOtcPolicy();
    expect(policy.moneyViaLedgerClientOnly).toBe(true);
    expect(policy.midFeedWiringHonest).toBe(true);
    expect(policy.inventsMidPrice).toBe(false);
    expect(otcMountVsTrackerBoardCard()).toMatchObject({
      tracker: 'trade.otc',
      backendDoneBarMet: true,
      gaps: OTC_HONEST_GAPS.length,
    });
  });
});

describe('trade.otc mounted doors and done bar files complete (D64)', () => {
  it('otcTrackerBackendDoneBarMet requires all five mounted doors and done bar test files', () => {
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(OTC_MOUNTED_DOORS).toEqual(['policy', 'deskStatus', 'quote', 'accept', 'settle']);
    expect(otcPolicyHonest()).toBe(true);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountVsTrackerBoardCard()).toMatchObject({
      mountComplete: true,
      backendDoneBarMet: true,
      doorsMounted: OTC_MOUNTED_DOORS.length,
    });
  });
});

describe('trade.otc mount vs tracker board complete (D66)', () => {
  it('otcMountVsTrackerBoardCard reports mount complete with honest gaps and backend done bar', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(card.backendDoneBarMet).toBe(true);
    expect(OTC_HONEST_GAPS).toEqual(['gap.owner_desk_law_numbers', 'gap.socket_otc_maker_routing', 'gap.connect_venue_vault_custody']);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(otcPolicyHonest()).toBe(true);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
  });
});

describe('trade.otc policy board complete (D68)', () => {
  it('describeOtcPolicy reports honest policy with all invent flags false and mid feed wiring', () => {
    const policy = describeOtcPolicy();
    expect(policy.inventsSpreadBps).toBe(false);
    expect(policy.inventsStakeGate).toBe(false);
    expect(policy.inventsMakerBook).toBe(false);
    expect(policy.inventsMidPrice).toBe(false);
    expect(policy.midFeedWiringHonest).toBe(true);
    expect(policy.midFeedWiringStates).toHaveLength(4);
    expect(policy.bootMidFeedWiring.wiring).toBe('flag_off');
    expect(policy.moneyViaLedgerClientOnly).toBe(true);
    expect(otcPolicyHonest()).toBe(true);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('trade.otc mounted doors in router complete (D70)', () => {
  it('otcDoorsInRouterSource lists every OTC_MOUNTED_DOOR with policy and done bar met', () => {
    const mounted = otcDoorsInRouterSource();
    expect(mounted).toEqual([...OTC_MOUNTED_DOORS]);
    expect(mounted).toHaveLength(5);
    expect(OTC_MOUNTED_DOORS).toEqual(['policy', 'deskStatus', 'quote', 'accept', 'settle']);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcPolicyHonest()).toBe(true);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountVsTrackerBoardCard()).toMatchObject({
      mountComplete: true,
      backendDoneBarMet: true,
      doorsMounted: OTC_MOUNTED_DOORS.length,
    });
  });
});

describe('trade.otc tracker backend done bar complete (D71)', () => {
  it('otcTrackerBackendDoneBarMet requires mount matrix, done bar tests, and policy honesty', () => {
    expect(OTC_TRACKER_ID).toBe('trade.otc');
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountVsTrackerBoardCard()).toMatchObject({
      tracker: 'trade.otc',
      backendDoneBarMet: true,
      gaps: OTC_HONEST_GAPS.length,
    });
  });
});

describe('trade.otc mount vs tracker — D75 denon complete', () => {
  it('mount matrix, policy honesty, done-bar tests, and honest gaps board all green', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'trade.otc',
      doors: OTC_MOUNTED_DOORS.length,
      doorsMounted: OTC_MOUNTED_DOORS.length,
      gaps: OTC_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(otcPolicyHonest()).toBe(true);
    const policy = describeOtcPolicy();
    expect(policy.moneyViaLedgerClientOnly).toBe(true);
    expect(policy.inventsSpreadBps).toBe(false);
    expect(policy.inventsMakerBook).toBe(false);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D77 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar tests, honest gaps', () => {
    expect(OTC_TRACKER_ID).toBe('trade.otc');
    const card = otcMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'trade.otc',
      doors: 5,
      doorsMounted: 5,
      gaps: 3,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toEqual(['gap.owner_desk_law_numbers', 'gap.socket_otc_maker_routing', 'gap.connect_venue_vault_custody']);
    const policy = describeOtcPolicy();
    expect(policy.inventsMidPrice).toBe(false);
    expect(policy.moneyViaLedgerClientOnly).toBe(true);
  });
});

describe('trade.otc mount vs tracker — D79 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toEqual([
      'otc-rfq-settle-donebar.test.ts',
      'otc-mount.reachable.test.ts',
      'otc-maker-routing-donebar.test.ts',
      'otc-mid-feed-donebar.test.ts',
    ]);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D81 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    expect(OTC_TRACKER_ID).toBe('trade.otc');
    const card = otcMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'trade.otc',
      backendDoneBarMet: true,
      mountComplete: true,
      doorsMounted: OTC_MOUNTED_DOORS.length,
      gaps: OTC_HONEST_GAPS.length,
    });
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toEqual(['gap.owner_desk_law_numbers', 'gap.socket_otc_maker_routing', 'gap.connect_venue_vault_custody']);
  });
});

describe('trade.otc mount vs tracker — D83 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D85 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    expect(OTC_TRACKER_ID).toBe('trade.otc');
    const card = otcMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'trade.otc',
      backendDoneBarMet: true,
      mountComplete: true,
      doorsMounted: OTC_MOUNTED_DOORS.length,
      gaps: OTC_HONEST_GAPS.length,
    });
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toEqual(['gap.owner_desk_law_numbers', 'gap.socket_otc_maker_routing', 'gap.connect_venue_vault_custody']);
  });
});

describe('trade.otc mount vs tracker — D87 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D89 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    expect(OTC_TRACKER_ID).toBe('trade.otc');
    const card = otcMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'trade.otc',
      backendDoneBarMet: true,
      mountComplete: true,
      doorsMounted: OTC_MOUNTED_DOORS.length,
      gaps: OTC_HONEST_GAPS.length,
    });
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toEqual(['gap.owner_desk_law_numbers', 'gap.socket_otc_maker_routing', 'gap.connect_venue_vault_custody']);
  });
});

describe('trade.otc mount vs tracker — D91 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D93 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D95 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D97 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D99 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D101 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D103 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D105 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D107 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D109 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D111 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D113 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D115 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D117 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});

describe('trade.otc mount vs tracker — D119 denon complete', () => {
  it('full mount board: tracker, doors, policy, done-bar files, honest gaps', () => {
    const card = otcMountVsTrackerBoardCard();
    expect(card.tracker).toBe('trade.otc');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(OTC_MOUNTED_DOORS.length);
    expect(card.gaps).toBe(OTC_HONEST_GAPS.length);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountMatrixComplete()).toBe(true);
    expect(otcDoorsInRouterSource()).toEqual([...OTC_MOUNTED_DOORS]);
    expect(otcDoneBarTestsPresent()).toBe(true);
    expect(OTC_DONE_BAR_TEST_FILES).toHaveLength(4);
    expect(otcPolicyHonest()).toBe(true);
    expect(OTC_HONEST_GAPS).toHaveLength(3);
  });
});
