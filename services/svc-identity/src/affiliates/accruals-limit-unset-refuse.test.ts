/**
 * Unit card — myAccruals / listByBeneficiary limit unset refuse (no invented 100)
 *
 * 1. Promise: omitted accruals limit does not become 100. Owner/query may pass 100.
 * 2. Break: `listByBeneficiary(..., limit = 100)` and `input?.limit` dressed a
 *    blank page as a chosen 100-row window.
 * 3. Done bar: no `limit = 100` / `input?.limit`; unset/null/out of 1..500 throw
 *    identity.accruals_limit_unset before SQL; explicit 100 is a published window.
 * 4. Class N
 * 5. Paths: router.ts affiliates.myAccruals; accrual-store.ts listByBeneficiary
 * 6. RED: omitting limit returns a 100-row accrual page
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCRUALS_LIMIT_MAX,
  AccrualsLimitUnsetError,
  IDENTITY_ACCRUALS_LIMIT_UNSET,
  MemoryAccrualStore,
  publishedAccrualsLimit,
  SqlAccrualStore,
} from './accrual-store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = '22222222-2222-4222-8222-222222222222';

function sqlStoreUnreachable(): { store: SqlAccrualStore; sqlCalled: () => boolean } {
  let sqlCalled = false;
  const sql = Object.assign(() => {
    sqlCalled = true;
    throw new Error('sql must not run when accruals limit is unset');
  }, {}) as never;
  return { store: new SqlAccrualStore(sql), sqlCalled: () => sqlCalled };
}

describe('myAccruals / listByBeneficiary limit unset refuse (no invented 100)', () => {
  it('router.ts does not invent 100 via optional input or input?.limit', () => {
    const src = readFileSync(join(HERE, '../router.ts'), 'utf8');
    expect(src).not.toMatch(/listByBeneficiary\(ctx\.principal\.userId, input\?\.limit\)/);
    expect(src).toMatch(/listByBeneficiary\(ctx\.principal\.userId, input\.limit\)/);
    expect(src).not.toMatch(/limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(500\)\.optional\(\)/);
    expect(src).toMatch(/limit: z\.number\(\)\.int\(\)\.min\(1\)\.max\(500\)/);
  });

  it('accrual-store.ts does not invent 100 via default param', () => {
    const src = readFileSync(join(HERE, 'accrual-store.ts'), 'utf8');
    expect(src).not.toMatch(/listByBeneficiary\(beneficiaryId: string, limit = 100\)/);
    expect(src).toMatch(/listByBeneficiary\(beneficiaryId: string, limit: number\)/);
    expect(src).toMatch(/publishedAccrualsLimit\(limit\)/);
  });

  it('blank / non-integer / out of 1..500 throws identity.accruals_limit_unset', () => {
    for (const limit of [undefined, null, 0, -1, 501, 1.5, Number.NaN]) {
      try {
        publishedAccrualsLimit(limit);
        expect.unreachable(`expected throw for limit=${String(limit)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(AccrualsLimitUnsetError);
        expect((err as AccrualsLimitUnsetError).code).toBe(IDENTITY_ACCRUALS_LIMIT_UNSET);
      }
    }
  });

  it('owner-explicit 100 and 1 are published windows', () => {
    expect(publishedAccrualsLimit(100)).toBe(100);
    expect(publishedAccrualsLimit(1)).toBe(1);
    expect(publishedAccrualsLimit(ACCRUALS_LIMIT_MAX)).toBe(500);
  });

  it('omitted / undefined / null limit refuses before SQL', async () => {
    for (const limit of [undefined, null] as unknown as number[]) {
      const { store, sqlCalled } = sqlStoreUnreachable();
      await expect(store.listByBeneficiary(REF, limit)).rejects.toMatchObject({
        name: 'AccrualsLimitUnsetError',
        code: IDENTITY_ACCRUALS_LIMIT_UNSET,
      });
      expect(sqlCalled()).toBe(false);
    }
  });

  it('memory store omit refuses; explicit 100 pages without inventing a default', async () => {
    const store = new MemoryAccrualStore();
    await expect(store.listByBeneficiary(REF, undefined as unknown as number)).rejects.toMatchObject({
      name: 'AccrualsLimitUnsetError',
      code: IDENTITY_ACCRUALS_LIMIT_UNSET,
    });
    await expect(store.listByBeneficiary(REF, 100)).resolves.toEqual([]);
  });
});
