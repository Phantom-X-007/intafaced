/**
 * D73-P2 — execution.sor mount vs tracker honest gaps.
 *
 * OMS plan/execute/cancel/fetch doors on svc-execution; fleet EMS + operator cred +
 * letter→bps owner schedule env wired in compose.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executionEmsStoreComposeWired,
  executionLetterBpsScheduleComposeWired,
  executionVenueOperatorCredComposeWired,
} from './execution-compose-wiring.js';
import { describeExecutionSpine } from './oms-spine.js';

export const EXECUTION_SOR_TRACKER_ID = 'execution.sor' as const;

export const EXECUTION_SOR_OMS_DOORS = ['plan', 'execute', 'cancel', 'fetch'] as const;

export type ExecutionSorOmsDoor = (typeof EXECUTION_SOR_OMS_DOORS)[number];

export const EXECUTION_SOR_DONE_BAR_TEST_FILES = [
  'oms-spine.test.ts',
  'oms-plan.test.ts',
  'oms-execute.test.ts',
  'oms-cancel.test.ts',
  'oms-fetch.test.ts',
  'router.mount.test.ts',
  'execution-ready-cred-board.test.ts',
  'execution-policy-route.test.ts',
  'letter-to-bps-schedule.test.ts',
  'sor-tracker-status-pin.test.ts',
  'sor-unknown-venue-pin.test.ts',
  'mount-vs-tracker.test.ts',
] as const;

export const EXECUTION_SOR_HONEST_GAPS = [] as const;

export function executionSorComposeGapsClosed(): boolean {
  return executionEmsStoreComposeWired() && executionVenueOperatorCredComposeWired() && executionLetterBpsScheduleComposeWired();
}

export function sorOmsDoorsInRouterSource(): readonly ExecutionSorOmsDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  const start = src.search(/^\s{6}oms:\s*router\(\{/m);
  if (start === -1) return [];
  const rest = src.slice(start);
  const next = rest.slice(1).search(/^\s{6}[a-zA-Z]+:\s*/m);
  const block = next === -1 ? rest : rest.slice(0, 1 + next);
  return EXECUTION_SOR_OMS_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function executionSorDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return EXECUTION_SOR_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function executionSorPolicyHonest(): boolean {
  const spine = describeExecutionSpine();
  const sorDoors = spine.doors.filter((d) => d.module === 'execution.sor');
  return (
    spine.sorUsesVenueAdapterPlanRoute === true &&
    spine.externalOnly === true &&
    spine.houseInternalRefuse === true &&
    sorDoors.length >= 2 &&
    sorDoors.every((d) => d.inventsQuotes === false)
  );
}

export function executionSorBootHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'index.ts'), 'utf8');
  return (
    /createExecutionRouter\(/.test(src) &&
    /FileEmsOrderStore/.test(src) &&
    /InMemoryEmsOrderStore/.test(src) &&
    /buildExecutionVenueTradeMapsWithOperatorSupplement/.test(src) &&
    /emsStore/.test(src)
  );
}

export function executionSorVenueAdapterPolicyInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const planSrc = readFileSync(join(here, 'oms-plan.ts'), 'utf8');
  const routerSrc = readFileSync(join(here, 'router.ts'), 'utf8');
  return (
    /\bplanRoute\b/.test(planSrc) &&
    /\bbuildExecutionReport\b/.test(planSrc) &&
    /planOmsRoute/.test(routerSrc) &&
    /executeOmsRoute/.test(routerSrc) &&
    /cancelOmsOrder/.test(routerSrc) &&
    /fetchOmsOrder/.test(routerSrc)
  );
}

export function executionSorTrackerBackendDoneBarMet(): boolean {
  return (
    sorOmsDoorsInRouterSource().length === EXECUTION_SOR_OMS_DOORS.length &&
    executionSorDoneBarTestsPresent() &&
    executionSorPolicyHonest() &&
    executionSorBootHonestInSource() &&
    executionSorVenueAdapterPolicyInSource()
  );
}

export function executionSorMountVsTrackerBoardCard(): {
  readonly tracker: typeof EXECUTION_SOR_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly mountComplete: boolean;
} {
  const mounted = sorOmsDoorsInRouterSource();
  return {
    tracker: EXECUTION_SOR_TRACKER_ID,
    doors: EXECUTION_SOR_OMS_DOORS.length,
    doorsMounted: mounted.length,
    gaps: EXECUTION_SOR_HONEST_GAPS.length,
    backendDoneBarMet: executionSorTrackerBackendDoneBarMet(),
    mountComplete: mounted.length === EXECUTION_SOR_OMS_DOORS.length,
  };
}
