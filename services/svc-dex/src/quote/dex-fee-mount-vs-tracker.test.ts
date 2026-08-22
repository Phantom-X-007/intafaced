import { describe, expect, it } from 'vitest';
import {
  DEX_FEE_SOURCE_TRACKER_ID,
  dexFeeSourceMountVsTrackerBoardCard,
  dexFeeSourceTrackerBackendDoneBarMet,
} from './dex-fee-mount-vs-tracker.js';

describe('socket.dex-fee-source mount vs tracker (S-I3)', () => {
  it('backend done bar met on tip — paired CLOB cost env + refuse-closed gate', () => {
    expect(DEX_FEE_SOURCE_TRACKER_ID).toBe('socket.dex-fee-source');
    expect(dexFeeSourceTrackerBackendDoneBarMet()).toBe(true);
    expect(dexFeeSourceMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
