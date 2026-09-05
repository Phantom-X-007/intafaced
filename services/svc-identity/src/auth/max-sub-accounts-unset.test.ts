/**
 * Unit card — createSubAccount refuse when cap unpublished
 *
 * 1. Promise: omitted / invalid cap → auth.sub_account_cap_unset (no invented 25).
 *    Owner-explicit 25 is a published number, not a git default.
 * 2. Break: constructor DEFAULT_MAX_SUB_ACCOUNTS = 25 lets blank look published.
 * 3. Done bar: mock-sql create refuses before INSERT; source has no DEFAULT 25.
 * 4. Class M
 * 5. Paths: auth-service.ts createSubAccount
 * 6. RED: unset create succeeds or source git-defaults 25
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import type { Sql } from 'postgres';
import type { RankService } from '../rank/rank-service.js';
import { AuthService } from './auth-service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const tokenConfig = {
  secret: 'an-identity-test-signing-secret-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
};

function activeUserSql(): Sql {
  const fn = async () => [{ status: 'active' }];
  return Object.assign(fn, { json: (v: unknown) => v }) as unknown as Sql;
}

function makeAuth(maxSubAccounts?: number) {
  return new AuthService(
    activeUserSql(),
    new MemoryEventBus('svc-identity'),
    {} as RankService,
    tokenConfig,
    undefined,
    undefined,
    undefined,
    undefined,
    maxSubAccounts,
  );
}

describe('createSubAccount cap unpublished', () => {
  it('auth-service.ts does not git-default 25', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'auth-service.ts'), 'utf8');
    expect(src).not.toMatch(/DEFAULT_MAX_SUB_ACCOUNTS/);
    expect(src).not.toMatch(/maxSubAccounts:\s*number\s*=\s*25/);
    expect(src).toMatch(/auth\.sub_account_cap_unset/);
  });

  it('unset cap refuses create (does not invent 25)', async () => {
    await expect(makeAuth().createSubAccount(USER, 'bot')).rejects.toMatchObject({
      code: 'auth.sub_account_cap_unset',
    });
  });

  it('NaN / 0 cap refuses create (does not invent 25)', async () => {
    await expect(makeAuth(Number.NaN).createSubAccount(USER, 'bot')).rejects.toMatchObject({
      code: 'auth.sub_account_cap_unset',
    });
    await expect(makeAuth(0).createSubAccount(USER, 'bot')).rejects.toMatchObject({
      code: 'auth.sub_account_cap_unset',
    });
  });
});
