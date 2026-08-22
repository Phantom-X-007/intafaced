import { describe, expect, it } from 'vitest';
import {
  HOUSE_TENANT_TENANT_DOORS,
  HOUSE_TENANT_TRACKER_ID,
  houseTenantDoorsInExecutionRouter,
  houseTenantMountVsTrackerBoardCard,
  houseTenantPolicyDoorInExecutionRouter,
  houseTenantTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('execution.house-tenant mount vs tracker honest gaps (D26-P0-01)', () => {
  it('backend done bar met on tip — tenant doors + policy spine wired', () => {
    expect(HOUSE_TENANT_TRACKER_ID).toBe('execution.house-tenant');
    expect(houseTenantDoorsInExecutionRouter()).toEqual([...HOUSE_TENANT_TENANT_DOORS]);
    expect(houseTenantPolicyDoorInExecutionRouter()).toBe(true);
    expect(houseTenantTrackerBackendDoneBarMet()).toBe(true);
    expect(houseTenantMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
