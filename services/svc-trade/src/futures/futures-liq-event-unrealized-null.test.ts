/**
 * Unit card — liquidated positionUpdated does not invent unrealized PnL
 * 1. Promise: tick-stores liquidated event hard-nulls unrealizedPnl and markPrice
 * 2. Break: fill unrealized from entry vs an invented mark
 * 3. Done bar: unrealizedPnl: null and markPrice: null on that publish
 * 4. Class N
 * 5. Paths: svc-trade/src/futures/tick-stores.ts
 * 6. RED: unrealizedPnl: formatAmount(…)
 * 7. Collision: none — #1921 pins D3 bps / nextFunding; this pins PnL fields
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'tick-stores.ts'), 'utf8');

describe('liquidated positionUpdated does not invent unrealized PnL', () => {
  it('hard-nulls unrealizedPnl and markPrice on the liquidated publish', () => {
    expect(src).toMatch(/status:\s*'liquidated'/);
    expect(src).toMatch(/unrealizedPnl:\s*null/);
    expect(src).toMatch(/markPrice:\s*null/);
  });

  it('does not format unrealized from a mark', () => {
    expect(src).not.toMatch(/unrealizedPnl:\s*formatAmount/);
  });
});
