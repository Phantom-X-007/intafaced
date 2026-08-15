/**
 * Unit card — fetchMarkets must not invent linear/inverse while settle is null
 * 1. Promise: presentCcxtMarket hard-nulls linear and inverse (settle stays null)
 * 2. Break: linear: isSpot ? null : true (invented USDT-margined book)
 * 3. Done bar: linear/inverse are null on the presenter; schema still nullable
 * 4. Class N
 * 5. Paths: svc-trade/src/public-rest.ts
 * 6. RED: linear: isSpot ? null : true
 * 7. Collision: none — #1939 pins contractSize/leverage; this pins contract type
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'public-rest.ts'), 'utf8');
const presenter = src.match(/export function presentCcxtMarket[\s\S]*?^}/m)?.[0] ?? '';

describe('listed markets do not invent linear/inverse without settle', () => {
  it('extracts presentCcxtMarket', () => {
    expect(presenter).toMatch(/export function presentCcxtMarket/);
  });

  it('hard-nulls linear and inverse instead of claiming a USDT-margined book', () => {
    expect(presenter).toMatch(/linear:\s*null/);
    expect(presenter).toMatch(/inverse:\s*null/);
    expect(presenter).toMatch(/settle:\s*null/);
    expect(presenter).not.toMatch(/linear:\s*isSpot \? null : true/);
    expect(presenter).not.toMatch(/inverse:\s*isSpot \? null : false/);
  });
});
