/**
 * D26-P1-X3 — execution.sor mount vs tracker honest gaps.
 *
 * Backend product-complete: one ranking rule, SOR cost model, execution reports.
 * OMS/EMS svc scaffold and owner letter→bps schedule are Class X residuals.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXECUTION_SOR_TRACKER_ID = 'execution.sor' as const;

export const EXECUTION_SOR_BLOCKER_TRACKER_ID = 'venue.aggregation' as const;

export const SOR_PRODUCT_EXPORTS = ['planRoute', 'scoreSorCost', 'buildExecutionReport', 'describeSorRoutingPolicy'] as const;

export type SorProductExport = (typeof SOR_PRODUCT_EXPORTS)[number];

export const SOR_HONEST_GAPS = ['gap.no_oms_ems_scaffold', 'gap.letter_to_bps_owner_schedule', 'gap.no_svc_execution_mount'] as const;

export function sorExportsInPackageSource(): readonly SorProductExport[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
  const routerSrc = readFileSync(join(here, 'router.ts'), 'utf8');
  const costSrc = readFileSync(join(here, 'cost-model.ts'), 'utf8');
  const reportSrc = readFileSync(join(here, 'execution-report.ts'), 'utf8');
  const policySrc = readFileSync(join(here, 'sor-policy.ts'), 'utf8');
  const blob = [indexSrc, routerSrc, costSrc, reportSrc, policySrc].join('\n');
  return SOR_PRODUCT_EXPORTS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function sorDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return (
    existsSync(join(here, 'sor-policy.test.ts')) &&
    existsSync(join(here, 'sor-cost-refuse-pin.test.ts')) &&
    existsSync(join(here, 'execution-report.test.ts'))
  );
}

export function executionSorTrackerBackendDoneBarMet(): boolean {
  return sorExportsInPackageSource().length === SOR_PRODUCT_EXPORTS.length && sorDoneBarTestsPresent();
}

export function executionSorMountVsTrackerBoardCard(): {
  readonly tracker: typeof EXECUTION_SOR_TRACKER_ID;
  readonly blocker: typeof EXECUTION_SOR_BLOCKER_TRACKER_ID;
  readonly exports: number;
  readonly exportsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = sorExportsInPackageSource();
  return {
    tracker: EXECUTION_SOR_TRACKER_ID,
    blocker: EXECUTION_SOR_BLOCKER_TRACKER_ID,
    exports: SOR_PRODUCT_EXPORTS.length,
    exportsPresent: present.length,
    gaps: SOR_HONEST_GAPS.length,
    backendDoneBarMet: executionSorTrackerBackendDoneBarMet(),
  };
}
