/**
 * Unit card — compose stack passes EDGE_BODY_LIMIT_BYTES into svc-edge
 *
 * 1. Promise: host `.env` EDGE_BODY_LIMIT_BYTES reaches the container
 *    (env.ts already defaults 1048576 / 1 MiB).
 * 2. Break: compose booted edge with rate-limit flags but no body cap →
 *    operator JSON payload tighten from host `.env` is a no-op.
 * 3. Done bar: docker-compose.apps.yml svc-edge has
 *    EDGE_BODY_LIMIT_BYTES: ${EDGE_BODY_LIMIT_BYTES:-1048576}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-edge block only)
 * 6. RED: pin fails if the unique key drops, compose default drifts from env.ts,
 *    EDGE_TRUST_PROXY appears, or EDGE_RATE_LIMIT_* / DEFAULT_REGION / JWT
 *    lines are restamped
 * 7. Collision: rate-limit-compose-flags-pin.test.ts — this pin does not
 *    restamp EDGE_RATE_LIMIT_* / DEFAULT_REGION / JWT secrets
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function edgeServiceBlock(source: string): string {
  const match = source.match(/^  svc-edge:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-edge service block missing from docker-compose.apps.yml');
  return match[0];
}

const BODY_LIMIT = /^\s+EDGE_BODY_LIMIT_BYTES:\s*\$\{EDGE_BODY_LIMIT_BYTES:-1048576\}\s*$/gm;
const RATE_ENABLED = /^\s+EDGE_RATE_LIMIT_ENABLED:\s*\$\{EDGE_RATE_LIMIT_ENABLED:-true\}\s*$/gm;
const RATE_MAX = /^\s+EDGE_RATE_LIMIT_MAX:\s*\$\{EDGE_RATE_LIMIT_MAX:\?missing — copy \.env\.example to \.env\}\s*$/gm;
const RATE_WINDOW = /^\s+EDGE_RATE_LIMIT_WINDOW_MS:\s*\$\{EDGE_RATE_LIMIT_WINDOW_MS:-60000\}\s*$/gm;
const DEFAULT_REGION = /^\s+DEFAULT_REGION:\s*\$\{DEFAULT_REGION:-XX\}\s*$/gm;
const JWT_ACCESS = /^\s+JWT_ACCESS_SECRET:\s*\$\{JWT_ACCESS_SECRET:\?missing — copy \.env\.example to \.env\}\s*$/gm;
const JWT_ISSUER = /^\s+JWT_ISSUER:\s*\$\{JWT_ISSUER:-intafaced\}\s*$/gm;
const JWT_AUDIENCE = /^\s+JWT_AUDIENCE:\s*\$\{JWT_AUDIENCE:-intafaced\.api\}\s*$/gm;

describe('compose body-limit for svc-edge', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-edge/src/env.ts'), 'utf8');
  const block = edgeServiceBlock(compose);

  it('env.ts still defaults EDGE_BODY_LIMIT_BYTES to 1048576 matching compose', () => {
    const raw = /EDGE_BODY_LIMIT_BYTES:[\s\S]*?\.default\(([\d_]+)\)/.exec(envTs)?.[1];
    expect(raw?.replaceAll('_', '')).toBe('1048576');
  });

  it('compose svc-edge block passes EDGE_BODY_LIMIT_BYTES once with default 1048576', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-edge/);
    expect(block.match(BODY_LIMIT)).toHaveLength(1);
  });

  it('does not set EDGE_TRUST_PROXY or restamp EDGE_RATE_LIMIT / DEFAULT_REGION / JWT secrets', () => {
    expect(block).not.toMatch(/EDGE_TRUST_PROXY:/);
    expect(block.match(RATE_ENABLED)).toHaveLength(1);
    expect(block.match(RATE_MAX)).toHaveLength(1);
    expect(block.match(RATE_WINDOW)).toHaveLength(1);
    expect(block.match(DEFAULT_REGION)).toHaveLength(1);
    expect(block.match(JWT_ACCESS)).toHaveLength(1);
    expect(block.match(JWT_ISSUER)).toHaveLength(1);
    expect(block.match(JWT_AUDIENCE)).toHaveLength(1);
  });
});
