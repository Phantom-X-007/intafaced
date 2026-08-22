/**
 * S-L5 — launch.treasury-yield mount vs tracker honest gaps.
 *
 * TreasuryYieldVault contract half: immutable licenceHash, LicenceUnset refuse.
 * Licence content + external audit remain Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TREASURY_YIELD_TRACKER_ID = 'launch.treasury-yield' as const;

export const TREASURY_YIELD_CONTRACT_PATH = 'contracts/vaults/TreasuryYieldVault.sol' as const;

export const TREASURY_YIELD_DONE_BAR_TEST_FILES = ['treasury-yield-honesty.test.ts', 'treasury-yield-mount-vs-tracker.test.ts'] as const;

export const TREASURY_YIELD_HONEST_GAPS = ['gap.licence_content_class_x', 'gap.contract_unaudited'] as const;

export function treasuryYieldVaultContractPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, '..', '..', TREASURY_YIELD_CONTRACT_PATH));
}

export function treasuryYieldLicenceRefuseInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', '..', TREASURY_YIELD_CONTRACT_PATH), 'utf8');
  return /bytes32 public immutable licenceHash/.test(src) && /revert LicenceUnset/.test(src) && !/function\s+setLicence/.test(src);
}

export function treasuryYieldDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return TREASURY_YIELD_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function launchTreasuryYieldTrackerBackendDoneBarMet(): boolean {
  return treasuryYieldVaultContractPresent() && treasuryYieldLicenceRefuseInSource() && treasuryYieldDoneBarTestsPresent();
}

export function launchTreasuryYieldMountVsTrackerBoardCard(): {
  readonly tracker: typeof TREASURY_YIELD_TRACKER_ID;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  return {
    tracker: TREASURY_YIELD_TRACKER_ID,
    gaps: TREASURY_YIELD_HONEST_GAPS.length,
    backendDoneBarMet: launchTreasuryYieldTrackerBackendDoneBarMet(),
  };
}
