/**
 * D26-P1-A1 — Navigator mount vs tracker honest gaps.
 *
 * Backend product-complete: tool-calling inside guardrails; dark refuse bills zero.
 * Class X residual: owner-published fleet URLs + allowlisted live inputs in prod.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { navigatorAgentGuardrail } from './guardrail.js';

export const NAVIGATOR_TRACKER_ID = 'agents.navigator' as const;

export const NAVIGATOR_MOUNTED_DOORS = ['policy', 'grounded', 'runSession'] as const;

export type NavigatorMountedDoor = (typeof NAVIGATOR_MOUNTED_DOORS)[number];

export const NAVIGATOR_HONEST_GAPS = [
  'gap.class_x_live_trade_inputs',
  'gap.class_x_live_identity_session',
  'gap.no_shell_consumer',
] as const;

export type NavigatorHonestGapId = (typeof NAVIGATOR_HONEST_GAPS)[number];

export function navigatorDoorsInRouterSource(): readonly NavigatorMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}navigator:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return NAVIGATOR_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function navigatorMountMatrixComplete(): boolean {
  return navigatorDoorsInRouterSource().length === NAVIGATOR_MOUNTED_DOORS.length;
}

export function navigatorDeclaredTasksMatchGuardrail(): boolean {
  const tasks = navigatorAgentGuardrail().limits.allowedTasks;
  return tasks.includes('navigator.plan') && tasks.includes('navigator.tool_select');
}

/** Denon D26-P1-A1 backend done bar met when mount + guardrail tasks are wired. */
export function navigatorTrackerBackendDoneBarMet(): boolean {
  return navigatorMountMatrixComplete() && navigatorDeclaredTasksMatchGuardrail();
}

export function navigatorMountVsTrackerBoardCard(): {
  readonly tracker: typeof NAVIGATOR_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly mountComplete: boolean;
} {
  const mounted = navigatorDoorsInRouterSource();
  return {
    tracker: NAVIGATOR_TRACKER_ID,
    doors: NAVIGATOR_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: NAVIGATOR_HONEST_GAPS.length,
    backendDoneBarMet: navigatorTrackerBackendDoneBarMet(),
    mountComplete: mounted.length === NAVIGATOR_MOUNTED_DOORS.length,
  };
}
