/**
 * Unit card — compose stack passes NOTIFY_VERIFY_TTL_MINUTES into svc-notify
 *
 * 1. Promise: host `.env` can pin how long a verify code lives
 *    (env.ts already defaults NOTIFY_VERIFY_TTL_MINUTES to 15).
 * 2. Break: compose booted notify without the name → operator TTL is a
 *    no-op and the container keeps the schema default forever.
 * 3. Done bar: docker-compose.apps.yml svc-notify has
 *    NOTIFY_VERIFY_TTL_MINUTES: ${NOTIFY_VERIFY_TTL_MINUTES:-15}.
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-notify block only)
 * 6. RED: pin fails if the line drops off the svc-notify service block
 *    or the compose default is raised above 15
 * 7. Collision: none — this pin only reads svc-notify
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');

function notifyServiceBlock(source: string): string {
  const match = source.match(/^  svc-notify:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-notify service block missing from docker-compose.apps.yml');
  return match[0];
}

const LINE = /NOTIFY_VERIFY_TTL_MINUTES:\s*\$\{NOTIFY_VERIFY_TTL_MINUTES:-15\}/;

describe('compose NOTIFY_VERIFY_TTL_MINUTES for svc-notify', () => {
  it('wires svc-notify NOTIFY_VERIFY_TTL_MINUTES from the host, unique once, default 15', () => {
    const block = notifyServiceBlock(readFileSync(COMPOSE, 'utf8'));
    expect(block).toMatch(/SERVICE_NAME:\s*svc-notify/);
    expect(block).toMatch(LINE);
    expect(block.match(/^\s+NOTIFY_VERIFY_TTL_MINUTES:\s*\$\{NOTIFY_VERIFY_TTL_MINUTES:-15\}\s*$/gm)).toHaveLength(1);
  });
});
