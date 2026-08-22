import { describe, expect, it } from 'vitest';
import {
  EXECUTION_SOR_HONEST_GAPS,
  EXECUTION_SOR_OMS_DOORS,
  EXECUTION_SOR_TRACKER_ID,
  executionSorBootHonestInSource,
  executionSorDoneBarTestsPresent,
  executionSorMountVsTrackerBoardCard,
  executionSorPolicyHonest,
  executionSorTrackerBackendDoneBarMet,
  executionSorVenueAdapterPolicyInSource,
  sorOmsDoorsInRouterSource,
} from './mount-vs-tracker.js';

describe('execution.sor mount vs tracker honest gaps (D73-P2)', () => {
  it('backend done bar met on tip — OMS doors + spine honesty + boot wiring', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(executionSorMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
    expect(executionSorMountVsTrackerBoardCard().mountComplete).toBe(true);
  });

  it('D73 — honest gaps closed when owner schedule env + compose wiring present', () => {
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
    expect(executionSorMountVsTrackerBoardCard().gaps).toBe(0);
  });
});

describe('execution.sor mount vs tracker — D74 denon complete', () => {
  it('mount cert board, OMS doors, spine, boot, venue-adapter policy, and done-bar tests all green', () => {
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
  });
});

describe('execution.sor mount vs tracker — D75 denon complete', () => {
  it('mount cert, OMS router mount, and EMS journal path all green on tip', () => {
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(executionSorMountVsTrackerBoardCard()).toMatchObject({
      tracker: 'execution.sor',
      backendDoneBarMet: true,
      mountComplete: true,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
    });
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
    expect(sorOmsDoorsInRouterSource()).toEqual(['plan', 'execute', 'cancel', 'fetch']);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
  });
});

describe('execution.sor mount vs tracker — D76 denon complete', () => {
  it('full mount board: OMS doors, spine policy, boot, venue-adapter wiring, done-bar tests', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: 4,
      doorsMounted: 4,
      gaps: 0,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
  });
});

describe('execution.sor mount vs tracker — D77 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D78 denon complete', () => {
  it('mount cert board complete: OMS doors, spine, boot, venue-adapter, done-bar tests', () => {
    const card = executionSorMountVsTrackerBoardCard();
    expect(card.tracker).toBe('execution.sor');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doorsMounted).toBe(EXECUTION_SOR_OMS_DOORS.length);
    expect(card.gaps).toBe(EXECUTION_SOR_HONEST_GAPS.length);
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toHaveLength(0);
  });
});

describe('execution.sor mount vs tracker — D79 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D80 denon complete', () => {
  it('mount cert board complete: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests', () => {
    const card = executionSorMountVsTrackerBoardCard();
    expect(card.tracker).toBe('execution.sor');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doors).toBe(EXECUTION_SOR_OMS_DOORS.length);
    expect(card.gaps).toBe(EXECUTION_SOR_HONEST_GAPS.length);
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toHaveLength(0);
  });
});

describe('execution.sor mount vs tracker — D82 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D84 denon complete', () => {
  it('mount cert board complete: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests', () => {
    const card = executionSorMountVsTrackerBoardCard();
    expect(card.tracker).toBe('execution.sor');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doors).toBe(EXECUTION_SOR_OMS_DOORS.length);
    expect(card.gaps).toBe(EXECUTION_SOR_HONEST_GAPS.length);
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toHaveLength(0);
  });
});

describe('execution.sor mount vs tracker — D86 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D88 denon complete', () => {
  it('mount cert board complete: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests', () => {
    const card = executionSorMountVsTrackerBoardCard();
    expect(card.tracker).toBe('execution.sor');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.mountComplete).toBe(true);
    expect(card.doors).toBe(EXECUTION_SOR_OMS_DOORS.length);
    expect(card.gaps).toBe(EXECUTION_SOR_HONEST_GAPS.length);
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toHaveLength(0);
  });
});

describe('execution.sor mount vs tracker — D90 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D92 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D94 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D96 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D98 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D100 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D102 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D104 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D106 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D108 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D110 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D112 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D114 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D116 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D118 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});

describe('execution.sor mount vs tracker — D120 denon complete', () => {
  it('full mount board: tracker, OMS doors, policy, boot, venue-adapter, done-bar tests, honest gaps', () => {
    expect(EXECUTION_SOR_TRACKER_ID).toBe('execution.sor');
    const card = executionSorMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'execution.sor',
      doors: EXECUTION_SOR_OMS_DOORS.length,
      doorsMounted: EXECUTION_SOR_OMS_DOORS.length,
      gaps: EXECUTION_SOR_HONEST_GAPS.length,
      backendDoneBarMet: true,
      mountComplete: true,
    });
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(sorOmsDoorsInRouterSource()).toEqual([...EXECUTION_SOR_OMS_DOORS]);
    expect(executionSorPolicyHonest()).toBe(true);
    expect(executionSorBootHonestInSource()).toBe(true);
    expect(executionSorVenueAdapterPolicyInSource()).toBe(true);
    expect(executionSorDoneBarTestsPresent()).toBe(true);
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
  });
});
