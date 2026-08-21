import { describe, expect, it } from 'vitest';
import {
  SMART_ACCOUNTS_MOUNTED_DOORS,
  SMART_ACCOUNTS_TRACKER_ID,
  protocolSmartAccountsMountVsTrackerBoardCard,
  protocolSmartAccountsTrackerBackendDoneBarMet,
  smartAccountsDoorsInRouterSource,
} from './smart-accounts-mount-vs-tracker.js';

describe('protocol.smart-accounts mount vs tracker honest gaps (D26-P1-S1)', () => {
  it('backend done bar met on tip — session keys + factory mounted', () => {
    expect(SMART_ACCOUNTS_TRACKER_ID).toBe('protocol.smart-accounts');
    expect(smartAccountsDoorsInRouterSource()).toEqual([...SMART_ACCOUNTS_MOUNTED_DOORS]);
    expect(protocolSmartAccountsTrackerBackendDoneBarMet()).toBe(true);
    expect(protocolSmartAccountsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
