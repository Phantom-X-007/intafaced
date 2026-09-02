import { describe, expect, it } from 'vitest';
import { SUITES } from '../../scripts/contract-sources.mjs';
import { evaluatePackage, hashPackageContents } from './pipeline.js';
import { computeSuiteFingerprints, loadAuditRegistry, loadInternalPackageRecords, SUITE_REGISTRY_PACKAGE } from './registry.js';

describe('S-J1 / S-J2 protocol audit registry', () => {
  it('fingerprints every pinned compile suite with a stable sourceHash', () => {
    const suites = computeSuiteFingerprints();
    expect(suites.length).toBe(SUITES.length);
    for (const row of suites) {
      expect(row.sourceHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(row.sourceFiles.length).toBeGreaterThan(0);
    }
    const names = suites.map((row) => row.suite).sort();
    expect(names).toEqual(SUITES.map((suite) => suite.name).sort());
  });

  it('loads internal packages: smart accounts + suite registry, none audited', () => {
    const records = loadInternalPackageRecords();
    expect(records.length).toBe(2);
    for (const record of records) {
      expect(record.kind).toBe('internal');
      expect(record.audited).toBe(false);
      expect(record.artifactHash).toMatch(/^0x[0-9a-f]{64}$/);
    }
    expect(records.map((record) => record.id).sort()).toEqual(['protocol-smart-accounts', 'protocol-suite-registry']);
  });

  it('suite registry package evaluates with signer and without audited:true', () => {
    const registry = loadAuditRegistry();
    const suitePackage = registry.packages.find((record) => record.id === SUITE_REGISTRY_PACKAGE.id);
    expect(suitePackage).toBeDefined();
    expect(suitePackage!.packagePath).toBe(SUITE_REGISTRY_PACKAGE.packagePath);
    expect(suitePackage!.signedBy).toBe('shehzad002');
    expect(suitePackage!.audited).toBe(false);
  });

  it('empty external-claims.json keeps auditedCount at zero', () => {
    const registry = loadAuditRegistry();
    expect(registry.packageCount).toBe(2);
    expect(registry.suiteCount).toBe(SUITES.length);
    expect(registry.auditedCount).toBe(0);
    expect(registry.anyAudited).toBe(false);
    expect(registry.packages.every((record) => record.audited === false)).toBe(true);
  });

  it('refuses audited:true when external claim hash does not match report bytes', () => {
    const record = evaluatePackage(
      {
        id: 'fixture-tampered',
        packagePath: 'memory:fixture',
        kind: 'external',
        signedBy: 'example-firm',
        signedAt: '2026-01-01T00:00:00.000Z',
        expectedHash: hashPackageContents('expected body'),
      },
      'wrong body',
    );
    expect(record.audited).toBe(false);
    expect(record.kind).toBe('none');
  });
});
