/**
 * Unit card — myResidencies SQL refuses unpublished page size
 *
 * 1. Promise: omit / null / 0 / negative / garbage throws my_residencies_list_limit_unset.
 *    Owner-explicit 50 slices. Never invent 50/100 or the whole table.
 * 2. Break: omit SELECT dumps every residency_applications row for the user.
 * 3. Done bar: unset throws typed error; published 50 accepted; SQL has LIMIT ${limit}.
 * 4. Class N
 * 5. Paths: academy-service myResidencies + router myResidencies only
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AcademyError } from './errors.js';
import { assertMyResidenciesListLimit } from './sql-list-limit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const UNSET: Array<number | null | undefined> = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 'nope' as unknown as number];

describe('svc-academy myResidencies refuses unset limit', () => {
  it('assertMyResidenciesListLimit refuses omit/null/0/negative/garbage — never invents 50', () => {
    for (const limit of UNSET) {
      expect(() => assertMyResidenciesListLimit(limit)).toThrow(AcademyError);
    }
    try {
      assertMyResidenciesListLimit(undefined);
      throw new Error('expected refuse academy.my_residencies_list_limit_unset');
    } catch (e) {
      expect(e).toBeInstanceOf(AcademyError);
      expect((e as AcademyError).code).toBe('academy.my_residencies_list_limit_unset');
      expect((e as AcademyError).message).not.toMatch(/50-row|default 50|\?\? 50/i);
    }
  });

  it('owner-published 50 is accepted; 200 is the cap not a default', () => {
    expect(assertMyResidenciesListLimit(50)).toBe(50);
    expect(assertMyResidenciesListLimit(1)).toBe(1);
    expect(assertMyResidenciesListLimit(200)).toBe(200);
    expect(assertMyResidenciesListLimit(201)).toBe(200);
  });

  it('myResidencies SQL no longer dumps residency_applications without a limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/academy-service.ts'), 'utf8');
    const start = src.indexOf('async myResidencies(');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('async listOpenResidencies(', start));
    expect(fn).toContain('assertMyResidenciesListLimit');
    expect(fn).toContain('LIMIT ${limit}');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit \?\? all\.length/);
  });

  it('router does not invent 50 when myResidencies omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/router.ts'), 'utf8');
    const start = src.indexOf('myResidencies: scopedProcedure');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('openResidencies:', start));
    expect(fn).toContain('input?.limit');
    expect(fn).not.toMatch(/input\?\.limit \?\? 50/);
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(src).toContain('academy.my_residencies_list_limit_unset');
  });
});
