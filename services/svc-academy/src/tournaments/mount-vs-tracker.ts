/**
 * D26-P1-C3 — academy.tournaments mount vs tracker honest gaps.
 *
 * Backend product-complete: Stage-1 ladder + season lifecycle + prize refuse-closed.
 * Class M IFC fund/payout recipes stay honest gaps until owner amounts + ledger.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOURNAMENTS_TRACKER_ID = 'academy.tournaments' as const;

export const TOURNAMENT_MOUNTED_DOORS = ['policy'] as const;

export const TOURNAMENT_LIFECYCLE_SYMBOLS = ['createSeason', 'setSeasonStatus', 'standings', 'freezeSnapshot'] as const;

export const TOURNAMENT_DONE_BAR_TEST_FILES = [
  'prize-refuse.test.ts',
  'tournament-policy.test.ts',
  'season-lifecycle.test.ts',
  'ladder.test.ts',
  'tournaments.policy-route.test.ts',
] as const;

export const TOURNAMENT_HONEST_GAPS = ['gap.class_m_prize_fund_recipes', 'gap.class_m_payout_recipes'] as const;

export function tournamentDoorsInRouterSource(): readonly (typeof TOURNAMENT_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}tournaments:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return TOURNAMENT_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function tournamentLifecycleOnRouter(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  return TOURNAMENT_LIFECYCLE_SYMBOLS.every((name) => new RegExp(`\\b${name}\\s*:`).test(src));
}

export function tournamentPolicyHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'tournament-policy.ts'), 'utf8');
  return (
    /movesMoney:\s*false/.test(src) &&
    /inventsPrizeBalances:\s*false/.test(src) &&
    /inventsIfcCredits:\s*false/.test(src) &&
    /prizePoolUnsetCode/.test(src)
  );
}

export function tournamentDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return TOURNAMENT_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function tournamentsTrackerBackendDoneBarMet(): boolean {
  return (
    tournamentDoorsInRouterSource().length === TOURNAMENT_MOUNTED_DOORS.length &&
    tournamentLifecycleOnRouter() &&
    tournamentPolicyHonestInSource() &&
    tournamentDoneBarTestsPresent()
  );
}

export function tournamentsMountVsTrackerBoardCard(): {
  readonly tracker: typeof TOURNAMENTS_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = tournamentDoorsInRouterSource();
  return {
    tracker: TOURNAMENTS_TRACKER_ID,
    doors: TOURNAMENT_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: TOURNAMENT_HONEST_GAPS.length,
    backendDoneBarMet: tournamentsTrackerBackendDoneBarMet(),
  };
}
