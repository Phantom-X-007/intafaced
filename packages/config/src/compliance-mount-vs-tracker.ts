/**
 * D26-P1-O1M — ops.compliance mount vs tracker honest gaps.
 *
 * Screening mechanism + queue disposition — list content and partner UI Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPLIANCE_TRACKER_ID = 'ops.compliance' as const;

export const COMPLIANCE_PRODUCT_SYMBOLS = [
  'envScreeningList',
  'assertScreeningConfigured',
  'applyComplianceQueueDisposition',
  'SCREENING_REFUSE_UNCONFIGURED',
] as const;

export const COMPLIANCE_DONE_BAR_TEST_FILES = [
  'screening.test.ts',
  'jurisdiction.test.ts',
  'compliance-queue.test.ts',
  'compliance-mount-vs-tracker.test.ts',
] as const;

export const COMPLIANCE_HONEST_GAPS = ['gap.sanctions_list_content_counsel', 'gap.vpn_geo_ip_partner', 'gap.case_management_ui'] as const;

export function complianceSymbolsInSource(): readonly (typeof COMPLIANCE_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const screening = readFileSync(join(here, 'screening.ts'), 'utf8');
  const jurisdiction = readFileSync(join(here, 'jurisdiction.ts'), 'utf8');
  const queue = readFileSync(join(here, 'compliance-queue.ts'), 'utf8');
  const blob = [screening, jurisdiction, queue].join('\n');
  return COMPLIANCE_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function complianceMechanismHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const screening = readFileSync(join(here, 'screening.ts'), 'utf8');
  const queue = readFileSync(join(here, 'compliance-queue.ts'), 'utf8');
  return (
    /SHIPPED_SCREENING_REGIONS:\s*readonly\s*ScreenedRegion\[\]\s*=\s*\[\]/.test(screening) &&
    /SCREENING_REFUSE_UNCONFIGURED/.test(screening) &&
    /partner_cleared/.test(queue) &&
    /partnerConfigured/.test(queue)
  );
}

export function complianceDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return COMPLIANCE_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function opsComplianceTrackerBackendDoneBarMet(): boolean {
  return (
    complianceSymbolsInSource().length === COMPLIANCE_PRODUCT_SYMBOLS.length &&
    complianceMechanismHonestInSource() &&
    complianceDoneBarTestsPresent()
  );
}

export function opsComplianceMountVsTrackerBoardCard(): {
  readonly tracker: typeof COMPLIANCE_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = complianceSymbolsInSource();
  return {
    tracker: COMPLIANCE_TRACKER_ID,
    symbols: COMPLIANCE_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: COMPLIANCE_HONEST_GAPS.length,
    backendDoneBarMet: opsComplianceTrackerBackendDoneBarMet(),
  };
}
