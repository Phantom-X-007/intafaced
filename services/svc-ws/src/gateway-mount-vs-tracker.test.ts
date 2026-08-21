import { describe, expect, it } from 'vitest';
import {
  GATEWAY_PRODUCT_SYMBOLS,
  WS_GATEWAY_TRACKER_ID,
  gatewaySymbolsInProductSource,
  wsGatewayMountVsTrackerBoardCard,
  wsGatewayTrackerBackendDoneBarMet,
} from './gateway-mount-vs-tracker.js';

describe('ws.gateway mount vs tracker honest gaps (D26-P4-06)', () => {
  it('backend done bar met on tip — empty book honesty + engine unavailable', () => {
    expect(WS_GATEWAY_TRACKER_ID).toBe('ws.gateway');
    expect([gatewaySymbolsInProductSource()].sort()).toEqual([...GATEWAY_PRODUCT_SYMBOLS].sort());
    expect(wsGatewayTrackerBackendDoneBarMet()).toBe(true);
    expect(wsGatewayMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
