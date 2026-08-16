/**
 * Unit card — compose stack passes IDENTITY_MAX_SUB_ACCOUNTS into svc-identity
 *
 * 1. Promise: host `.env` can pin or lower the live-partition cap
 *    (env.ts already defaults IDENTITY_MAX_SUB_ACCOUNTS to 25).
 * 2. Break: compose booted identity without the name → operator cap is a
 *    no-op and the container keeps the schema default forever.
 * 3. Done bar: docker-compose.apps.yml svc-identity has
 *    IDENTITY_MAX_SUB_ACCOUNTS: ${IDENTITY_MAX_SUB_ACCOUNTS:-25}.
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-identity block only)
 * 6. RED: pin fails if the line drops off the svc-identity service block
 *    or the compose default is raised above 25
 * 7. Collision: none — this pin only reads svc-identity
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');

function identityServiceBlock(source: string): string {
  const match = source.match(/^  svc-identity:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-identity service block missing from docker-compose.apps.yml');
  return match[0];
}

const LINE = /IDENTITY_MAX_SUB_ACCOUNTS:\s*\$\{IDENTITY_MAX_SUB_ACCOUNTS:-25\}/;

describe('compose IDENTITY_MAX_SUB_ACCOUNTS for svc-identity', () => {
  it('wires svc-identity IDENTITY_MAX_SUB_ACCOUNTS from the host, unique once, default 25', () => {
    const block = identityServiceBlock(readFileSync(COMPOSE, 'utf8'));
    expect(block).toMatch(/SERVICE_NAME:\s*svc-identity/);
    expect(block).toMatch(LINE);
    expect(block.match(/^\s+IDENTITY_MAX_SUB_ACCOUNTS:\s*\$\{IDENTITY_MAX_SUB_ACCOUNTS:-25\}\s*$/gm)).toHaveLength(1);
  });
});
