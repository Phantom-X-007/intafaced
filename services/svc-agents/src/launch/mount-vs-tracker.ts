/**
 * D26-P1-LA1 — agents.launch mount vs tracker honest gaps.
 *
 * Pre-listing pattern flags annotate only — never a clean badge or block decision.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAUNCH_AGENT_TRACKER_ID = 'agents.launch' as const;

export const LAUNCH_MOUNTED_DOORS = ['assess'] as const;

export const LAUNCH_DONE_BAR_TEST_FILES = ['pre-listing-assess.test.ts', 'launch-route.test.ts'] as const;

export const LAUNCH_HONEST_GAPS = ['gap.live_reputation_port', 'gap.block_vs_annotate_owner'] as const;

export function launchDoorsInRouterSource(): readonly (typeof LAUNCH_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}launch:\s*router\(\{/m);
  if (start === -1) return [];
  const block = src.slice(start);
  return LAUNCH_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function launchAssessHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'pre-listing-assess.ts'), 'utf8');
  return (
    /history_absent/.test(src) && /inventedCleanBadge:\s*false/.test(src) && /not_a_badge/.test(src) && /block_decision_forbidden/.test(src)
  );
}

export function launchDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return LAUNCH_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function agentsLaunchTrackerBackendDoneBarMet(): boolean {
  return launchDoorsInRouterSource().length === LAUNCH_MOUNTED_DOORS.length && launchAssessHonestInSource() && launchDoneBarTestsPresent();
}

export function agentsLaunchMountVsTrackerBoardCard(): {
  readonly tracker: typeof LAUNCH_AGENT_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = launchDoorsInRouterSource();
  return {
    tracker: LAUNCH_AGENT_TRACKER_ID,
    doors: LAUNCH_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: LAUNCH_HONEST_GAPS.length,
    backendDoneBarMet: agentsLaunchTrackerBackendDoneBarMet(),
  };
}
