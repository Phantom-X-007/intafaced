/**
 * Unit card — compose stack passes BLUEPRINT_CARD_RENDERER_TIMEOUT_MS into svc-blueprint
 *
 * 1. Promise: host `.env` BLUEPRINT_CARD_RENDERER_TIMEOUT_MS reaches the
 *    container (env.ts already defaults 10000).
 * 2. Break: compose booted blueprint with engine mode/url/timeout, crew/season,
 *    and empty card renderer URL but no PNG timeout → operator cannot shorten
 *    a hung rasterizer from `.env`.
 * 3. Done bar: docker-compose.apps.yml svc-blueprint has
 *    BLUEPRINT_CARD_RENDERER_TIMEOUT_MS: ${BLUEPRINT_CARD_RENDERER_TIMEOUT_MS:-10000}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-blueprint block only)
 * 6. RED: pin fails if the unique key drops, is duplicated, or default drifts
 * 7. Collision: compose-crew-capacity-season-timeout-pin.test.ts — this pin
 *    does not restamp BLUEPRINT_ENGINE_*, crew/mentor/season, or
 *    BLUEPRINT_CARD_RENDERER_URL. Does not invent a rasterizer URL or API key.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const KEY = 'BLUEPRINT_CARD_RENDERER_TIMEOUT_MS';
const TIMEOUT = /^\s+BLUEPRINT_CARD_RENDERER_TIMEOUT_MS:\s*\$\{BLUEPRINT_CARD_RENDERER_TIMEOUT_MS:-10000\}\s*$/gm;
const ENGINE_MODE = /^\s+BLUEPRINT_ENGINE_MODE:\s*\$\{BLUEPRINT_ENGINE_MODE:-mock\}\s*$/gm;
const ENGINE_URL = /^\s+BLUEPRINT_ENGINE_URL:\s*\$\{BLUEPRINT_ENGINE_URL:-http:\/\/host\.docker\.internal:4108\}\s*$/gm;
const ENGINE_TIMEOUT = /^\s+BLUEPRINT_ENGINE_TIMEOUT_MS:\s*\$\{BLUEPRINT_ENGINE_TIMEOUT_MS:-20000\}\s*$/gm;
const CREW = /^\s+BLUEPRINT_CREW_CAPACITY:\s*\$\{BLUEPRINT_CREW_CAPACITY:-6\}\s*$/gm;
const MENTOR = /^\s+BLUEPRINT_MENTOR_SHORTLIST_SIZE:\s*\$\{BLUEPRINT_MENTOR_SHORTLIST_SIZE:-3\}\s*$/gm;
const SEASON = /^\s+BLUEPRINT_SEASON:\s*\$\{BLUEPRINT_SEASON:-1\}\s*$/gm;
const RENDERER_URL = /^\s+BLUEPRINT_CARD_RENDERER_URL:\s*\$\{BLUEPRINT_CARD_RENDERER_URL:-\}\s*$/gm;

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

describe('compose passes card-renderer timeout into svc-blueprint', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-blueprint/src/env.ts'), 'utf8');
  const block = blueprintComposeBlock();

  it('env.ts still defaults BLUEPRINT_CARD_RENDERER_TIMEOUT_MS to 10000 matching compose', () => {
    const raw = /BLUEPRINT_CARD_RENDERER_TIMEOUT_MS:[\s\S]*?\.default\(([\d_]+)\)/.exec(envTs)?.[1];
    expect(raw?.replaceAll('_', '')).toBe('10000');
  });

  it('compose svc-blueprint block passes the key once with default 10000', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-blueprint/);
    expect(block.match(TIMEOUT)).toHaveLength(1);
  });

  it('names the key once in compose (no duplicate assignments)', () => {
    expect(countAssignments(compose, KEY), `${KEY} must appear once`).toBe(1);
    expect(countAssignments(block, KEY), `${KEY} must appear once on svc-blueprint`).toBe(1);
  });

  it('does not restamp engine/crew/season or invent a rasterizer URL or API key', () => {
    expect(block.match(ENGINE_MODE)).toHaveLength(1);
    expect(block.match(ENGINE_URL)).toHaveLength(1);
    expect(block.match(ENGINE_TIMEOUT)).toHaveLength(1);
    expect(block.match(CREW)).toHaveLength(1);
    expect(block.match(MENTOR)).toHaveLength(1);
    expect(block.match(SEASON)).toHaveLength(1);
    expect(block.match(RENDERER_URL)).toHaveLength(1);
    expect(block).not.toMatch(/BLUEPRINT_ENGINE_MODE:\s*\$\{BLUEPRINT_ENGINE_MODE:-http\}/);
    expect(block).not.toMatch(/BLUEPRINT_ENGINE_API_KEY:/);
    expect(block).not.toMatch(/BLUEPRINT_CARD_RENDERER_API_KEY:/);
  });
});
