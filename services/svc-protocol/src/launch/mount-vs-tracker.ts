/**
 * D26-P1-L1 — launch.token-factory mount vs tracker honest gaps.
 *
 * ERC-20 deploy from internal template: predict, build calldata, on-chain proof.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKEN_FACTORY_TRACKER_ID = 'launch.token-factory' as const;

export const TOKEN_FACTORY_MOUNTED_DOORS = ['status', 'predictTokenAddress', 'buildTokenDeployment', 'tokenInfo'] as const;

export const TOKEN_FACTORY_DONE_BAR_TEST_FILES = ['token-factory-onchain.test.ts', 'router-launch-live.test.ts', 'params.test.ts'] as const;

export const TOKEN_FACTORY_HONEST_GAPS = ['gap.template_not_audited', 'gap.live_factory_nitro_rpc'] as const;

export function tokenFactoryDoorsInRouterSource(): readonly (typeof TOKEN_FACTORY_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}launch:\s*router\(\{/m);
  if (start === -1) return [];
  const block = src.slice(start);
  return TOKEN_FACTORY_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function tokenFactoryBuildHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'build.ts'), 'utf8');
  return /buildCreateToken/.test(src) && /value: 0n/.test(src);
}

export function tokenFactoryDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return TOKEN_FACTORY_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function launchTokenFactoryTrackerBackendDoneBarMet(): boolean {
  return (
    tokenFactoryDoorsInRouterSource().length === TOKEN_FACTORY_MOUNTED_DOORS.length &&
    tokenFactoryBuildHonestInSource() &&
    tokenFactoryDoneBarTestsPresent()
  );
}

export function launchTokenFactoryMountVsTrackerBoardCard(): {
  readonly tracker: typeof TOKEN_FACTORY_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = tokenFactoryDoorsInRouterSource();
  return {
    tracker: TOKEN_FACTORY_TRACKER_ID,
    doors: TOKEN_FACTORY_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: TOKEN_FACTORY_HONEST_GAPS.length,
    backendDoneBarMet: launchTokenFactoryTrackerBackendDoneBarMet(),
  };
}
