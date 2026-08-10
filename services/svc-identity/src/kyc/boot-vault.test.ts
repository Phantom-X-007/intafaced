import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bootKycVault } from './boot-vault.js';

describe('bootKycVault', () => {
  it('returns null when key missing or weak — never invents encryption', () => {
    const sql = {} as never;
    expect(bootKycVault(sql, undefined)).toBeNull();
    expect(bootKycVault(sql, '')).toBeNull();
    expect(bootKycVault(sql, 'short')).toBeNull();
  });

  it('returns vault + bind when key is 32 bytes', () => {
    const sql = {} as never;
    const boot = bootKycVault(sql, randomBytes(32).toString('base64'));
    expect(boot).not.toBeNull();
    expect(boot!.kycDocs).toBeDefined();
    expect(typeof boot!.bindKycProviderRef).toBe('function');
  });
});
