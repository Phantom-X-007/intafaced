/**
 * Unit card — live host mounts presentFuturesJobsHealth on /health
 * 1. Promise: /health occupancy follows env + parsed market count, never the decimal
 * 2. Break: /health omits futuresJobs so ops infer a live schedule from ok:true
 * 3. Done bar: index.ts calls presentFuturesJobsHealth with env + count + configured boolean
 * 4. Class N
 * 5. Paths: svc-trade/src/index.ts
 * 6. RED: no futuresJobs: presentFuturesJobsHealth
 * 7. Collision: #1878 compose pin (does not touch index.ts)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('futures jobs occupancy on /health', () => {
  it('live host mounts presentFuturesJobsHealth on /health', () => {
    expect(indexSource).toMatch(/futuresJobs:\s*presentFuturesJobsHealth\(/);
    expect(indexSource).toMatch(/enabled:\s*env\.TRADE_FUTURES_JOBS_ENABLED/);
    expect(indexSource).toMatch(/fundingMarketCount:\s*fundingMarketIds\.length/);
    expect(indexSource).toMatch(/fundingMaxAbsRateConfigured:\s*fundingMaxAbsRate\s*!==\s*null/);
    expect(indexSource).toMatch(/venueMarkConfigured:\s*venueMarkConfigured\s*!=\s*null/);
  });

  it('does not put the |rate| decimal or market UUID list on /health', () => {
    const health = /app\.get\('\/health'[\s\S]*?\n\}\)\);/.exec(indexSource)?.[0] ?? '';
    expect(health).toContain('presentFuturesJobsHealth');
    expect(health).not.toMatch(/fundingMaxAbsRate:\s*fundingMaxAbsRate/);
    expect(health).not.toMatch(/fundingMarketIds:/);
    expect(health).not.toMatch(/venueId:/);
  });

  it('boot log does not echo TRADE_VENUE_MARK_VENUE', () => {
    expect(indexSource).toMatch(/venueMark:\s*venueMarkConfigured \? \{ configured: true, symbolCount:/);
    expect(indexSource).not.toMatch(/venueId:\s*venueMarkConfigured\.venueId/);
  });
});
