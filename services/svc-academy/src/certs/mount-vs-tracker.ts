/**
 * D26-P1-C1 — academy.certs mount vs tracker honest gaps.
 *
 * Cert → XP → identity perks or refuse invent perk money. Multi-svc perk law Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CERTS_TRACKER_ID = 'academy.certs' as const;

export const CERT_MOUNTED_DOORS = ['grantCert', 'certPerkPlane', 'certPerkIntent', 'certXpPlane'] as const;

export const CERT_DONE_BAR_TEST_FILES = [
  'perk-plane.test.ts',
  'grant-ledger.test.ts',
  'xp-publish.test.ts',
  'perk-money-isolation.test.ts',
] as const;

export const CERT_HONEST_GAPS = ['gap.multi_svc_perk_product_law', 'gap.full_title_real_perks_residual'] as const;

export function certDoorsInRouterSource(): readonly (typeof CERT_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const block = src.slice(src.search(/^\s{4}certDefinitions:/m));
  return CERT_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function certPerkPlaneHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'perk-plane.ts'), 'utf8');
  return /CERT_PERK_REFUSE_CODE/.test(src) && /academyMapsCertToPerk:\s*false/.test(src) && /CertPerkInventKind/.test(src);
}

export function certDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return CERT_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function academyCertsTrackerBackendDoneBarMet(): boolean {
  return certDoorsInRouterSource().length === CERT_MOUNTED_DOORS.length && certPerkPlaneHonestInSource() && certDoneBarTestsPresent();
}

export function academyCertsMountVsTrackerBoardCard(): {
  readonly tracker: typeof CERTS_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = certDoorsInRouterSource();
  return {
    tracker: CERTS_TRACKER_ID,
    doors: CERT_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: CERT_HONEST_GAPS.length,
    backendDoneBarMet: academyCertsTrackerBackendDoneBarMet(),
  };
}
