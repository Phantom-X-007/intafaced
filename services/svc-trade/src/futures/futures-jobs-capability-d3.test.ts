/**
 * Unit card — capabilities note has no D3 maintenance bps
 * 1. Promise: bots see ladderNumbers: d3_unset, never a maintenanceBps number
 * 2. Break: presentFuturesJobsCapabilityNote adds maintenanceBps from DEFAULT policy
 * 3. Done bar: source has ladderNumbers: 'd3_unset' and no maintenanceBps
 * 4. Class N
 * 5. Paths: svc-trade/src/futures/futures-jobs-capability.ts
 * 6. RED: maintenanceBps: in the presenter
 * 7. Collision: none — new file only
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'futures-jobs-capability.ts'), 'utf8');

describe('capabilities futures note does not invent D3 bps', () => {
  it('ladderNumbers stays d3_unset and maintenanceBps is absent', () => {
    expect(src).toMatch(/ladderNumbers:\s*'d3_unset'/);
    expect(src).not.toMatch(/maintenanceBps/);
    expect(src).not.toMatch(/DEFAULT_FUTURES_LADDER_POLICY/);
  });
});
