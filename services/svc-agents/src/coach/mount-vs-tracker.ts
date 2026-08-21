/**
 * D26-P1-CH1 — agents.coach mount vs tracker honest gaps.
 *
 * Curriculum-grounded citations only — never advice or positions.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COACH_TRACKER_ID = 'agents.coach' as const;

export const COACH_MOUNTED_DOORS = ['session'] as const;

export const COACH_DONE_BAR_TEST_FILES = ['grounded-session.test.ts', 'coach-route.test.ts'] as const;

export const COACH_HONEST_GAPS = ['gap.licensed_library_import', 'gap.positions_not_decided'] as const;

export function coachDoorsInRouterSource(): readonly (typeof COACH_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}coach:\s*router\(\{/m);
  if (start === -1) return [];
  const block = src.slice(start);
  return COACH_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function coachSessionHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'grounded-session.ts'), 'utf8');
  return (
    /not_advice/.test(src) &&
    /positionsReferenced:\s*false/.test(src) &&
    /advice_forbidden/.test(src) &&
    /licensedLibraryImported/.test(src)
  );
}

export function coachDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return COACH_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function agentsCoachTrackerBackendDoneBarMet(): boolean {
  return coachDoorsInRouterSource().length === COACH_MOUNTED_DOORS.length && coachSessionHonestInSource() && coachDoneBarTestsPresent();
}

export function agentsCoachMountVsTrackerBoardCard(): {
  readonly tracker: typeof COACH_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = coachDoorsInRouterSource();
  return {
    tracker: COACH_TRACKER_ID,
    doors: COACH_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: COACH_HONEST_GAPS.length,
    backendDoneBarMet: agentsCoachTrackerBackendDoneBarMet(),
  };
}
