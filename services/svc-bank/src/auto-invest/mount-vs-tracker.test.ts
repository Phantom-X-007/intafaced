import { describe, expect, it } from 'vitest';
import {
  AUTO_INVEST_MOUNTED_DOORS,
  AUTO_INVEST_TRACKER_ID,
  autoInvestDoorsInRouterSource,
  bankAutoInvestMountVsTrackerBoardCard,
  bankAutoInvestTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('bank.auto-invest mount vs tracker honest gaps (D26-P1-B4)', () => {
  it('backend done bar met on tip — threshold sweep + card round-up mounted', () => {
    expect(AUTO_INVEST_TRACKER_ID).toBe('bank.auto-invest');
    expect(autoInvestDoorsInRouterSource()).toEqual([...AUTO_INVEST_MOUNTED_DOORS]);
    expect(bankAutoInvestTrackerBackendDoneBarMet()).toBe(true);
    expect(bankAutoInvestMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
