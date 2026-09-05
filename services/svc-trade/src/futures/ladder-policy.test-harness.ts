/**
 * Test-only ladder numbers. Not owner D3. Not imported by production modules.
 *
 * Live jobs omit `ladderPolicy` until DIRECTION §8 names the table
 * (`skipped_d3_unset`). These values exist so mechanism tests have a coherent
 * policy object. They are deliberately coarse so nobody reads them as a
 * calibrated risk opinion.
 */
import { parseAmount as amt } from '@intafaced/ledger-client';
import type { FuturesLadderPolicy } from './maintenance-ladder.js';
import type { LiquidationLadderDeps } from './liquidation-tick.js';

export const DEFAULT_FUTURES_LADDER_POLICY: FuturesLadderPolicy = {
  tiers: [
    { uptoDepthBps: 500, maintenanceBps: 50 },
    { uptoDepthBps: 2_000, maintenanceBps: 100 },
    { uptoDepthBps: 5_000, maintenanceBps: 250 },
    { uptoDepthBps: Number.MAX_SAFE_INTEGER, maintenanceBps: 500 },
  ],
  marginCallBps: 12_000,
  targetBps: 15_000,
  maxTrancheBps: 2_500,
};

/** Deep book + full-close tranche so bankrupt ticks still seize without flattening. */
export function deepFullCloseLadder(overrides: Partial<LiquidationLadderDeps> = {}): LiquidationLadderDeps {
  return {
    depth: {
      async depthNotional() {
        return amt('1000000');
      },
    },
    reducer: {
      async reduce() {
        throw new Error('unexpected partial reduce — test ladder maxTranche is full close');
      },
    },
    policy: { ...DEFAULT_FUTURES_LADDER_POLICY, maxTrancheBps: 10_000 },
    ...overrides,
  };
}
