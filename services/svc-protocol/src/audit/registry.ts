/**
 * S-J1 / S-J2 — full protocol audit registry.
 *
 * Serves internal packages, optional external claims (Nitro-paid firm reports),
 * and live suite `sourceHash` fingerprints for every pinned compile suite.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { collectSources, computeSourceHash, SUITES, suiteSources } from '../../scripts/contract-sources.mjs';
import {
  evaluatePackage,
  INTERNAL_SMART_ACCOUNTS,
  type AuditRecord,
  type PackageClaim,
} from './pipeline.js';

export type SuiteFingerprint = {
  readonly suite: string;
  readonly sourceHash: `0x${string}`;
  readonly sourceFiles: readonly string[];
};

/** Internal catalog of every compile suite — hashes served live, not frozen in markdown. */
export const SUITE_REGISTRY_PACKAGE: PackageClaim = {
  id: 'protocol-suite-registry',
  packagePath: 'docs/audits/protocol-suite-registry-2026-09-03.md',
  kind: 'internal',
  signedBy: 'shehzad002',
  signedAt: '2026-09-03T00:00:00.000Z',
};

const INTERNAL_PACKAGE_CLAIMS: readonly PackageClaim[] = [INTERNAL_SMART_ACCOUNTS, SUITE_REGISTRY_PACKAGE];

const ExternalClaimSchema = z.object({
  id: z.string().min(1),
  packagePath: z.string().min(1),
  kind: z.literal('external'),
  signedBy: z.string().min(1),
  signedAt: z.string().min(1),
  expectedHash: z.string().regex(/^0x[0-9a-f]{64}$/),
});

const ExternalClaimsFileSchema = z.object({
  claims: z.array(ExternalClaimSchema),
});

function repoRootFromThisFile(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../..');
}

export function computeSuiteFingerprints(): SuiteFingerprint[] {
  const all = collectSources();
  return SUITES.map((suite) => ({
    suite: suite.name,
    sourceHash: computeSourceHash(suiteSources(suite, all)),
    sourceFiles: [...suite.sources].sort(),
  }));
}

function loadPackageRecord(root: string, claim: PackageClaim): AuditRecord {
  const contents = readFileSync(join(root, claim.packagePath), 'utf8');
  return evaluatePackage(claim, contents);
}

export function loadInternalPackageRecords(root: string = repoRootFromThisFile()): AuditRecord[] {
  return INTERNAL_PACKAGE_CLAIMS.map((claim) => loadPackageRecord(root, claim));
}

export function loadExternalPackageRecords(root: string = repoRootFromThisFile()): AuditRecord[] {
  const claimsPath = join(root, 'docs/audits/external-claims.json');
  if (!existsSync(claimsPath)) return [];
  const parsed = ExternalClaimsFileSchema.parse(JSON.parse(readFileSync(claimsPath, 'utf8')));
  return parsed.claims.map((claim) => loadPackageRecord(root, claim));
}

export type AuditRegistry = {
  readonly packages: readonly AuditRecord[];
  readonly suites: readonly SuiteFingerprint[];
  readonly auditedCount: number;
  readonly packageCount: number;
  readonly suiteCount: number;
  readonly anyAudited: boolean;
};

export function loadAuditRegistry(root: string = repoRootFromThisFile()): AuditRegistry {
  const packages = [...loadInternalPackageRecords(root), ...loadExternalPackageRecords(root)];
  const auditedCount = packages.filter((record) => record.audited).length;
  const suites = computeSuiteFingerprints();
  return {
    packages,
    suites,
    auditedCount,
    packageCount: packages.length,
    suiteCount: suites.length,
    anyAudited: auditedCount > 0,
  };
}
