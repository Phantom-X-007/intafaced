import { describe, expect, it } from 'vitest';
import {
  agentsRiskComplianceMountVsTrackerBoardCard,
  agentsRiskComplianceTrackerBackendDoneBarMet,
  RISK_COMPLIANCE_MOUNTED_DOORS,
  RISK_COMPLIANCE_TRACKER_ID,
  riskComplianceDoorsInRouterSource,
} from './mount-vs-tracker.js';

describe('agents.risk-compliance mount vs tracker honest gaps (D26-P1-RC1)', () => {
  it('backend done bar met on tip — drafts never decide', () => {
    expect(RISK_COMPLIANCE_TRACKER_ID).toBe('agents.risk-compliance');
    expect(riskComplianceDoorsInRouterSource()).toEqual([...RISK_COMPLIANCE_MOUNTED_DOORS]);
    expect(agentsRiskComplianceTrackerBackendDoneBarMet()).toBe(true);
    expect(agentsRiskComplianceMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
