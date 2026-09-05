/**
 * Unit card — affiliates.freezes / FreezeService.list limit unset refuse (no invented 100)
 *
 * 1. Promise: omitted freezes limit does not dump the ledger or become 100. Owner/query may pass 100.
 * 2. Break: `list()` with no window dressed a blank page as the whole freeze roster.
 * 3. Done bar: no `list()` without limit; no `input?.limit`; unset/null/out of
 *    1..500 throw identity.affiliate_freezes_limit_unset before SQL; explicit 100 is a published window.
 * 4. Class N
 * 5. Paths: router.ts affiliates.freezes; freeze-service.ts list
 * 6. RED: omitting limit returns the whole affiliate_freezes table
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_FREEZES_LIMIT_MAX,
  AffiliateFreezesLimitUnsetError,
  FreezeService,
  IDENTITY_AFFILIATE_FREEZES_LIMIT_UNSET,
  publishedAffiliateFreezesLimit,
} from './freeze-service.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function serviceWithUnreachableSql(): { service: FreezeService; sqlCalled: () => boolean } {
  let sqlCalled = false;
  const sql = Object.assign(() => {
    sqlCalled = true;
    throw new Error('sql must not run when affiliate freezes limit is unset');
  }, {}) as never;
  return { service: new FreezeService(sql), sqlCalled: () => sqlCalled };
}

describe('affiliates.freezes / FreezeService.list limit unset refuse (no invented 100)', () => {
  it('router.ts does not invent 100 via optional input or input?.limit', () => {
    const src = readFileSync(join(HERE, '../router.ts'), 'utf8');
    expect(src).not.toMatch(/requireFreeze\(\)\.list\(\)/);
    expect(src).toMatch(/requireFreeze\(\)\.list\(input\.limit\)/);
    expect(src).not.toMatch(/freezes: scopedProcedure\('admin:read'\)\s*\.output\(/s);
    expect(src).toMatch(/limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(500\)/);
  });

  it('freeze-service.ts does not invent 100 via default param', () => {
    const src = readFileSync(join(HERE, 'freeze-service.ts'), 'utf8');
    expect(src).not.toMatch(/async list\(\)/);
    expect(src).toMatch(/async list\(limit: number\)/);
    expect(src).toMatch(/publishedAffiliateFreezesLimit\(limit\)/);
    expect(src).toMatch(/LIMIT \$\{published\}/);
  });

  it('blank / non-integer / out of 1..500 throws identity.affiliate_freezes_limit_unset', () => {
    for (const limit of [undefined, null, 0, -1, 501, 1.5, Number.NaN]) {
      try {
        publishedAffiliateFreezesLimit(limit);
        expect.unreachable(`expected throw for limit=${String(limit)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(AffiliateFreezesLimitUnsetError);
        expect((err as AffiliateFreezesLimitUnsetError).code).toBe(IDENTITY_AFFILIATE_FREEZES_LIMIT_UNSET);
      }
    }
  });

  it('owner-explicit 100 and 1 are published windows', () => {
    expect(publishedAffiliateFreezesLimit(100)).toBe(100);
    expect(publishedAffiliateFreezesLimit(1)).toBe(1);
    expect(publishedAffiliateFreezesLimit(AFFILIATE_FREEZES_LIMIT_MAX)).toBe(500);
  });

  it('omitted / undefined / null limit refuses before SQL', async () => {
    for (const limit of [undefined, null] as unknown as number[]) {
      const { service, sqlCalled } = serviceWithUnreachableSql();
      await expect(service.list(limit)).rejects.toMatchObject({
        name: 'AffiliateFreezesLimitUnsetError',
        code: IDENTITY_AFFILIATE_FREEZES_LIMIT_UNSET,
      });
      expect(sqlCalled()).toBe(false);
    }
  });
});
