import { describe, expect, it } from 'vitest';
import {
  AMM_MOUNTED_DOORS,
  AMM_TRACKER_ID,
  ammDoorsInRouterSource,
  protocolAmmMountVsTrackerBoardCard,
  protocolAmmTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('protocol.amm mount vs tracker honest gaps (D26-P1-A2)', () => {
  it('backend done bar met on tip — pool math + swap calldata mounted', () => {
    expect(AMM_TRACKER_ID).toBe('protocol.amm');
    expect(ammDoorsInRouterSource()).toEqual([...AMM_MOUNTED_DOORS]);
    expect(protocolAmmTrackerBackendDoneBarMet()).toBe(true);
    expect(protocolAmmMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
