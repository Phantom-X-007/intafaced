/**
 * Unit card — compose stack passes crew capacity, season, and engine timeout into svc-blueprint
 *
 * 1. Promise: host `.env` can pin BLUEPRINT_ENGINE_TIMEOUT_MS (default 20000).
 *    BLUEPRINT_CREW_CAPACITY, BLUEPRINT_MENTOR_SHORTLIST_SIZE, and
 *    BLUEPRINT_SEASON are owner-published; blank stays refuse-closed.
 * 2. Break: compose `:-6` / `:-3` / `:-1` or env.ts `.default(6)` looks
 *    published when the operator never set a crew size / shortlist / season.
 * 3. Done bar: docker-compose.apps.yml svc-blueprint has
 *    BLUEPRINT_ENGINE_TIMEOUT_MS: ${BLUEPRINT_ENGINE_TIMEOUT_MS:-20000}
 *    BLUEPRINT_CREW_CAPACITY: ${BLUEPRINT_CREW_CAPACITY:-}
 *    BLUEPRINT_MENTOR_SHORTLIST_SIZE: ${BLUEPRINT_MENTOR_SHORTLIST_SIZE:-}
 *    BLUEPRINT_SEASON: ${BLUEPRINT_SEASON:-}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-blueprint block only)
 * 6. RED: pin fails if a unique key drops, is duplicated, timeout default
 *    drifts, or crew/mentor/season git-default 6 / 3 / 1
 * 7. Collision: ENGINE_MODE / ENGINE_URL / CARD_RENDERER_URL — this pin does
 *    not restamp them. Does not invent a rasterizer URL or API key. Does not
 *    invent engine mode mock.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const TIMEOUT = 'BLUEPRINT_ENGINE_TIMEOUT_MS';
const CAPACITY = 'BLUEPRINT_CREW_CAPACITY';
const SHORTLIST = 'BLUEPRINT_MENTOR_SHORTLIST_SIZE';
const SEASON = 'BLUEPRINT_SEASON';

const TIMEOUT_KEY = { name: TIMEOUT, fallback: '20000', envDefault: '20_000' } as const;
const OWNER_KEYS = [
  { name: CAPACITY, invented: '6' },
  { name: SHORTLIST, invented: '3' },
  { name: SEASON, invented: '1' },
] as const;
const KEYS = [TIMEOUT_KEY, ...OWNER_KEYS] as const;

function blueprintComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const start = compose.indexOf('\n  svc-blueprint:');
  expect(start, 'svc-blueprint service missing from docker-compose.apps.yml').toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start + 1);
  const next = rest.search(/\n  svc-[a-z]+:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

describe('compose passes crew capacity, season, and engine timeout into svc-blueprint', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-blueprint/src/env.ts'), 'utf8');
  const block = blueprintComposeBlock();

  it('env.ts still declares the flags this pin tracks (timeout default 20000; crew/mentor/season unpublished)', () => {
    expect(envTs).toMatch(new RegExp(`${TIMEOUT_KEY.name}:[\\s\\S]{0,200}?\\.default\\(\\s*${TIMEOUT_KEY.envDefault}\\s*\\)`));
    expect(envTs).not.toMatch(/BLUEPRINT_CREW_CAPACITY:[\s\S]{0,400}\.default\(6\)/);
    expect(envTs).not.toMatch(/BLUEPRINT_MENTOR_SHORTLIST_SIZE:[\s\S]{0,400}\.default\(3\)/);
    expect(envTs).not.toMatch(/BLUEPRINT_SEASON:[\s\S]{0,400}\.default\(1\)/);
    expect(envTs).toMatch(/BLUEPRINT_CREW_CAPACITY:\s*unpublishedInt\(2,\s*24\)/);
    expect(envTs).toMatch(/BLUEPRINT_MENTOR_SHORTLIST_SIZE:\s*unpublishedInt\(1,\s*10\)/);
    expect(envTs).toMatch(/BLUEPRINT_SEASON:\s*unpublishedInt\(1\)/);
  });

  it('compose svc-blueprint block passes timeout with default 20000; crew/mentor/season empty pass-through', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-blueprint/);
    expect(block, `${TIMEOUT} missing from svc-blueprint compose environment`).toMatch(
      new RegExp(`${TIMEOUT}:\\s*\\$\\{${TIMEOUT}:-${TIMEOUT_KEY.fallback}\\}`),
    );
    for (const key of OWNER_KEYS) {
      expect(block, `${key.name} missing from svc-blueprint compose environment`).toMatch(
        new RegExp(`${key.name}:\\s*\\$\\{${key.name}:-\\}`),
      );
      expect(block).not.toMatch(new RegExp(`${key.name}:-\\s*${key.invented}`));
    }
  });

  it('names each key once in compose (no duplicate assignments)', () => {
    for (const key of KEYS) {
      expect(countAssignments(compose, key.name), `${key.name} must appear once`).toBe(1);
      expect(countAssignments(block, key.name), `${key.name} must appear once on svc-blueprint`).toBe(1);
    }
  });

  it('does not restamp engine mode/url or card renderer, or invent rasterizer/API key', () => {
    expect(block).toMatch(/BLUEPRINT_ENGINE_MODE:\s*\$\{BLUEPRINT_ENGINE_MODE:-\}/);
    expect(block).toMatch(/BLUEPRINT_ENGINE_URL:\s*\$\{BLUEPRINT_ENGINE_URL:-http:\/\/host\.docker\.internal:4108\}/);
    expect(block).toMatch(/BLUEPRINT_CARD_RENDERER_URL:\s*\$\{BLUEPRINT_CARD_RENDERER_URL:-\}/);
    expect(block).not.toMatch(/BLUEPRINT_ENGINE_MODE:\s*\$\{BLUEPRINT_ENGINE_MODE:-mock\}/);
    expect(block).not.toMatch(/BLUEPRINT_ENGINE_MODE:\s*\$\{BLUEPRINT_ENGINE_MODE:-http\}/);
    expect(block).not.toMatch(/\bJWT_/);
  });
});
