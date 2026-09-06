/**
 * Unit card — myCerts SQL refuses unpublished page size
 *
 * 1. Promise: omit / null / 0 / negative / garbage throws my_certs_list_limit_unset.
 *    Owner-explicit 50 slices. Never invent 50/100 or the whole table.
 * 2. Break: omit SELECT dumps every cert_grants row for the user.
 * 3. Done bar: unset throws typed error; published 50 accepted; SQL has LIMIT ${limit}.
 * 4. Class N
 * 5. Paths: academy-service myCertGrants + router myCerts only
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AcademyError } from './errors.js';
import { assertMyCertsListLimit } from './sql-list-limit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const UNSET: Array<number | null | undefined> = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 'nope' as unknown as number];

describe('svc-academy myCerts refuses unset limit', () => {
  it('assertMyCertsListLimit refuses omit/null/0/negative/garbage — never invents 50', () => {
    for (const limit of UNSET) {
      expect(() => assertMyCertsListLimit(limit)).toThrow(AcademyError);
    }
    try {
      assertMyCertsListLimit(undefined);
      throw new Error('expected refuse academy.my_certs_list_limit_unset');
    } catch (e) {
      expect(e).toBeInstanceOf(AcademyError);
      expect((e as AcademyError).code).toBe('academy.my_certs_list_limit_unset');
      expect((e as AcademyError).message).not.toMatch(/50-row|default 50|\?\? 50/i);
    }
  });

  it('owner-published 50 is accepted; 200 is the cap not a default', () => {
    expect(assertMyCertsListLimit(50)).toBe(50);
    expect(assertMyCertsListLimit(1)).toBe(1);
    expect(assertMyCertsListLimit(200)).toBe(200);
    expect(assertMyCertsListLimit(201)).toBe(200);
  });

  it('myCertGrants SQL no longer dumps cert_grants without a limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/academy-service.ts'), 'utf8');
    const start = src.indexOf('async myCertGrants(');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('async certProgress(', start));
    expect(fn).toContain('assertMyCertsListLimit');
    expect(fn).toContain('LIMIT ${limit}');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit \?\? all\.length/);
  });

  it('router does not invent 50 when myCerts omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/router.ts'), 'utf8');
    const start = src.indexOf('myCerts: scopedProcedure');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('certProgress:', start));
    expect(fn).toContain('limit: z.number().optional()');
    expect(fn).toContain('input?.limit');
    expect(fn).not.toMatch(/input\?\.limit \?\? 50/);
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(src).toContain('academy.my_certs_list_limit_unset');
  });
});
