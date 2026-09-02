/**
 * Unit card — versioned public rulebook (M00)
 *
 * 1. Promise: blank MATCHING_RULEBOOK_VERSION is unpublished; claims refuse.
 *    A set value is the version string only — no invented rule text.
 * 2. Break: blank would advertise best execution / certified venue; a set
 *    version would invent fees/haircuts/rules.
 * 3. Done bar: unpublished → matching.rulebook_unpublished; published GET
 *    view is { published, version }; bestExecutionClaim / certifiedVenueClaim
 *    refuse unpublished; a version is not evidence (still refuse).
 * 4. Class N
 * 5. Paths: services/svc-matching/src/rulebook.ts
 */
import { describe, expect, it } from 'vitest';
import {
  BEST_EXECUTION_UNPROVEN,
  CERTIFIED_VENUE_UNPROVEN,
  RULEBOOK_UNPUBLISHED,
  bestExecutionClaim,
  certifiedVenueClaim,
  presentRulebook,
  readRulebook,
} from './rulebook.js';

describe('readRulebook', () => {
  it('treats missing, blank, and whitespace as unpublished', () => {
    expect(readRulebook(undefined)).toEqual({ published: false });
    expect(readRulebook(null)).toEqual({ published: false });
    expect(readRulebook('')).toEqual({ published: false });
    expect(readRulebook('   ')).toEqual({ published: false });
  });

  it('returns the trimmed version string only', () => {
    expect(readRulebook('  ptx-m00.v1  ')).toEqual({ published: true, version: 'ptx-m00.v1' });
  });
});

describe('presentRulebook', () => {
  it('unpublished view carries matching.rulebook_unpublished and no rule text', () => {
    const view = presentRulebook({ published: false });
    expect(view).toEqual({
      published: false,
      version: null,
      rejected: { code: RULEBOOK_UNPUBLISHED, message: RULEBOOK_UNPUBLISHED },
    });
    expect(JSON.stringify(view)).not.toMatch(/fee|haircut|best execution|certified/i);
  });

  it('published view is the version string only', () => {
    const view = presentRulebook({ published: true, version: 'ptx-m00.v1' });
    expect(view).toEqual({ published: true, version: 'ptx-m00.v1' });
    expect(Object.keys(view).sort()).toEqual(['published', 'version']);
    expect(JSON.stringify(view)).not.toMatch(/fee|haircut|spread|bps|rule text/i);
  });
});

describe('bestExecutionClaim / certifiedVenueClaim', () => {
  it('refuse unpublished with matching.rulebook_unpublished', () => {
    const unpublished = readRulebook('');
    expect(bestExecutionClaim(unpublished)).toEqual({
      allowed: false,
      rejected: { code: RULEBOOK_UNPUBLISHED, message: RULEBOOK_UNPUBLISHED },
    });
    expect(certifiedVenueClaim(unpublished)).toEqual({
      allowed: false,
      rejected: { code: RULEBOOK_UNPUBLISHED, message: RULEBOOK_UNPUBLISHED },
    });
  });

  it('a version string is not best-execution or certified-venue evidence', () => {
    const published = readRulebook('ptx-m00.v1');
    expect(bestExecutionClaim(published)).toEqual({
      allowed: false,
      rejected: { code: BEST_EXECUTION_UNPROVEN, message: BEST_EXECUTION_UNPROVEN },
    });
    expect(certifiedVenueClaim(published)).toEqual({
      allowed: false,
      rejected: { code: CERTIFIED_VENUE_UNPROVEN, message: CERTIFIED_VENUE_UNPROVEN },
    });
  });
});
