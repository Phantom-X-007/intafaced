/**
 * Unit card — live host passes algo flags into capabilities
 * 1. Promise: GET /capabilities notes.algo follows TRADE_ALGO_* env, not omitted defaults
 * 2. Break: #1832 left registerPublicRest without algo; a live jobs ON would still advertise off
 * 3. Done bar: index.ts passes createEnabled/jobsEnabled from env; jobs stay default OFF
 * 4. Class N
 * 5. Paths: svc-trade/src/index.ts
 * 6. RED: registerPublicRest call has no algo: { createEnabled: env.TRADE_ALGO_ENABLED
 * 7. Collision: none — #1831 merged
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('algo env passthrough into registerPublicRest', () => {
  it('live host passes TRADE_ALGO_ENABLED and TRADE_ALGO_JOBS_ENABLED into capabilities', () => {
    expect(indexSource).toMatch(/algo:\s*\{[\s\S]*createEnabled:\s*env\.TRADE_ALGO_ENABLED/);
    expect(indexSource).toMatch(/algo:\s*\{[\s\S]*jobsEnabled:\s*env\.TRADE_ALGO_JOBS_ENABLED/);
  });
});
