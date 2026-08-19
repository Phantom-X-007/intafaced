import { describe, expect, it } from 'vitest';
import {
  evaluatePackage,
  hashPackageContents,
  INTERNAL_SMART_ACCOUNTS,
  loadInternalSmartAccountsPackage,
  type PackageClaim,
} from './pipeline.js';

const externalClaim = (overrides: Partial<PackageClaim> = {}): PackageClaim => ({
  id: 'fixture-external',
  packagePath: 'memory:fixture',
  kind: 'external',
  signedBy: 'example-firm',
  signedAt: '2026-01-15T00:00:00.000Z',
  expectedHash: hashPackageContents('reviewed package body'),
  ...overrides,
});

describe('S-J1 audit pipeline', () => {
  it('loads the committed internal package: hash + signer, audited stays false', () => {
    const record = loadInternalSmartAccountsPackage();
    expect(record.id).toBe('protocol-smart-accounts');
    expect(record.kind).toBe('internal');
    expect(record.packagePath).toBe(INTERNAL_SMART_ACCOUNTS.packagePath);
    expect(record.artifactHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(record.signedBy).toBe('shehzad002');
    expect(record.audited).toBe(false);
  });

  it('internal kind can never flip audited even with a signer', () => {
    const body = '# internal notes';
    const record = evaluatePackage(
      {
        id: 'x',
        packagePath: 'memory:x',
        kind: 'internal',
        signedBy: 'shehzad002',
        signedAt: '2026-08-08T00:00:00.000Z',
        expectedHash: hashPackageContents(body),
      },
      body,
    );
    expect(record.kind).toBe('internal');
    expect(record.audited).toBe(false);
  });

  it('external + named signer + matching pinned hash is the only audited:true path', () => {
    const record = evaluatePackage(externalClaim(), 'reviewed package body');
    expect(record.kind).toBe('external');
    expect(record.audited).toBe(true);
    expect(record.signedBy).toBe('example-firm');
    expect(record.artifactHash).toBe(hashPackageContents('reviewed package body'));
  });

  it('refuses audited:true when the package bytes do not match the pinned hash', () => {
    const record = evaluatePackage(externalClaim(), 'tampered package body');
    expect(record.audited).toBe(false);
    expect(record.kind).toBe('none');
  });

  it('refuses audited:true when the signer is missing', () => {
    const record = evaluatePackage(externalClaim({ signedBy: null }), 'reviewed package body');
    expect(record.audited).toBe(false);
    expect(record.kind).toBe('none');
  });

  it('refuses audited:true when no hash is pinned', () => {
    const { expectedHash: _drop, ...rest } = externalClaim();
    const record = evaluatePackage(rest, 'reviewed package body');
    expect(record.audited).toBe(false);
    expect(record.kind).toBe('none');
  });

  it('empty package is not an audit', () => {
    const record = evaluatePackage(externalClaim({ expectedHash: hashPackageContents('') }), '   ');
    expect(record.audited).toBe(false);
    expect(record.kind).toBe('none');
  });

  it('normalises CRLF so a Windows checkout does not change the hash', () => {
    expect(hashPackageContents('a\r\nb\r\n')).toBe(hashPackageContents('a\nb\n'));
  });
});
