/**
 * Unit card — GET ticker does not invent 24h rollups
 * 1. Promise: presentTicker leaves high/low/vwap/volume/percentage null
 * 2. Break: fill high from last print or invent a 24h window
 * 3. Done bar: those fields are hard-null; last/close may be the print
 * 4. Class N
 * 5. Paths: svc-trade/src/public-rest.ts
 * 6. RED: high: lastPrice
 * 7. Collision: none — public-rest.test.ts asserts two nulls at runtime; this pins source
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'public-rest.ts'), 'utf8');

describe('presentTicker does not invent 24h rollups', () => {
  it('hard-nulls high, low, vwap, volumes, and percentage', () => {
    expect(src).toMatch(/export function presentTicker/);
    expect(src).toMatch(/high:\s*null/);
    expect(src).toMatch(/low:\s*null/);
    expect(src).toMatch(/vwap:\s*null/);
    expect(src).toMatch(/baseVolume:\s*null/);
    expect(src).toMatch(/quoteVolume:\s*null/);
    expect(src).toMatch(/percentage:\s*null/);
    expect(src).toMatch(/change:\s*null/);
    expect(src).toMatch(/average:\s*null/);
  });

  it('does not copy last print into high/low', () => {
    expect(src).not.toMatch(/high:\s*lastPrice/);
    expect(src).not.toMatch(/low:\s*lastPrice/);
  });
});
