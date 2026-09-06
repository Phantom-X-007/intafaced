/**
 * Unit card — webauthn.list / listWebauthnCredentials limit unset refuse (no invented 50, no dump)
 *
 * 1. Promise: omitted WebAuthn list limit does not dump credentials or become a default page.
 * 2. Break: listWebauthnCredentials(userId) with no page size dressed a blank page as every credential.
 * 3. Done bar: no listWebauthnCredentials(userId) without limit; no input?.limit / ?? / .default;
 *    unset/null/out of 1..200 throw identity.webauthn_list_limit_unset before SQL.
 * 4. Class N
 * 5. Paths: router.ts webauthn.list; auth-service.ts listWebauthnCredentials
 * 6. RED: omitting limit returns every webauthn_creds entry for the user
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AuthService,
  IDENTITY_WEBAUTHN_LIST_LIMIT_UNSET,
  WEBAUTHN_LIST_LIMIT_MAX,
  WebauthnListLimitUnsetError,
  publishedWebauthnListLimit,
} from './auth-service.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function serviceWithUnreachableSql(): { auth: AuthService; sqlCalled: () => boolean } {
  let sqlCalled = false;
  const sql = Object.assign(() => {
    sqlCalled = true;
    throw new Error('sql must not run when WebAuthn list limit is unset');
  }, {}) as never;
  const auth = new AuthService(sql, {} as never, {} as never, {
    secret: 'webauthn-list-limit-test-secret-long-enough',
    issuer: 'intafaced',
    audience: 'intafaced.api',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 3600,
  });
  return { auth, sqlCalled: () => sqlCalled };
}

describe('webauthn.list / listWebauthnCredentials limit unset refuse (no invented 50)', () => {
  it('router.ts requires limit 1..200 and passes input.limit', () => {
    const src = readFileSync(join(HERE, '../router.ts'), 'utf8');
    expect(src).not.toMatch(/listWebauthnCredentials\(ctx\.principal\.userId\)\s*;/);
    expect(src).toMatch(/listWebauthnCredentials\(ctx\.principal\.userId, input\.limit\)/);
    expect(src).not.toMatch(/omit never dumps credentials[\s\S]{0,250}limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.optional\(\)/);
    expect(src).not.toMatch(/omit never dumps credentials[\s\S]{0,250}limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(/);
    expect(src).toMatch(/omit never dumps credentials[\s\S]{0,250}limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)/);
    expect(src).not.toMatch(/listWebauthnCredentials\([^)]*\?\? 50/);
  });

  it('auth-service.ts does not invent a page via default param', () => {
    const src = readFileSync(join(HERE, 'auth-service.ts'), 'utf8');
    expect(src).not.toMatch(/async listWebauthnCredentials\([^)]*limit = /);
    expect(src).toMatch(/publishedWebauthnListLimit\(limit\)/);
    expect(src).toMatch(/\.slice\(0, published\)/);
  });

  it('blank / non-integer / out of 1..200 throws identity.webauthn_list_limit_unset', () => {
    for (const limit of [undefined, null, 0, -1, 201, 1.5, Number.NaN]) {
      try {
        publishedWebauthnListLimit(limit);
        expect.unreachable(`expected throw for limit=${String(limit)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(WebauthnListLimitUnsetError);
        expect((err as WebauthnListLimitUnsetError).code).toBe(IDENTITY_WEBAUTHN_LIST_LIMIT_UNSET);
      }
    }
  });

  it('owner-explicit 1 and max are published windows', () => {
    expect(publishedWebauthnListLimit(1)).toBe(1);
    expect(publishedWebauthnListLimit(WEBAUTHN_LIST_LIMIT_MAX)).toBe(200);
  });

  it('omitted / undefined / null limit refuses before SQL', async () => {
    for (const limit of [undefined, null] as unknown as number[]) {
      const { auth, sqlCalled } = serviceWithUnreachableSql();
      await expect(auth.listWebauthnCredentials(USER, limit)).rejects.toMatchObject({
        name: 'WebauthnListLimitUnsetError',
        code: IDENTITY_WEBAUTHN_LIST_LIMIT_UNSET,
      });
      expect(sqlCalled()).toBe(false);
    }
  });
});
