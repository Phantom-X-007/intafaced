/**
 * S-G4 — launch.rwa mount vs tracker honest gaps.
 *
 * RwaRegistry contract half: immutable licenceHash, LicenceUnset refuse.
 * Licence content + external audit remain Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RWA_TRACKER_ID = 'launch.rwa' as const;

export const RWA_CONTRACT_PATH = 'contracts/rwa/RwaRegistry.sol' as const;

export const RWA_DONE_BAR_TEST_FILES = ['rwa-registry-honesty.test.ts', 'rwa-mount-vs-tracker.test.ts'] as const;

export const RWA_FORGE_TEST = 'test/forge/RwaRegistry.t.sol' as const;

export const RWA_HONEST_GAPS = ['gap.licence_content_class_x', 'gap.contract_unaudited'] as const;

export function rwaRegistryContractPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, '..', '..', RWA_CONTRACT_PATH));
}

export function rwaRegistryLicenceRefuseInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', '..', RWA_CONTRACT_PATH), 'utf8');
  return /bytes32 public immutable licenceHash/.test(src) && /revert LicenceUnset/.test(src) && !/function\s+setLicence/.test(src);
}

export function rwaDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return RWA_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function rwaForgeTestPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, '..', '..', RWA_FORGE_TEST));
}

export function launchRwaTrackerBackendDoneBarMet(): boolean {
  return rwaRegistryContractPresent() && rwaRegistryLicenceRefuseInSource() && rwaDoneBarTestsPresent() && rwaForgeTestPresent();
}

export function launchRwaMountVsTrackerBoardCard(): {
  readonly tracker: typeof RWA_TRACKER_ID;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  return {
    tracker: RWA_TRACKER_ID,
    gaps: RWA_HONEST_GAPS.length,
    backendDoneBarMet: launchRwaTrackerBackendDoneBarMet(),
  };
}
