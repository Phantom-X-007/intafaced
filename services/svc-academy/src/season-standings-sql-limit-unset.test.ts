/**
 * Unit card — leftover season standings SQL dump refuses unpublished page size
 *
 * 1. Promise: omit / null / 0 / negative / garbage throws academy.standings_limit_unset.
 *    Owner-explicit 50 slices. Never invent 50/100 or the whole season ladder.
 * 2. Break: omit SELECT dumps academy.tournament_standings for a season.
 * 3. Done bar: unset throws typed error; published 50 accepted; SQL has LIMIT ${limit}.
 * 4. Class N
 * 5. Paths: academy-service standings() + router standings query
 *
 * Different door from #4072 pageStandings / #4075 pageRankedStandings (in-memory).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AcademyError } from './errors.js';
import { assertSeasonStandingsSqlLimit } from './sql-list-limit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const UNSET: Array<number | null | undefined> = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 'nope' as unknown as number];

describe('svc-academy season standings SQL dump refuses unset limit', () => {
  it('named assert refuses omit/null/0/negative/garbage — never invent 50', () => {
    for (const limit of UNSET) {
      expect(() => assertSeasonStandingsSqlLimit(limit)).toThrow(AcademyError);
    }
    try {
      assertSeasonStandingsSqlLimit(undefined);
      throw new Error('expected refuse academy.standings_limit_unset');
    } catch (e) {
      expect(e).toBeInstanceOf(AcademyError);
      expect((e as AcademyError).code).toBe('academy.standings_limit_unset');
      expect((e as AcademyError).message).not.toMatch(/50-row|default 50|\?\? 50/i);
    }
  });

  it('owner-published 50 is accepted; 200 is the cap not a default', () => {
    expect(assertSeasonStandingsSqlLimit(50)).toBe(50);
    expect(assertSeasonStandingsSqlLimit(1)).toBe(1);
    expect(assertSeasonStandingsSqlLimit(200)).toBe(200);
    expect(assertSeasonStandingsSqlLimit(201)).toBe(200);
  });

  it('standings() SQL no longer dumps tournament_standings without a limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/academy-service.ts'), 'utf8');
    const start = src.indexOf('async standings(');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('// ── Ambassador programme', start));
    expect(fn).toContain('assertSeasonStandingsSqlLimit');
    expect(fn).toContain('LIMIT ${limit}');
    expect(fn).toContain('ORDER BY score DESC, updated_at ASC');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit \?\? all\.length/);
  });

  it('router does not invent 50 when standings omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/router.ts'), 'utf8');
    const standings = src.slice(src.indexOf('standings: scopedProcedure'), src.indexOf('createSeason:'));
    expect(standings).toContain('limit: z.number().optional()');
    expect(standings).toContain('limit: input.limit');
    expect(standings).not.toMatch(/input\.limit \?\? 50/);
    expect(standings).not.toMatch(/\?\? 50/);
    expect(standings).not.toMatch(/\?\? 100/);
    expect(src).toContain('academy.standings_limit_unset');
  });
});
