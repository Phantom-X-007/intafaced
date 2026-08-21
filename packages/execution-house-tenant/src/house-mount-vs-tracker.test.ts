import { describe, expect, it } from 'vitest';
import {
  HOUSE_TENANT_TRACKER_ID,
  TENANT_MOUNTED_DOORS,
  houseTenantMountVsTrackerBoardCard,
  houseTenantTrackerBackendDoneBarMet,
  tenantDoorsInExecutionRouterSource,
} from './house-mount-vs-tracker.js';

describe('execution.house-tenant mount vs tracker honest gaps (D26-P0-01)', () => {
  it('backend done bar met on tip — external-only kill-first tenant', () => {
    expect(HOUSE_TENANT_TRACKER_ID).toBe('execution.house-tenant');
    expect(tenantDoorsInExecutionRouterSource()).toEqual([...TENANT_MOUNTED_DOORS]);
    expect(houseTenantTrackerBackendDoneBarMet()).toBe(true);
    expect(houseTenantMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
