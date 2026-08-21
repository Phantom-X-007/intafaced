/**
 * D26-P1-A2 — Support agent mount vs tracker honest gaps.
 *
 * Backend product-complete: KB + account-state grounded; stoppable;
 * no invent balance. Live desk KB env is Class X (ops.support fleet URL).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supportAgentGuardrail } from './guardrail.js';

export const SUPPORT_TRACKER_ID = 'agents.support' as const;

export const SUPPORT_DESK_TRACKER_ID = 'ops.support' as const;

export const SUPPORT_MOUNTED_DOORS = ['policy', 'grounded', 'runSession'] as const;

export type SupportMountedDoor = (typeof SUPPORT_MOUNTED_DOORS)[number];

export const SUPPORT_HONEST_GAPS = ['gap.class_x_live_desk_kb_env', 'gap.no_shell_consumer'] as const;

export function supportDoorsInRouterSource(): readonly SupportMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}support:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return SUPPORT_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function supportMountMatrixComplete(): boolean {
  return supportDoorsInRouterSource().length === SUPPORT_MOUNTED_DOORS.length;
}

export function supportDeclaredTasksMatchGuardrail(): boolean {
  const tasks = supportAgentGuardrail().limits.allowedTasks;
  return tasks.includes('support.classify') && tasks.includes('support.reply');
}

/** Denon D26-P1-A2 backend done bar met when mount + guardrail tasks wired. */
export function supportTrackerBackendDoneBarMet(): boolean {
  return supportMountMatrixComplete() && supportDeclaredTasksMatchGuardrail();
}

export function supportMountVsTrackerBoardCard(): {
  readonly tracker: typeof SUPPORT_TRACKER_ID;
  readonly desk: typeof SUPPORT_DESK_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
  readonly mountComplete: boolean;
} {
  const mounted = supportDoorsInRouterSource();
  return {
    tracker: SUPPORT_TRACKER_ID,
    desk: SUPPORT_DESK_TRACKER_ID,
    doors: SUPPORT_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: SUPPORT_HONEST_GAPS.length,
    backendDoneBarMet: supportTrackerBackendDoneBarMet(),
    mountComplete: mounted.length === SUPPORT_MOUNTED_DOORS.length,
  };
}
