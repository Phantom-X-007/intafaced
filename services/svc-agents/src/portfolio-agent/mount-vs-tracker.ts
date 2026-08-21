/**
 * D26-P1-PF1 — agents.portfolio mount vs tracker honest gaps.
 *
 * Plan-only rebalance inside guardrails; execution and cross-plane Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PORTFOLIO_AGENT_TRACKER_ID = 'agents.portfolio' as const;

export const PORTFOLIO_MOUNTED_DOORS = ['plan'] as const;

export const PORTFOLIO_DONE_BAR_TEST_FILES = ['plan.test.ts'] as const;

export const PORTFOLIO_HONEST_GAPS = ['gap.execution_not_in_slice', 'gap.cross_plane_bridge_owner'] as const;

export function portfolioDoorsInRouterSource(): readonly (typeof PORTFOLIO_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}portfolio:\s*router\(\{/m);
  if (start === -1) return [];
  const block = src.slice(start);
  return PORTFOLIO_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function portfolioPlanHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'plan.ts'), 'utf8');
  return /plan-only rebalance/i.test(src) && /portfolio\.port_dark/.test(src) && /cross_plane_blocked/.test(src);
}

export function portfolioDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return PORTFOLIO_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function agentsPortfolioTrackerBackendDoneBarMet(): boolean {
  return (
    portfolioDoorsInRouterSource().length === PORTFOLIO_MOUNTED_DOORS.length &&
    portfolioPlanHonestInSource() &&
    portfolioDoneBarTestsPresent()
  );
}

export function agentsPortfolioMountVsTrackerBoardCard(): {
  readonly tracker: typeof PORTFOLIO_AGENT_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = portfolioDoorsInRouterSource();
  return {
    tracker: PORTFOLIO_AGENT_TRACKER_ID,
    doors: PORTFOLIO_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: PORTFOLIO_HONEST_GAPS.length,
    backendDoneBarMet: agentsPortfolioTrackerBackendDoneBarMet(),
  };
}
