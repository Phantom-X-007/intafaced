/**
 * Unit card — live isolated re-leverage is mounted (not 501)
 * 1. Promise: POST /positions/leverage is a real door posting ledger add/release
 * 2. Break: delete setLeverage, remount derivativesNotSupported, or list 501 gap
 * 3. Done bar: futuresLiveReleverageMounted; FUTURES_HONEST_GAPS empty
 * 4. Class N
 * 5. Paths: futures/position-service.ts · private-rest.ts · index.ts
 * 6. RED: setLeverage missing, 501 helper remounted, or gap.live_releverage_501
 *
 * Money-path (10×→5× ledger delta, amounts strings) lives in
 * position-service.test.ts — this file is the fail-first pin, not a second
 * createTestDatabase (drops serialize and starve peer afterAll hooks).
 */

import { describe, expect, it } from 'vitest';
import { FUTURES_HONEST_GAPS, futuresLiveReleverageMounted } from './mount-vs-tracker.js';

describe('live re-leverage fail-first pins', () => {
  it('501 helper is not mounted; live path is wired; residual gap is closed', () => {
    expect(futuresLiveReleverageMounted()).toBe(true);
    expect(FUTURES_HONEST_GAPS).toEqual([]);
    expect(FUTURES_HONEST_GAPS).not.toContain('gap.live_releverage_501');
  });
});
