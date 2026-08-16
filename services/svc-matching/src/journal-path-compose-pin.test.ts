/**
 * Unit card — compose stack passes MATCHING_JOURNAL_PATH into svc-matching
 *
 * 1. Promise: host `.env` can pin the journal file the engine replays.
 * 2. Break: compose hardcoded `/data/matching/engine_journal.ndjson` with no
 *    `${}` — a host pin never reached the container.
 * 3. Done bar: docker-compose.apps.yml svc-matching has
 *    MATCHING_JOURNAL_PATH: ${MATCHING_JOURNAL_PATH:-/data/matching/engine_journal.ndjson}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-matching block only)
 * 6. RED: pin fails if the key is missing, duplicated, defaults elsewhere, or
 *    the matchingjournal:/data/matching volume mount drops
 * 7. Collision: none — this pin only reads compose. No books, no journal format.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const JOURNAL = 'MATCHING_JOURNAL_PATH';
const DEFAULT_PATH = '/data/matching/engine_journal.ndjson';

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

describe('compose interpolates MATCHING_JOURNAL_PATH into svc-matching', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const block = matchingComposeBlock();

  it('svc-matching passes MATCHING_JOURNAL_PATH from the host with the volume default', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-matching/);
    expect(block, `${JOURNAL} missing host pass-through with volume default`).toMatch(
      new RegExp(`${JOURNAL}:\\s*\\$\\{${JOURNAL}:-${DEFAULT_PATH.replaceAll('/', '\\/')}\\}`),
    );
    expect(block).not.toMatch(new RegExp(`${JOURNAL}:\\s*${DEFAULT_PATH.replaceAll('/', '\\/')}\\s*$`, 'm'));
  });

  it('names MATCHING_JOURNAL_PATH once and keeps matchingjournal:/data/matching', () => {
    expect(countAssignments(compose, JOURNAL), `${JOURNAL} must appear once in compose`).toBe(1);
    expect(countAssignments(block, JOURNAL), `${JOURNAL} must appear once on svc-matching`).toBe(1);
    expect(block).toMatch(/-\s*matchingjournal:\/data\/matching\s*$/m);
  });
});
