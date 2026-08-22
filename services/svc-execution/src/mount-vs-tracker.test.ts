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

  it('D73 — honest gaps remain owner-residual; mount cert does not stamp product done', () => {
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([
      'gap.durable_ems_store',
      'gap.letter_to_bps_owner_schedule',
      'gap.live_venue_cred_operator_wiring',
    ]);
    expect(executionSorMountVsTrackerBoardCard().gaps).toBe(3);
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
