import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACCEPTED_INTERNAL_PREFERENCE_BPS, capInternalPreferenceBps } from './router.js';
import { describeSorRoutingPolicy, resolvesInternalPreferenceBps } from './sor-policy.js';

describe('describeSorRoutingPolicy — execution.sor honesty door', () => {
  it('states one ranking rule with capped 5 bps internal preference', () => {
    const p = describeSorRoutingPolicy();
    expect(p.acceptedInternalPreferenceBps).toBe(ACCEPTED_INTERNAL_PREFERENCE_BPS);
    expect(p.preferenceCappedAtAccepted).toBe(true);
    expect(p.worseInternalStillLoses).toBe(true);
    expect(p.rankingUsesEffectivePrice).toBe(true);
    expect(p.incompleteCostRefused).toBe(true);
    expect(p.zeroWeightUnscoredLatency).toBe(true);
    expect(p.noSecondRankingRule).toBe(true);
    expect(p.inventsVenuePreference).toBe(false);
    expect(p.inventsDefaultSpread).toBe(false);
  });

  it('cannot raise the house thumb above the accepted ceiling', () => {
    expect(resolvesInternalPreferenceBps()).toBe(ACCEPTED_INTERNAL_PREFERENCE_BPS);
    expect(resolvesInternalPreferenceBps(undefined)).toBe(ACCEPTED_INTERNAL_PREFERENCE_BPS);
    expect(resolvesInternalPreferenceBps(10_000)).toBe(capInternalPreferenceBps(10_000));
    expect(resolvesInternalPreferenceBps(0)).toBe(0);
  });
});

describe('sor-policy public door — package export seal', () => {
  it('index re-exports sor-policy', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgIndex = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(pkgIndex).toMatch(/sor-policy/);
  });
});
