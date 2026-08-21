/**
 * Unit card — tRPC does not invent a second futures money door
 * 1. Promise: positions / live leverage / funding ticks stay REST-only
 * 2. Break: tRPC grows openPosition/setLeverage that skip REST refuses
 * 3. Done bar: router.ts has no positions procedure and no setLeverage
 * 4. Class N
 * 5. Paths: svc-trade/src/router.ts
 * 6. RED: router({ positions: or setLeverage:
 * 7. Collision: #1903 planner MM; #1881 D3 skip
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const routerSource = readFileSync(join(here, 'router.ts'), 'utf8');

describe('tRPC does not grow a second futures money door', () => {
  it('does not mount positions, setLeverage, or a funding-rate procedure', () => {
    expect(routerSource).not.toMatch(/\bpositions\s*:/);
    expect(routerSource).not.toMatch(/\bsetLeverage\s*:/);
    expect(routerSource).not.toMatch(/\bfundingRate\s*:/);
    expect(routerSource).not.toMatch(/\bopenPosition\s*:/);
    expect(routerSource).not.toMatch(/\bclosePosition\s*:/);
  });

  it('still mounts the spot order door so the pin is not vacuous', () => {
    expect(routerSource).toMatch(/orders:\s*router\(/);
    expect(routerSource).toMatch(/createTradeRouter\(/);
  });
});
