/**
 * Unit card — compose stack passes MATCHING_RULEBOOK_VERSION into svc-matching
 *
 * 1. Promise: host `.env` can pin the public rulebook version. Blank stays unpublished.
 * 2. Break: compose omitted the key — host pin never reached the container; GET /rulebook
 *    always saw env.ts default blank even when the owner set a version.
 * 3. Done bar: docker-compose.apps.yml svc-matching has
 *    MATCHING_RULEBOOK_VERSION: ${MATCHING_RULEBOOK_VERSION:-}
 *    Empty default. Compose does not invent a version string.
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-matching block only)
 * 6. RED: pin fails if the key is missing, duplicated, or defaults to a version.
 * 7. Collision: none — this pin only reads compose. No books, no rule text.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const RULEBOOK = 'MATCHING_RULEBOOK_VERSION';
const JOURNAL = 'MATCHING_JOURNAL_PATH';
const ENGINE = 'MATCHING_ENGINE_ENABLED';

function matchingComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const start = compose.indexOf('\n  svc-matching:');
  expect(start, 'svc-matching service missing from docker-compose.apps.yml').toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start + 1);
  const next = rest.search(/\n  svc-[a-z]+:/);
  return next === -1 ? rest : rest.slice(0, next);
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

describe('compose interpolates MATCHING_RULEBOOK_VERSION into svc-matching', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-matching/src/env.ts'), 'utf8');
  const block = matchingComposeBlock();

  it('env.ts defaults MATCHING_RULEBOOK_VERSION to blank (unpublished)', () => {
    expect(envTs).toMatch(/MATCHING_RULEBOOK_VERSION:\s*z\.string\(\)\.default\(''\)/);
  });

  it('svc-matching passes MATCHING_RULEBOOK_VERSION from the host with an empty default', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-matching/);
    expect(block, `${RULEBOOK} missing empty-default host pass-through`).toMatch(new RegExp(`${RULEBOOK}:\\s*\\$\\{${RULEBOOK}:-\\}`));
    expect(block).not.toMatch(new RegExp(`${RULEBOOK}:\\s*\\$\\{${RULEBOOK}:-.+\\}`));
    expect(block).not.toMatch(new RegExp(`${RULEBOOK}:\\s*['\"]?v?\\d`));
  });

  it('names MATCHING_RULEBOOK_VERSION once and does not restamp journal or kill-switch', () => {
    expect(countAssignments(compose, RULEBOOK), `${RULEBOOK} must appear once in compose`).toBe(1);
    expect(countAssignments(block, RULEBOOK), `${RULEBOOK} must appear once on svc-matching`).toBe(1);
    expect(countAssignments(block, JOURNAL), `${JOURNAL} must stay once on svc-matching`).toBe(1);
    expect(countAssignments(block, ENGINE), `${ENGINE} must stay once on svc-matching`).toBe(1);
    expect(block).toMatch(/MATCHING_JOURNAL_PATH:\s*\$\{MATCHING_JOURNAL_PATH:-\/data\/matching\/engine_journal\.ndjson\}/);
    expect(block).toMatch(/MATCHING_ENGINE_ENABLED:\s*\$\{MATCHING_ENGINE_ENABLED:-true\}/);
  });
});
