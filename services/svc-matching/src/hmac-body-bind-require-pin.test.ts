/**
 * Unit card — production matching mutate mount hardcodes HMAC bodyBind require
 *
 * 1. Promise: live POST/DELETE orders 401 unbound v1 HMAC even while fleet
 *    compose stays INTERNAL_SERVICE_BODY_BIND:-accept-both (pin tests are law).
 * 2. Break: index.ts passed bodyBind: env.INTERNAL_SERVICE_BODY_BIND, so the
 *    compose default kept accept-both on the engine.
 * 3. Done bar: services/svc-matching/src/index.ts registerRoutes mount is
 *    bodyBind: 'require' — not the env. Callers already send
 *    serviceAuthHeadersForBody (trade / execution / FIX).
 * 4. Class N
 * 5. Paths: services/svc-matching/src/index.ts (production mount only)
 * 6. RED: origin/main passing bodyBind: env.INTERNAL_SERVICE_BODY_BIND
 * 7. Collision: none — does not touch docker-compose.apps.yml or config pins.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');

describe('production matching mutate mount hardcodes HMAC bodyBind require', () => {
  it('registerRoutes bodyBind is require, not INTERNAL_SERVICE_BODY_BIND', () => {
    expect(indexSrc).toMatch(/registerRoutes\(/);
    expect(indexSrc).toMatch(/bodyBind:\s*'require'/);
    expect(indexSrc).not.toMatch(/bodyBind:\s*env\.INTERNAL_SERVICE_BODY_BIND/);
  });
});
