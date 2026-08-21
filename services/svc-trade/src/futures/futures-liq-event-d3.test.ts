/**
 * Unit card — liquidation positionUpdated does not invent D3 or next funding
 * 1. Promise: tick-stores liquidated event uses stored liq_price / null mark, no ladder bps
 * 2. Break: event fills maintenanceBps from DEFAULT_FUTURES_LADDER_POLICY
 * 3. Done bar: source has no DEFAULT ladder, no maintenanceBps, no nextFundingTimestamp
 * 4. Class N
 * 5. Paths: svc-trade/src/futures/tick-stores.ts
 * 6. RED: maintenanceBps: or DEFAULT_FUTURES_LADDER_POLICY
 * 7. Collision: none — new file only
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'tick-stores.ts'), 'utf8');

describe('liquidation positionUpdated does not invent D3', () => {
  it('does not import DEFAULT_FUTURES_LADDER_POLICY or emit maintenanceBps / nextFunding', () => {
    expect(src).not.toMatch(/DEFAULT_FUTURES_LADDER_POLICY/);
    expect(src).not.toMatch(/maintenanceBps\s*:/);
    expect(src).not.toMatch(/nextFundingTimestamp/);
  });

  it('liquidated mark stays null rather than an invented mid', () => {
    expect(src).toMatch(/markPrice:\s*null/);
  });
});
