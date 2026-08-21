import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_PRODUCT_SYMBOLS,
  COMPLIANCE_TRACKER_ID,
  complianceSymbolsInSource,
  opsComplianceMountVsTrackerBoardCard,
  opsComplianceTrackerBackendDoneBarMet,
} from './compliance-mount-vs-tracker.js';

describe('ops.compliance mount vs tracker honest gaps (D26-P1-O1M)', () => {
  it('backend done bar met on tip — mechanism without inventing list content', () => {
    expect(COMPLIANCE_TRACKER_ID).toBe('ops.compliance');
    expect(complianceSymbolsInSource()).toEqual([...COMPLIANCE_PRODUCT_SYMBOLS]);
    expect(opsComplianceTrackerBackendDoneBarMet()).toBe(true);
    expect(opsComplianceMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
