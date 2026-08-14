/**
 * Unit card — live host passes futures jobs flag into capabilities
 * 1. Promise: GET /capabilities notes.futures follows TRADE_FUTURES_JOBS_ENABLED
 * 2. Break: registerPublicRest omits futures; a live jobs ON would still advertise off
 * 3. Done bar: index.ts passes jobsEnabled from env; jobs stay default OFF
 * 4. Class N
 * 5. Paths: svc-trade/src/index.ts
 * 6. RED: registerPublicRest call has no futures: { jobsEnabled: env.TRADE_FUTURES_JOBS_ENABLED
 * 7. Collision: none — file-disjoint from #1863 private-rest leverage
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('futures jobs env passthrough into registerPublicRest', () => {
  it('live host passes TRADE_FUTURES_JOBS_ENABLED into capabilities', () => {
    expect(indexSource).toMatch(/futures:\s*\{[\s\S]*jobsEnabled:\s*env\.TRADE_FUTURES_JOBS_ENABLED/);
  });
});
