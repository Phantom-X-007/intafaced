/**
 * D26-P1-RC1 — agents.risk-compliance mount vs tracker honest gaps.
 *
 * Screening-support drafts for humans only — never a compliance decision.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RISK_COMPLIANCE_TRACKER_ID = 'agents.risk-compliance' as const;

export const RISK_COMPLIANCE_MOUNTED_DOORS = ['draftScreening'] as const;

export const RISK_COMPLIANCE_DONE_BAR_TEST_FILES = ['draft-route.test.ts', 'screening-draft.test.ts', 'kyc-review-write.test.ts'] as const;

export const RISK_COMPLIANCE_HONEST_GAPS = ['gap.sanctions_content_class_x', 'gap.geo_vpn_case_ui'] as const;

export function riskComplianceDoorsInRouterSource(): readonly (typeof RISK_COMPLIANCE_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}riskCompliance:\s*router\(\{/m);
  if (start === -1) return [];
  const block = src.slice(start);
  return RISK_COMPLIANCE_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function riskComplianceDraftHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const draft = readFileSync(join(here, 'screening-draft.ts'), 'utf8');
  const kyc = readFileSync(join(here, 'kyc-review-write.ts'), 'utf8');
  return (
    /not_a_decision/.test(draft) &&
    /inventedBlockedList:\s*false/.test(draft) &&
    /kyc_review_is_operator_only/.test(kyc) &&
    /column:\s*'reviewed_by'/.test(kyc)
  );
}

export function riskComplianceDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return RISK_COMPLIANCE_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function agentsRiskComplianceTrackerBackendDoneBarMet(): boolean {
  return (
    riskComplianceDoorsInRouterSource().length === RISK_COMPLIANCE_MOUNTED_DOORS.length &&
    riskComplianceDraftHonestInSource() &&
    riskComplianceDoneBarTestsPresent()
  );
}

export function agentsRiskComplianceMountVsTrackerBoardCard(): {
  readonly tracker: typeof RISK_COMPLIANCE_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = riskComplianceDoorsInRouterSource();
  return {
    tracker: RISK_COMPLIANCE_TRACKER_ID,
    doors: RISK_COMPLIANCE_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: RISK_COMPLIANCE_HONEST_GAPS.length,
    backendDoneBarMet: agentsRiskComplianceTrackerBackendDoneBarMet(),
  };
}
