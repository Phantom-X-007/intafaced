/**
 * D26-P1-S1 — protocol.smart-accounts mount vs tracker honest gaps.
 *
 * Passkey smart accounts + session keys mounted with typed chain refusals.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SMART_ACCOUNTS_TRACKER_ID = 'protocol.smart-accounts' as const;

export const SMART_ACCOUNTS_MOUNTED_DOORS = [
  'auditStatus',
  'predictAddress',
  'buildDeployment',
  'buildSessionGrant',
  'relayUserOperation',
  'myAccounts',
  'claimAccount',
] as const;

export const SMART_ACCOUNTS_DONE_BAR_TEST_FILES = [
  'router.mount.test.ts',
  'chain/bundler-policy.test.ts',
  'chain/paymaster-policy.test.ts',
] as const;

export const SMART_ACCOUNTS_HONEST_GAPS = ['gap.paymaster_funding_class_x', 'gap.public_deployment_registry_nitro'] as const;

export function smartAccountsDoorsInRouterSource(): readonly (typeof SMART_ACCOUNTS_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}health:\s*publicProcedure/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}amm:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return SMART_ACCOUNTS_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function smartAccountsPackageHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'audit', 'pipeline.ts'), 'utf8');
  return /loadInternalSmartAccountsPackage/.test(src);
}

export function smartAccountsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return SMART_ACCOUNTS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function smartAccountsPolicySurfacePresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, 'chain', 'policy-surface.ts'));
}

export function protocolSmartAccountsTrackerBackendDoneBarMet(): boolean {
  return (
    smartAccountsDoorsInRouterSource().length === SMART_ACCOUNTS_MOUNTED_DOORS.length &&
    smartAccountsPackageHonestInSource() &&
    smartAccountsDoneBarTestsPresent() &&
    smartAccountsPolicySurfacePresent()
  );
}

export function protocolSmartAccountsMountVsTrackerBoardCard(): {
  readonly tracker: typeof SMART_ACCOUNTS_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = smartAccountsDoorsInRouterSource();
  return {
    tracker: SMART_ACCOUNTS_TRACKER_ID,
    doors: SMART_ACCOUNTS_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: SMART_ACCOUNTS_HONEST_GAPS.length,
    backendDoneBarMet: protocolSmartAccountsTrackerBackendDoneBarMet(),
  };
}
