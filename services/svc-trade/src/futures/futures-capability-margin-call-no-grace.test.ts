/**
 * Unit card — CCXT matrix does not advertise a margin-call grace clock
 * 1. Promise: fetchPositionMarginCall notes say never invents; no graceExpiresAt
 * 2. Break: matrix claims a grace timer or setLeverage as supported
 * 3. Done bar: no graceExpiresAt; setLeverage and setMarginMode stay refuse
 * 4. Class N
 * 5. Paths: svc-trade/src/ccxt-capability-matrix.ts
 * 6. RED: graceExpiresAt in notes, or setLeverage kind supported
 * 7. Collision: none — REST/host pins are other files; this pins the bot matrix
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'ccxt-capability-matrix.ts'), 'utf8');

describe('CCXT matrix does not invent futures grace or live re-leverage', () => {
  it('fetchPositionMarginCall does not mention graceExpiresAt', () => {
    expect(src).toMatch(/fetchPositionMarginCall/);
    expect(src).not.toMatch(/graceExpiresAt/);
  });

  it('setLeverage and setMarginMode stay refuse', () => {
    expect(src).toMatch(/route\('setLeverage',\s*'refuse'/);
    expect(src).toMatch(/route\('setMarginMode',\s*'refuse'/);
  });
});
