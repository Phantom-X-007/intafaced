import { describe, expect, it } from 'vitest';
import {
  GATEWAY_CORE_DOORS,
  GATEWAY_MOUNTED_SURFACES,
  PAY_GATEWAY_TRACKER_ID,
  gatewayCoreDoorsMounted,
  gatewaySurfacesInRouterSource,
  payGatewayMountVsTrackerBoardCard,
  payGatewayTrackerBackendDoneBarMet,
} from './gateway-mount-vs-tracker.js';

describe('pay.gateway mount vs tracker honest gaps (D26-P1-P1)', () => {
  it('backend done bar met on tip', () => {
    expect(PAY_GATEWAY_TRACKER_ID).toBe('pay.gateway');
    expect([gatewaySurfacesInRouterSource()].sort()).toEqual([...GATEWAY_MOUNTED_SURFACES].sort());
    expect(gatewayCoreDoorsMounted()).toBe(true);
    expect(GATEWAY_CORE_DOORS.length).toBeGreaterThan(0);
    expect(payGatewayTrackerBackendDoneBarMet()).toBe(true);
    expect(payGatewayMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
