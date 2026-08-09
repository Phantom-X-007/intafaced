/**
 * crewMemberCreated → lobby route remains unmounted (ADR D-S-13 residual).
 * A green "Class B close" would lie — this pin fails if index boots a subscribe.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
const crewSrc = readFileSync(join(here, 'crew-events.ts'), 'utf8');

describe('crew-events bus mount honesty', () => {
  it('index.ts does not import or subscribe crew-events', () => {
    expect(indexSrc).not.toMatch(/from\s+['"]\.\/crew-events/);
    expect(indexSrc).not.toMatch(/subscribeCrewMemberCreated/);
    expect(indexSrc).toMatch(/crew-events\.ts.*unmounted|remains unmounted/i);
  });

  it('crew-events header still says NOT WIRED (not a Class B close)', () => {
    expect(crewSrc).toMatch(/NOT WIRED/);
    expect(crewSrc).not.toMatch(/Class B close\)\s*$/m);
  });
});
