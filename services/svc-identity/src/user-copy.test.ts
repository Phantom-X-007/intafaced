import { describe, expect, it } from 'vitest';
import { userCopy } from './user-copy.js';
import { INSURED_REFUSED } from './auth/insured-refuse.js';

/**
 * Unit card — user-visible identity copy resolves @intafaced/i18n keys
 * 1. Promise: TRK-infra.i18n slice — auth / KYC / rank refuse strings
 * 2. Break: unknown key invents English instead of echoing the dotted name
 * 3. Done bar: known key renders catalog copy; unknown key === key string
 * 4. Class N
 * 5. Paths: services/svc-identity only (do not edit packages/i18n catalog)
 * 6. RED: unknown key becomes a sentence
 * 7. Collision: none vs svc-academy / svc-market / packages/i18n catalog
 */
describe('userCopy — catalog keys, never invented English', () => {
  it('resolves a known catalog key from @intafaced/i18n', () => {
    expect(userCopy('error.notFound')).toBe('We could not find that.');
    expect(userCopy('auth.not_found')).toBe('We could not find that.');
    expect(userCopy('auth.session.expired')).toBe('Your session has expired. Sign in again.');
    expect(userCopy('auth.session_invalid')).toBe('Your session has expired. Sign in again.');
    expect(userCopy('auth.mfa_required')).toBe('Two-factor verification');
    expect(userCopy('error.kyc.required')).toBe('Verification is required for this action.');
    expect(userCopy('notify.identity.rank.updated.title')).toBe('Rank updated');
  });

  it('renders the dotted key when the key is not in the catalog', () => {
    const missing = 'identity.auth.this.key.does.not.exist';
    const rendered = userCopy(missing);

    expect(rendered).toBe(missing);
    expect(rendered).not.toMatch(/ /);
    expect(rendered).not.toMatch(/invalid credentials|please try|something went wrong|could not find/i);
  });

  it('does not invent English or screening copy for unkeyed auth/KYC codes', () => {
    const credentials = userCopy('auth.invalid_credentials');
    expect(credentials).toBe('auth.invalid_credentials');
    expect(credentials).not.toMatch(/ /);
    expect(credentials).not.toMatch(/invalid credentials/i);

    const screening = userCopy('identity.kyc.screening.this.key.does.not.exist');
    expect(screening).toBe('identity.kyc.screening.this.key.does.not.exist');
    expect(screening).not.toMatch(/sanction|ofac|pep list|cleared|blocked person/i);
    expect(screening).not.toMatch(/ /);
  });

  it('refuses an insured claim — returns the named refuse key, never the sentence', () => {
    expect(userCopy('Deposits are insured by the house.')).toBe(INSURED_REFUSED);
    expect(userCopy('insured')).toBe(INSURED_REFUSED);
    expect(userCopy('uninsured account')).not.toBe(INSURED_REFUSED);
    expect(userCopy('error.notFound')).not.toMatch(/insured/i);
  });
});
