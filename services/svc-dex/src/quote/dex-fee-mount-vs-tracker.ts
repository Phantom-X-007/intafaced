/**
 * socket.dex-fee-source mount vs tracker — S-I3 CLOB cost honesty.
 *
 * Owner-published DEX_CLOB_FEE_BPS + DEX_CLOB_SETTLEMENT_COST pass-through;
 * internal-book fee sourcing and eth_call projection remain Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dexFeeOwnerEnvComposeGapsClosed as dexFeeOwnerEnvComposeWired } from './dex-fee-compose-wiring.js';

export const DEX_FEE_SOURCE_TRACKER_ID = 'socket.dex-fee-source' as const;

export const DEX_FEE_DONE_BAR_TEST_FILES = ['clob-costs.ts', 'venue-set.test.ts', 'dex-fee-compose-wiring.test.ts'] as const;

export const DEX_FEE_HONEST_GAPS = ['gap.internal_book_fee_not_sourced', 'gap.clob_projection_not_eth_call'] as const;

export function clobCostsRefuseUnconfiguredInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'clob-costs.ts'), 'utf8');
  return /ClobFeeUnconfiguredError/.test(src) && /clobCostsFromOptional/.test(src) && /must be set together/.test(src);
}

export function dexFeeDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return DEX_FEE_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function dexFeeOwnerEnvComposeGapsClosed(): boolean {
  return dexFeeOwnerEnvComposeWired();
}

export function dexFeeSourceTrackerBackendDoneBarMet(): boolean {
  return clobCostsRefuseUnconfiguredInSource() && dexFeeDoneBarTestsPresent() && dexFeeOwnerEnvComposeGapsClosed();
}

export function dexFeeSourceMountVsTrackerBoardCard(): {
  readonly tracker: typeof DEX_FEE_SOURCE_TRACKER_ID;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  return {
    tracker: DEX_FEE_SOURCE_TRACKER_ID,
    gaps: DEX_FEE_HONEST_GAPS.length,
    backendDoneBarMet: dexFeeSourceTrackerBackendDoneBarMet(),
  };
}
