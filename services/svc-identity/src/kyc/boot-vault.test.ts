import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bootKycVault } from './boot-vault.js';

describe('bootKycVault', () => {
  it('returns null when key missing or weak — never invents encryption', () => {
    const sql = {} as never;
    expect(bootKycVault(sql, undefined)).toBeNull();
    expect(bootKycVault(sql, '')).toBeNull();
    expect(bootKycVault(sql, '   ')).toBeNull();
    expect(bootKycVault(sql, 'short')).toBeNull();
    expect(bootKycVault(sql, 'not-a-32-byte-key')).toBeNull();
  });

  it('unset/invalid key leaks no store instance and no default key', () => {
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
