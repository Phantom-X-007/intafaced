/**
 * Unit card — live host does not inject placeholder D3 ladder into jobs
 * 1. Promise: startFuturesJobs omits ladderPolicy until owner names D3 rungs
 * 2. Break: index.ts passes DEFAULT_FUTURES_LADDER_POLICY or a maintenanceBps number
 * 3. Done bar: source has neither; omitted policy stays skip (skipped_d3_unset)
 * 4. Class N
 * 5. Paths: svc-trade/src/index.ts
 * 6. RED: ladderPolicy: DEFAULT_FUTURES_LADDER_POLICY
 * 7. Collision: none — jobs.ts already pins the tick; this pins the live host
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('live host does not invent D3 ladder numbers', () => {
  it('does not import DEFAULT_FUTURES_LADDER_POLICY', () => {
    expect(indexSource).not.toMatch(/DEFAULT_FUTURES_LADDER_POLICY/);
  });

  it('startFuturesJobs omits ladderPolicy and maintenanceBps', () => {
    expect(indexSource).toMatch(/startFuturesJobs\(/);
    expect(indexSource).not.toMatch(/startFuturesJobs\([\s\S]{0,1500}ladderPolicy:/);
    expect(indexSource).not.toMatch(/startFuturesJobs\([\s\S]{0,1500}maintenanceBps:/);
  });
});
