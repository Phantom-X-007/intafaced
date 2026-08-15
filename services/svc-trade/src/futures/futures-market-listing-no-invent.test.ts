/**
 * Unit card — fetchMarkets must not invent perp contract or funding fields
 * 1. Promise: presentCcxtMarket hard-nulls contractSize and leverage; no funding quote
 * 2. Break: listing copies 1 as contractSize or puts fundingRate / nextFunding on the market
 * 3. Done bar: those fields are null or absent on the presenter
 * 4. Class N
 * 5. Paths: svc-trade/src/public-rest.ts
 * 6. RED: contractSize: '1' or fundingRate: inside presentCcxtMarket
 * 7. Collision: none — #1930 pins presentTicker 24h; this pins the market listing
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'public-rest.ts'), 'utf8');
const presenter = src.match(/export function presentCcxtMarket[\s\S]*?^}/m)?.[0] ?? '';

describe('listed markets do not invent perp contract or funding fields', () => {
  it('extracts presentCcxtMarket', () => {
    expect(presenter).toMatch(/export function presentCcxtMarket/);
  });

  it('hard-nulls contractSize, settle, expiry, and leverage limits', () => {
    expect(presenter).toMatch(/contractSize:\s*null/);
    expect(presenter).toMatch(/settle:\s*null/);
    expect(presenter).toMatch(/expiry:\s*null/);
    expect(presenter).toMatch(/leverage:\s*\{\s*min:\s*null[\s\S]*max:\s*null/);
  });

  it('does not attach a funding quote to the listing', () => {
    expect(presenter).not.toMatch(/fundingRate/);
    expect(presenter).not.toMatch(/nextFundingTimestamp/);
    expect(presenter).not.toMatch(/indexPrice/);
  });
});
