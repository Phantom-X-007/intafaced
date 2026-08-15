/**
 * Unit card — GET /positions does not invent unrealized PnL or 24h percentage
 * 1. Promise: presentPosition leaves unrealizedPnl, percentage, contractSize null
 * 2. Break: fill unrealized from mark×size or percentage from a window
 * 3. Done bar: those three fields are hard-null; no mark arithmetic in presentPosition
 * 4. Class N
 * 5. Paths: svc-trade/src/futures/position-service.ts
 * 6. RED: unrealizedPnl: formatAmount(…)
 * 7. Collision: none — #1919 pins maintenanceMargin; this pins unrealized/percentage
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'position-service.ts'), 'utf8');

describe('position present does not invent unrealized PnL', () => {
  it('hard-nulls unrealizedPnl, percentage, and contractSize', () => {
    expect(src).toMatch(/unrealizedPnl:\s*null/);
    expect(src).toMatch(/percentage:\s*null/);
    expect(src).toMatch(/contractSize:\s*null/);
  });

  it('does not format unrealized from a mark extra', () => {
    expect(src).not.toMatch(/unrealizedPnl:\s*formatAmount/);
    expect(src).not.toMatch(/unrealizedPnl:\s*extras/);
  });
});
