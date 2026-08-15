/**
 * Unit card — private REST margin-call door does not invent a grace clock
 * 1. Promise: GET /positions/:id/margin-call sends the presenter body as-is
 * 2. Break: route maps graceExpiresAt or retryAfter onto the 200
 * 3. Done bar: private-rest.ts has no graceExpiresAt; 200 is reply.send(call)
 * 4. Class N
 * 5. Paths: svc-trade/src/private-rest.ts
 * 6. RED: graceExpiresAt: on the GET margin-call handler
 * 7. Collision: none — #1924 pins transport; #1928 pins index.ts host
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'private-rest.ts'), 'utf8');

describe('private REST margin-call door does not invent grace', () => {
  it('does not mention graceExpiresAt', () => {
    expect(src).toMatch(/\/api\/v1\/positions\/:id\/margin-call/);
    expect(src).not.toMatch(/graceExpiresAt/);
  });

  it('200 sends the host call body without wrapping extras', () => {
    expect(src).toMatch(/return reply\.code\(200\)\.send\(call\)/);
  });
});
