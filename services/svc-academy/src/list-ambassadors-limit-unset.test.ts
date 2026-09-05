/**
 * Unit card — SQL listAmbassadors refuses unpublished page size
 *
 * 1. Promise: omit / null / 0 / negative / garbage throws ambassadors_list_limit_unset.
 *    Owner-explicit 50 slices. Never invent 50/100 or the whole table.
 * 2. Break: omit listAmbassadors SELECT dumps academy.ambassadors.
 * 3. Done bar: unset throws typed error; published 50 accepted; SQL has LIMIT ${limit}.
 * 4. Class N
 * 5. Paths: academy-service listAmbassadors + router ambassadors only
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AcademyError } from './errors.js';
import { assertAmbassadorsListLimit } from './ambassadors/list-limit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const UNSET: Array<number | null | undefined> = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 'nope' as unknown as number];

describe('svc-academy listAmbassadors refuses unset limit', () => {
  it('assertAmbassadorsListLimit refuses omit/null/0/negative/garbage — never invents 50', () => {
    for (const limit of UNSET) {
      expect(() => assertAmbassadorsListLimit(limit)).toThrow(AcademyError);
    }
    try {
      assertAmbassadorsListLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(AcademyError);
      expect((e as AcademyError).code).toBe('academy.ambassadors_list_limit_unset');
      expect((e as AcademyError).message).not.toMatch(/50-row|default 50|\?\? 50/i);
    }
  });

  it('owner-published 50 is accepted; 200 is the cap not a default', () => {
    expect(assertAmbassadorsListLimit(50)).toBe(50);
    expect(assertAmbassadorsListLimit(1)).toBe(1);
    expect(assertAmbassadorsListLimit(200)).toBe(200);
    expect(assertAmbassadorsListLimit(201)).toBe(200);
  });

  it('listAmbassadors SQL no longer dumps the whole ambassadors table without a limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/academy-service.ts'), 'utf8');
    const start = src.indexOf('async listAmbassadors(');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('async appointAmbassador(', start));
    expect(fn).toContain('assertAmbassadorsListLimit');
    expect(fn).toContain('LIMIT ${limit}');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit \?\? all\.length/);
  });

  it('router does not invent 50 when ambassadors omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/router.ts'), 'utf8');
    const start = src.indexOf('ambassadors: scopedProcedure');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('appointAmbassador:', start));
    expect(fn).toContain('limit: input?.limit');
    expect(fn).not.toMatch(/input\?\.limit \?\? 50/);
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(src).toContain('academy.ambassadors_list_limit_unset');
  });
});
