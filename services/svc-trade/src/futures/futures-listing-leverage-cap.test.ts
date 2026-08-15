/**
 * Unit card — fetchMarkets publishes DIRECTION §1 10× on futures only
 * 1. Promise: presentCcxtMarket sets leverage.max to DEFAULT_MAX_LEVERAGE for futures
 * 2. Break: max: null on futures, or copy 10 onto spot, or invent 20
 * 3. Done bar: futures ternary uses DEFAULT_MAX_LEVERAGE; spot/options stay null
 * 4. Class N
 * 5. Paths: svc-trade/src/public-rest.ts
 * 6. RED: leverage: { min: null, max: null } with no futures branch
 * 7. Collision: none — #1939 nulled leverage while 10× was treated as unpublished; P0-07 restored the cap
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'public-rest.ts'), 'utf8');
const presenter = src.match(/export function presentCcxtMarket[\s\S]*?^}/m)?.[0] ?? '';
const cap = readFileSync(join(here, 'initial-margin.ts'), 'utf8');

describe('listed futures publish the sealed 10× cap', () => {
  it('extracts presentCcxtMarket', () => {
    expect(presenter).toMatch(/export function presentCcxtMarket/);
  });

  it('uses DEFAULT_MAX_LEVERAGE only when kind is futures', () => {
    expect(cap).toMatch(/export const DEFAULT_MAX_LEVERAGE = '10'/);
    expect(src).toMatch(/import \{ DEFAULT_MAX_LEVERAGE \} from '\.\/futures\/initial-margin\.js'/);
    expect(presenter).toMatch(/max:\s*market\.kind === 'futures' \? DEFAULT_MAX_LEVERAGE : null/);
    expect(presenter).not.toMatch(/max:\s*'20'/);
  });
});
