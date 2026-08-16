/**
 * Unit card — compose stack passes crew capacity, season, and engine timeout into svc-blueprint
 *
 * 1. Promise: host `.env` can pin BLUEPRINT_ENGINE_TIMEOUT_MS,
 *    BLUEPRINT_CREW_CAPACITY, BLUEPRINT_MENTOR_SHORTLIST_SIZE, and
 *    BLUEPRINT_SEASON (env.ts already declares them).
 * 2. Break: compose booted blueprint with engine mode/url and empty card
 *    renderer but none of these names → operator crew/season/timeout pin is a
 *    no-op and the container always uses schema defaults.
 * 3. Done bar: docker-compose.apps.yml svc-blueprint has
 *    BLUEPRINT_ENGINE_TIMEOUT_MS: ${BLUEPRINT_ENGINE_TIMEOUT_MS:-20000}
 *    BLUEPRINT_CREW_CAPACITY: ${BLUEPRINT_CREW_CAPACITY:-6}
 *    BLUEPRINT_MENTOR_SHORTLIST_SIZE: ${BLUEPRINT_MENTOR_SHORTLIST_SIZE:-3}
 *    BLUEPRINT_SEASON: ${BLUEPRINT_SEASON:-1}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-blueprint block only)
 * 6. RED: pin fails if a unique key drops, is duplicated, or defaults drift
 * 7. Collision: ENGINE_MODE / ENGINE_URL / CARD_RENDERER_URL — this pin does
 *    not restamp them. Does not invent a rasterizer URL or API key. Does not
 *    change engine mode from mock.
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

const KEYS = [
  { name: TIMEOUT, fallback: '20000', envDefault: '20_000' },
  { name: CAPACITY, fallback: '6', envDefault: '6' },
  { name: SHORTLIST, fallback: '3', envDefault: '3' },
  { name: SEASON, fallback: '1', envDefault: '1' },
] as const;

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

  it('env.ts still declares the flags this pin tracks (defaults 20000 / 6 / 3 / 1)', () => {
    for (const key of KEYS) {
      expect(envTs).toMatch(new RegExp(`${key.name}:[\\s\\S]{0,200}?\\.default\\(\\s*${key.envDefault}\\s*\\)`));
    }
  });

  it('compose svc-blueprint block passes unique keys once with env.ts defaults', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-blueprint/);
    for (const key of KEYS) {
      expect(block, `${key.name} missing from svc-blueprint compose environment`).toMatch(
        new RegExp(`${key.name}:\\s*\\$\\{${key.name}:-${key.fallback}\\}`),
      );
    }
  });

  it('names each key once in compose (no duplicate assignments)', () => {
    for (const key of KEYS) {
      expect(countAssignments(compose, key.name), `${key.name} must appear once`).toBe(1);
      expect(countAssignments(block, key.name), `${key.name} must appear once on svc-blueprint`).toBe(1);
    }
  });

  it('does not restamp engine mode/url or card renderer, or invent rasterizer/API key', () => {
    expect(block).toMatch(/BLUEPRINT_ENGINE_MODE:\s*\$\{BLUEPRINT_ENGINE_MODE:-mock\}/);
    expect(block).toMatch(/BLUEPRINT_ENGINE_URL:\s*\$\{BLUEPRINT_ENGINE_URL:-http:\/\/host\.docker\.internal:4108\}/);
    expect(block).toMatch(/BLUEPRINT_CARD_RENDERER_URL:\s*\$\{BLUEPRINT_CARD_RENDERER_URL:-\}/);
    expect(block).not.toMatch(/BLUEPRINT_ENGINE_MODE:\s*\$\{BLUEPRINT_ENGINE_MODE:-http\}/);
    expect(block).not.toMatch(/BLUEPRINT_ENGINE_API_KEY:/);
    expect(block).not.toMatch(/BLUEPRINT_CARD_RENDERER_API_KEY:/);
    expect(block).not.toMatch(/BLUEPRINT_CARD_RENDERER_TIMEOUT_MS:/);
  });
});
