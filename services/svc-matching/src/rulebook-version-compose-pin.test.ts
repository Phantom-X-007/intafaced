/**
 * Unit card — compose passes MATCHING_RULEBOOK_VERSION empty (R-A7)
 *
 * 1. Promise: host `.env` can pin the public rulebook version; compose does
 *    not invent a string. Unset / empty stays unpublished.
 * 2. Break: matching compose omitted the key → container never sees a host
 *    pin; a non-empty default would advertise a version nobody published.
 * 3. Done bar: docker-compose.apps.yml svc-matching has
 *    MATCHING_RULEBOOK_VERSION: ${MATCHING_RULEBOOK_VERSION:-}
 *    and that empty default is the same blank GET /rulebook treats as unpublished.
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-matching block) + env.ts + rulebook.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const VERSION = 'MATCHING_RULEBOOK_VERSION';
const EMPTY_PASS = `${VERSION}: \${${VERSION}:-}`;

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

/** Compose `${VAR:-}` with no host value interpolates to empty string. */
function composeEmptyDefault(raw: string | undefined): string {
  return raw ?? '';
}

describe('compose passes MATCHING_RULEBOOK_VERSION empty into svc-matching', () => {
  const envTs = readFileSync(join(ROOT, 'services/svc-matching/src/env.ts'), 'utf8');
  const rulebookTs = readFileSync(join(ROOT, 'services/svc-matching/src/rulebook.ts'), 'utf8');
  const block = matchingComposeBlock();

  it('env.ts defaults MATCHING_RULEBOOK_VERSION to empty (unpublished)', () => {
    expect(envTs).toMatch(/MATCHING_RULEBOOK_VERSION:\s*z\.string\(\)\.default\(''\)/);
  });

  it('svc-matching compose line is empty pass-through — no invented version', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-matching/);
    expect(block, `${VERSION} missing empty pass-through`).toContain(EMPTY_PASS);
    expect(block).toMatch(new RegExp(`${VERSION}:\\s*\\$\\{${VERSION}:-\\}`));
    expect(block).not.toMatch(new RegExp(`${VERSION}:\\s*\\$\\{${VERSION}:-.+\\}`));
    expect(block).not.toMatch(/MATCHING_RULEBOOK_VERSION:\s*['"]?(v1|latest|ptx-m00)/i);
    expect(countAssignments(block, VERSION), `${VERSION} must appear once on svc-matching`).toBe(1);
  });

  it('compose/env without version is still unpublished', () => {
    const interpolated = composeEmptyDefault(undefined);
    expect(interpolated).toBe('');
    expect(rulebookTs).toMatch(/if \(version\.length === 0\) return \{ published: false \}/);
    expect(rulebookTs).toMatch(/RULEBOOK_UNPUBLISHED = 'matching\.rulebook_unpublished'/);
    expect(rulebookTs).toMatch(/Blank is unpublished/);
  });
});
