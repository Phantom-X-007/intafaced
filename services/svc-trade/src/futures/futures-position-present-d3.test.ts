/**
 * Unit card — GET /positions wire does not invent D3 maintenance or next funding
 * 1. Promise: presentPosition leaves maintenanceMargin null; list is not a valuation
 * 2. Break: listOpen attaches a mark extra or maintenanceMargin from DEFAULT ladder
 * 3. Done bar: source has maintenanceMargin: null; listOpen calls presentPosition(row)
 * 4. Class N
 * 5. Paths: svc-trade/src/futures/position-service.ts
 * 6. RED: maintenanceMargin: formatAmount(…) or listOpen presentPosition(row, extras)
 * 7. Collision: #1918 host D3 pin (index.ts) — this file does not read index.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'position-service.ts'), 'utf8');

describe('position present does not invent D3 or next funding', () => {
  it('does not import DEFAULT_FUTURES_LADDER_POLICY', () => {
    expect(src).not.toMatch(/DEFAULT_FUTURES_LADDER_POLICY/);
  });

  it('presentPosition hard-nulls maintenanceMargin and does not emit nextFundingTimestamp', () => {
    expect(src).toMatch(/maintenanceMargin:\s*null/);
    expect(src).not.toMatch(/nextFundingTimestamp/);
    expect(src).not.toMatch(/maintenanceBps\s*:/);
  });

  it('listOpen presents rows without a mark extra', () => {
    expect(src).toMatch(/rows\.map\(\(row\) => presentPosition\(row\)\)/);
    expect(src).not.toMatch(/listOpen[\s\S]{0,900}presentPosition\(row,\s*\{/);
  });
});
