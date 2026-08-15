/**
 * Unit card — /health futuresJobs does not echo D3 ladder numbers
 * 1. Promise: occupancy booleans only; no maintenanceBps / rung table
 * 2. Break: presentFuturesJobsHealth adds maintenanceBps from DEFAULT policy
 * 3. Done bar: type and presenter have no maintenanceBps, no ladder, no 8h
 * 4. Class N
 * 5. Paths: svc-trade/src/futures/futures-jobs-health.ts
 * 6. RED: maintenanceBps: in the presenter return
 * 7. Collision: #1918 host D3 pin (index.ts) — this file does not read index.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'futures-jobs-health.ts'), 'utf8');

describe('/health futuresJobs does not invent D3', () => {
  it('presenter has no maintenanceBps, ladder, or 8h interval echo', () => {
    expect(src).not.toMatch(/maintenanceBps/);
    expect(src).not.toMatch(/DEFAULT_FUTURES_LADDER_POLICY/);
    expect(src).not.toMatch(/28_?800_?000|28800000/);
    expect(src).toMatch(/fundingIntervalConfigured/);
  });
});
