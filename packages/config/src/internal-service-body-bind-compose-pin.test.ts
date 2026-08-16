/**
 * Unit card — compose stack passes INTERNAL_SERVICE_BODY_BIND via *internal-secret
 *
 * 1. Promise: host `.env` can pin S2S body-bind mode
 *    (internalServiceEnvSchema already defaults accept-both).
 * 2. Break: compose booted *internal-secret with SECRET only → operator pin
 *    is a no-op and every container keeps the schema-only default forever.
 * 3. Done bar: docker-compose.apps.yml `x-internal-secret` has
 *    INTERNAL_SERVICE_BODY_BIND: ${INTERNAL_SERVICE_BODY_BIND:-accept-both}.
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (`x-internal-secret` only)
 * 6. RED: pin fails if the line drops, is duplicated in the anchor, or the
 *    compose default is require
 * 7. Collision: INTERNAL_SERVICE_SECRET — this pin does not restamp it
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');
const ENV_SRC = resolve(import.meta.dirname, './env.ts');

function internalSecretAnchor(source: string): string {
  const match = source.match(/^x-internal-secret: &internal-secret\n(?: .*\n)*/m);
  if (!match) throw new Error('x-internal-secret anchor missing from docker-compose.apps.yml');
  return match[0];
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

const LINE = /^\s+INTERNAL_SERVICE_BODY_BIND:\s*\$\{INTERNAL_SERVICE_BODY_BIND:-accept-both\}\s*$/gm;

describe('compose INTERNAL_SERVICE_BODY_BIND via *internal-secret', () => {
  const compose = readFileSync(COMPOSE, 'utf8');
  const envSrc = readFileSync(ENV_SRC, 'utf8');
  const anchor = internalSecretAnchor(compose);

  it('internalServiceEnvSchema still defaults INTERNAL_SERVICE_BODY_BIND to accept-both', () => {
    expect(envSrc).toMatch(/INTERNAL_SERVICE_BODY_BIND:\s*z\.enum\(\['accept-both', 'require'\]\)\.default\('accept-both'\)/);
  });

  it('wires the anchor from the host, unique once, default accept-both', () => {
    expect(anchor).toMatch(/INTERNAL_SERVICE_SECRET:\s*\$\{INTERNAL_SERVICE_SECRET:\?missing — copy \.env\.example to \.env/);
    expect(anchor.match(LINE)).toHaveLength(1);
    expect(countAssignments(anchor, 'INTERNAL_SERVICE_BODY_BIND')).toBe(1);
    expect(countAssignments(anchor, 'INTERNAL_SERVICE_SECRET')).toBe(1);
    expect(anchor).not.toMatch(/INTERNAL_SERVICE_BODY_BIND:.*:-require/);
    expect(countAssignments(compose, 'INTERNAL_SERVICE_BODY_BIND')).toBe(1);
  });
});
