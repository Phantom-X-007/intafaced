import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluatePackage, hashPackageContents } from './pipeline.js';
import {
  computeSuiteFingerprints,
  EXTERNAL_CLAIMS_PATH,
  loadAuditRegistry,
  loadExternalPackageRecords,
  loadInternalPackageRecords,
} from './registry.js';

describe('protocol audit registry (Q-proto intake)', () => {
  it('fingerprints every committed compile suite; does not invent EntryPoint', () => {
    const suites = computeSuiteFingerprints();
    const names = suites.map((row) => row.suite);
    expect(suites.length).toBeGreaterThan(15);
    expect(new Set(names).size).toBe(names.length);
    for (const row of suites) {
      expect(row.sourceHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(row.sourceFiles.length).toBeGreaterThan(0);
    }
    expect(names).toEqual(expect.arrayContaining(['accounts', 'amm', 'entrypoint']));
    const entry = suites.find((row) => row.suite === 'entrypoint');
    expect(entry?.sourceFiles).toEqual(['entrypoint/EntryPointGetUserOpHash.sol']);
  });

  it('loads the internal smart-accounts package and keeps audited false', () => {
    const records = loadInternalPackageRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe('protocol-smart-accounts');
    expect(records[0]?.kind).toBe('internal');
    expect(records[0]?.audited).toBe(false);
  });

  it('empty committed external-claims.json keeps anyAudited false', () => {
    const registry = loadAuditRegistry();
    expect(registry.packageCount).toBe(1);
    expect(registry.suiteCount).toBeGreaterThan(15);
    expect(registry.auditedCount).toBe(0);
    expect(registry.anyAudited).toBe(false);
    expect(registry.packages.every((record) => record.audited === false)).toBe(true);
  });

  it('refuses audited:true when an external claim hash does not match report bytes', () => {
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

  it('intake: matching firm report on a temp root is the only audited:true path', () => {
    const root = mkdtempSync(join(tmpdir(), 'q-proto-audit-'));
    const reportRel = 'docs/audits/external/fixture-report.md';
    mkdirSync(join(root, 'docs/audits/external'), { recursive: true });
    mkdirSync(join(root, 'services/svc-protocol/src/audit'), { recursive: true });
    writeFileSync(join(root, reportRel), 'reviewed package body\n');
    writeFileSync(
      join(root, EXTERNAL_CLAIMS_PATH),
      JSON.stringify({
        claims: [
          {
            id: 'fixture-external',
            packagePath: reportRel,
            kind: 'external',
            signedBy: 'example-firm',
            signedAt: '2026-01-01T00:00:00.000Z',
            expectedHash: hashPackageContents('reviewed package body\n'),
          },
        ],
      }),
    );
    const records = loadExternalPackageRecords(root);
    expect(records).toHaveLength(1);
    expect(records[0]?.audited).toBe(true);
    expect(records[0]?.kind).toBe('external');
    expect(loadAuditRegistry().anyAudited).toBe(false);
  });
});
