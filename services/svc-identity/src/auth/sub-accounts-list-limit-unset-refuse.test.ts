/**
 * Unit card — subAccounts.list limit unset refuse (no invented 50, no dump)
 *
 * 1. Promise: omitted partition list limit does not dump books or become a default page.
 * 2. Break: listSubAccounts(userId) with no LIMIT dressed a blank page as every partition.
 * 3. Done bar: no listSubAccounts(userId) without limit; no input?.limit / ?? / .default;
 *    unset/null/out of 1..200 throw identity.sub_accounts_list_limit_unset before SQL.
 * 4. Class N
 * 5. Paths: router.ts subAccounts.list; auth-service.ts listSubAccounts
 * 6. RED: omitting limit returns every sub_accounts row for the parent
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AuthService,
  IDENTITY_SUB_ACCOUNTS_LIST_LIMIT_UNSET,
  SUB_ACCOUNTS_LIST_LIMIT_MAX,
  SubAccountsListLimitUnsetError,
  publishedSubAccountsListLimit,
} from './auth-service.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function serviceWithUnreachableSql(): { auth: AuthService; sqlCalled: () => boolean } {
  let sqlCalled = false;
  const sql = Object.assign(() => {
    sqlCalled = true;
    throw new Error('sql must not run when sub-accounts list limit is unset');
  }, {}) as never;
  const auth = new AuthService(sql, {} as never, {} as never, {
    secret: 'sub-accounts-list-limit-test-secret-long-enough',
    issuer: 'intafaced',
    audience: 'intafaced.api',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 3600,
  });
  return { auth, sqlCalled: () => sqlCalled };
}

describe('subAccounts.list / listSubAccounts limit unset refuse (no invented 50)', () => {
  it('router.ts requires limit 1..200 and passes input.limit', () => {
    const src = readFileSync(join(HERE, '../router.ts'), 'utf8');
    expect(src).not.toMatch(/listSubAccounts\(ctx\.principal\.userId\)\s*;/);
    expect(src).toMatch(/listSubAccounts\(ctx\.principal\.userId, input\.limit\)/);
    expect(src).not.toMatch(/omit never dumps partitions[\s\S]{0,250}limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.optional\(\)/);
    expect(src).not.toMatch(/omit never dumps partitions[\s\S]{0,250}limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(/);
    expect(src).toMatch(/omit never dumps partitions[\s\S]{0,250}limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)/);
    expect(src).not.toMatch(/listSubAccounts\([^)]*\?\? 50/);
  });

  it('auth-service.ts does not invent a page via default param', () => {
    const src = readFileSync(join(HERE, 'auth-service.ts'), 'utf8');
    expect(src).not.toMatch(/async listSubAccounts\([\s\S]{0,80}limit = /);
    expect(src).toMatch(/publishedSubAccountsListLimit\(limit\)/);
    expect(src).toMatch(/FROM sub_accounts WHERE parent_user_id = \$\{userId\} ORDER BY created_at DESC LIMIT \$\{published\}/);
  });

  it('blank / non-integer / out of 1..200 throws identity.sub_accounts_list_limit_unset', () => {
    for (const limit of [undefined, null, 0, -1, 201, 1.5, Number.NaN]) {
      try {
        publishedSubAccountsListLimit(limit);
        expect.unreachable(`expected throw for limit=${String(limit)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(SubAccountsListLimitUnsetError);
        expect((err as SubAccountsListLimitUnsetError).code).toBe(IDENTITY_SUB_ACCOUNTS_LIST_LIMIT_UNSET);
      }
    }
  });

  it('owner-explicit 1 and max are published windows', () => {
    expect(publishedSubAccountsListLimit(1)).toBe(1);
    expect(publishedSubAccountsListLimit(SUB_ACCOUNTS_LIST_LIMIT_MAX)).toBe(200);
  });

  it('omitted / undefined / null limit refuses before SQL', async () => {
    for (const limit of [undefined, null] as unknown as number[]) {
      const { auth, sqlCalled } = serviceWithUnreachableSql();
      await expect(auth.listSubAccounts(USER, limit)).rejects.toMatchObject({
        name: 'SubAccountsListLimitUnsetError',
        code: IDENTITY_SUB_ACCOUNTS_LIST_LIMIT_UNSET,
      });
      expect(sqlCalled()).toBe(false);
    }
  });
});
