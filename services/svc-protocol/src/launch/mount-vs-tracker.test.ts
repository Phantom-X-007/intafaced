import { describe, expect, it } from 'vitest';
import {
  TOKEN_FACTORY_MOUNTED_DOORS,
  TOKEN_FACTORY_TRACKER_ID,
  launchTokenFactoryMountVsTrackerBoardCard,
  launchTokenFactoryTrackerBackendDoneBarMet,
  tokenFactoryDoorsInRouterSource,
} from './mount-vs-tracker.js';

describe('launch.token-factory mount vs tracker honest gaps (D26-P1-L1)', () => {
  it('backend done bar met on tip — token launch doors + on-chain proof', () => {
    expect(TOKEN_FACTORY_TRACKER_ID).toBe('launch.token-factory');
    expect(tokenFactoryDoorsInRouterSource()).toEqual([...TOKEN_FACTORY_MOUNTED_DOORS]);
    expect(launchTokenFactoryTrackerBackendDoneBarMet()).toBe(true);
    expect(launchTokenFactoryMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
