/**
 * D26-P1-P2 — ops.portfolio mount vs tracker honest gaps.
 *
 * Stage-1 custodial ledger view mounted; indexer positions composite unwired.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OPS_PORTFOLIO_TRACKER_ID = 'ops.portfolio' as const;

export const PORTFOLIO_LEDGER_DOORS = ['portfolio'] as const;

export const PORTFOLIO_DONE_BAR_TEST_FILES = ['portfolio-view.test.ts'] as const;

export const PORTFOLIO_HONEST_GAPS = ['gap.indexer_positions_unwired', 'gap.house_half_class_x'] as const;

export function portfolioDoorInLedgerRouterSource(): boolean {
  const routerPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'services', 'svc-ledger', 'src', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  return /\bportfolio:\s*scopedProcedure/.test(src) && /portfolioViewFromLedgerBalances/.test(src);
}

export function portfolioViewHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'portfolio-view.ts'), 'utf8');
  return /PORTFOLIO_INDEXER_UNWIRED/.test(src) && /portfolioViewFromLedgerBalances/.test(src) && /indexer:\s*INDEXER_ABSENT/.test(src);
}

export function portfolioS2sDoorPresent(): boolean {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'services', 'svc-ledger', 'src', 's2s-http.ts');
  const src = readFileSync(path, 'utf8');
  return /\/trpc\/portfolio/.test(src) && /portfolioViewFromLedgerBalances/.test(src);
}

export function portfolioDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return PORTFOLIO_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function opsPortfolioTrackerBackendDoneBarMet(): boolean {
  return (
    portfolioDoorInLedgerRouterSource() && portfolioViewHonestInSource() && portfolioS2sDoorPresent() && portfolioDoneBarTestsPresent()
  );
}

export function opsPortfolioMountVsTrackerBoardCard(): {
  readonly tracker: typeof OPS_PORTFOLIO_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  return {
    tracker: OPS_PORTFOLIO_TRACKER_ID,
    doors: PORTFOLIO_LEDGER_DOORS.length,
    doorsMounted: portfolioDoorInLedgerRouterSource() ? PORTFOLIO_LEDGER_DOORS.length : 0,
    gaps: PORTFOLIO_HONEST_GAPS.length,
    backendDoneBarMet: opsPortfolioTrackerBackendDoneBarMet(),
  };
}
