/**
 * Unit card — KYC pending + waitlist list limit unset refuse (no invented 50)
 *
 * 1. Promise: omitted list/KYC limit does not become 50. Owner/query may pass 50.
 * 2. Break: `listPendingKyc(input?.limit ?? 50)` and waitlist `limit .default(50)`
 *    dressed a blank page as a chosen window.
 * 3. Done bar: no `?? 50` / `limit = 50` / waitlist `.default(50)`; unset/null/out
 *    of 1..200 throw identity.kyc_pending_limit_unset before SQL; explicit 50 is
 *    a published window.
 * 4. Class N
 * 5. Paths: router.ts kyc.pending + waitlist.list; auth-service.ts listPendingKyc
 * 6. RED: omitting limit returns a 50-row queue / page
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  IDENTITY_KYC_PENDING_LIMIT_UNSET,
  KYC_PENDING_LIMIT_MAX,
  KycPendingLimitUnsetError,
  publishedKycPendingLimit,
  AuthService,
} from './auth-service.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function serviceWithUnreachableSql(): { auth: AuthService; sqlCalled: () => boolean } {
  let sqlCalled = false;
  const sql = Object.assign(() => {
    sqlCalled = true;
    throw new Error('sql must not run when KYC pending limit is unset');
  }, {}) as never;
  const auth = new AuthService(sql, {} as never, {} as never, {
    secret: 'kyc-pending-limit-test-secret-long-enough',
    issuer: 'intafaced',
    audience: 'intafaced.api',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 3600,
  });
  return { auth, sqlCalled: () => sqlCalled };
}

describe('KYC pending + waitlist list limit unset refuse (no invented 50)', () => {
  it('router.ts does not invent 50 via ?? or waitlist .default(50)', () => {
    const src = readFileSync(join(HERE, '../router.ts'), 'utf8');
    expect(src).not.toMatch(/listPendingKyc\(input\?\.limit \?\? 50\)/);
    expect(src).toMatch(/auth\.listPendingKyc\(input\.limit\)/);
    expect(src).not.toMatch(/limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)/);
    expect(src).toMatch(/limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)/);
  });

  it('auth-service.ts does not invent 50 via default param', () => {
    const src = readFileSync(join(HERE, 'auth-service.ts'), 'utf8');
    expect(src).not.toMatch(/async listPendingKyc\(limit = 50\)/);
    expect(src).toMatch(/async listPendingKyc\(limit: number\)/);
    expect(src).toMatch(/publishedKycPendingLimit\(limit\)/);
  });

  it('blank / non-integer / out of 1..200 throws identity.kyc_pending_limit_unset', () => {
    for (const limit of [undefined, null, 0, -1, 201, 1.5, Number.NaN]) {
      try {
        publishedKycPendingLimit(limit);
        expect.unreachable(`expected throw for limit=${String(limit)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(KycPendingLimitUnsetError);
        expect((err as KycPendingLimitUnsetError).code).toBe(IDENTITY_KYC_PENDING_LIMIT_UNSET);
      }
    }
  });

  it('owner-explicit 50 and 1 are published windows', () => {
    expect(publishedKycPendingLimit(50)).toBe(50);
    expect(publishedKycPendingLimit(1)).toBe(1);
    expect(publishedKycPendingLimit(KYC_PENDING_LIMIT_MAX)).toBe(200);
  });

  it('omitted / undefined / null limit refuses before SQL', async () => {
    for (const limit of [undefined, null] as unknown as number[]) {
      const { auth, sqlCalled } = serviceWithUnreachableSql();
      await expect(auth.listPendingKyc(limit)).rejects.toMatchObject({
        name: 'KycPendingLimitUnsetError',
        code: IDENTITY_KYC_PENDING_LIMIT_UNSET,
      });
      expect(sqlCalled()).toBe(false);
    }
  });
});
