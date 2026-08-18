import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bootKycVault, kycRouterBootOptions } from './boot-vault.js';
import { KycDocumentError } from './document-store.js';

describe('bootKycVault', () => {
  it('returns null when key is unset — never invents encryption', () => {
    const sql = {} as never;
    expect(bootKycVault(sql, undefined)).toBeNull();
    expect(bootKycVault(sql, '')).toBeNull();
    expect(bootKycVault(sql, '   ')).toBeNull();
  });

  it('throws named kyc_doc.key_missing when the key is set but not 32 bytes — not a silent missing store', () => {
    const sql = {} as never;
    expect(() => bootKycVault(sql, 'short')).toThrow(KycDocumentError);
    try {
      bootKycVault(sql, 'not-a-32-byte-key');
      expect.unreachable('must refuse a set-but-invalid key');
    } catch (e) {
      expect(e).toBeInstanceOf(KycDocumentError);
      expect((e as KycDocumentError).code).toBe('kyc_doc.key_missing');
    }
  });

  it('unset key leaks no store instance and no default key', () => {
    const sql = {} as never;
    const missing = bootKycVault(sql, undefined);
    const blank = bootKycVault(sql, '');
    expect(missing).toBeNull();
    expect(blank).toBeNull();
    expect(missing?.kycDocs).toBeUndefined();
    expect(blank?.kycDocs).toBeUndefined();
    expect(missing?.bindKycProviderRef).toBeUndefined();
    expect(blank?.bindKycProviderRef).toBeUndefined();
  });

  it('returns vault + bind when key is 32 bytes', () => {
    const sql = {} as never;
    const boot = bootKycVault(sql, randomBytes(32).toString('base64'));
    expect(boot).not.toBeNull();
    expect(boot!.kycDocs).toBeDefined();
    expect(typeof boot!.bindKycProviderRef).toBe('function');
    expect(typeof boot!.kycDocs.getFor).toBe('function');
    expect(typeof boot!.kycDocs.deleteFor).toBe('function');
    expect(typeof boot!.kycDocs.assertDocumentForUser).toBe('function');
    // Free get(id) is the cross-user leak class — must not exist on the boot surface.
    expect((boot!.kycDocs as { get?: unknown }).get).toBeUndefined();
  });
});

describe('kycRouterBootOptions — production router fragment', () => {
  it('when the key is set, kycDocs is present (omitting it would be a silent missing store)', () => {
    const sql = {} as never;
    const opts = kycRouterBootOptions(sql, randomBytes(32).toString('base64'));
    expect(opts.kycDocs).toBeDefined();
    expect(typeof opts.bindKycProviderRef).toBe('function');
    expect(typeof opts.kycDocs!.getFor).toBe('function');
    expect(typeof opts.kycDocs!.deleteFor).toBe('function');
  });

  it('when the key is unset, options carry no store — router named-refuses, no invented vault', () => {
    const sql = {} as never;
    const opts = kycRouterBootOptions(sql, '');
    expect(opts).toEqual({});
    expect(opts.kycDocs).toBeUndefined();
  });
});
