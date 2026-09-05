/**
 * Unit card — leftover SQL lists refuse unpublished page size
 *
 * 1. Promise: omit / null / 0 / negative / garbage throws named *_list_limit_unset.
 *    Owner-explicit 50 slices. Never invent 50/100 or the whole table.
 * 2. Break: omit SELECT dumps rooms / sessions / tournament_seasons / residency_applications.
 * 3. Done bar: unset throws typed error; published 50 accepted; SQL has LIMIT ${limit}.
 * 4. Class N
 * 5. Paths: academy-service listRooms/listSessions/listSeasons/listOpenResidencies + router
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AcademyError } from './errors.js';
import {
  assertOpenResidenciesListLimit,
  assertRoomsListLimit,
  assertSeasonsSqlListLimit,
  assertSessionsListLimit,
} from './sql-list-limit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const UNSET: Array<number | null | undefined> = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 'nope' as unknown as number];

const ASSERTS = [
  { fn: assertRoomsListLimit, code: 'academy.rooms_list_limit_unset' },
  { fn: assertSessionsListLimit, code: 'academy.sessions_list_limit_unset' },
  { fn: assertSeasonsSqlListLimit, code: 'academy.seasons_list_limit_unset' },
  { fn: assertOpenResidenciesListLimit, code: 'academy.open_residencies_list_limit_unset' },
] as const;

describe('svc-academy leftover SQL lists refuse unset limit', () => {
  it('named asserts refuse omit/null/0/negative/garbage — never invent 50', () => {
    for (const { fn, code } of ASSERTS) {
      for (const limit of UNSET) {
        expect(() => fn(limit)).toThrow(AcademyError);
      }
      try {
        fn(undefined);
        throw new Error(`expected refuse ${code}`);
      } catch (e) {
        expect(e).toBeInstanceOf(AcademyError);
        expect((e as AcademyError).code).toBe(code);
        expect((e as AcademyError).message).not.toMatch(/50-row|default 50|\?\? 50/i);
      }
    }
  });

  it('owner-published 50 is accepted; 200 is the cap not a default', () => {
    for (const { fn } of ASSERTS) {
      expect(fn(50)).toBe(50);
      expect(fn(1)).toBe(1);
      expect(fn(200)).toBe(200);
      expect(fn(201)).toBe(200);
    }
  });

  it('listRooms SQL no longer dumps academy.rooms without a limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/academy-service.ts'), 'utf8');
    const start = src.indexOf('async listRooms(');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('async invite(', start));
    expect(fn).toContain('assertRoomsListLimit');
    expect(fn).toContain('LIMIT ${limit}');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit \?\? all\.length/);
  });

  it('listSessions SQL no longer dumps academy.sessions without a limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/academy-service.ts'), 'utf8');
    const start = src.indexOf('async listSessions(');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('async startSession(', start));
    expect(fn).toContain('assertSessionsListLimit');
    expect(fn).toContain('LIMIT ${limit}');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit \?\? all\.length/);
  });

  it('listSeasons SQL no longer dumps academy.tournament_seasons without a limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/academy-service.ts'), 'utf8');
    const start = src.indexOf('async listSeasons(');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('async setSeasonStatus(', start));
    expect(fn).toContain('assertSeasonsSqlListLimit');
    expect(fn).toContain('LIMIT ${limit}');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit \?\? all\.length/);
    expect(fn).not.toContain('assertSeasonPageLimit');
  });

  it('listOpenResidencies SQL no longer dumps residency_applications without a limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/academy-service.ts'), 'utf8');
    const start = src.indexOf('async listOpenResidencies(');
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf('private mapCertErr(', start));
    expect(fn).toContain('assertOpenResidenciesListLimit');
    expect(fn).toContain('LIMIT ${limit}');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit \?\? all\.length/);
  });

  it('router does not invent 50 when leftover lists omit limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-academy/src/router.ts'), 'utf8');

    const rooms = src.slice(src.indexOf('rooms: scopedProcedure'), src.indexOf('room: scopedProcedure'));
    expect(rooms).toContain('limit: input?.limit');
    expect(rooms).not.toMatch(/input\?\.limit \?\? 50/);
    expect(rooms).not.toMatch(/\?\? 50/);
    expect(rooms).not.toMatch(/\?\? 100/);

    const room = src.slice(src.indexOf('room: scopedProcedure'), src.indexOf('session: scopedProcedure'));
    expect(room).toContain('limit: input.limit');
    expect(room).not.toMatch(/input\.limit \?\? 50/);
    expect(room).not.toMatch(/\?\? 50/);
    expect(room).not.toMatch(/\?\? 100/);

    const open = src.slice(src.indexOf('openResidencies: scopedProcedure'), src.indexOf('decideResidency:'));
    expect(open).toContain('limit: input?.limit');
    expect(open).not.toMatch(/input\?\.limit \?\? 50/);
    expect(open).not.toMatch(/\?\? 50/);
    expect(open).not.toMatch(/\?\? 100/);

    const seasons = src.slice(src.indexOf('seasons: scopedProcedure'), src.indexOf('season: scopedProcedure'));
    expect(seasons).toContain('limit: input?.limit');
    expect(seasons).not.toMatch(/input\?\.limit \?\? 50/);
    expect(seasons).not.toMatch(/\?\? 50/);
    expect(seasons).not.toMatch(/\?\? 100/);

    expect(src).toContain('academy.rooms_list_limit_unset');
    expect(src).toContain('academy.sessions_list_limit_unset');
    expect(src).toContain('academy.seasons_list_limit_unset');
    expect(src).toContain('academy.open_residencies_list_limit_unset');
  });
});
