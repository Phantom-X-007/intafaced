import { afterEach, describe, expect, it } from 'vitest';
import {
  SCREENING_ENFORCED_ENVS,
  UnscreenedJurisdictionError,
  activeScreeningList,
  assertScreeningConfigured,
  checkAccess,
  isRegionBlocked,
  screeningStatus,
} from './jurisdiction.js';
import { EMPTY_SCREENING_LIST, ScreeningListError, parseScreeningList } from './screening.js';

/**
 * THE GAP THIS CLOSES.
 *
 * The screening mechanism worked and screened nothing, and — this is the part
 * that mattered — nothing could tell. "We checked a sanctions list and you are
 * not on it" and "we have never had a sanctions list" produced the same
 * `allowed: true`, with the same code and the same reason string, at every call
 * site, in every test, and in every log line.
 *
 * These tests are about that indistinguishability. They are NOT about who
 * should be blocked. Every region code below is a placeholder chosen because it
 * cannot be mistaken for a real jurisdiction: AA, ZY and QQ are unassigned in
 * ISO-3166. Nothing in this repo names a real sanctioned country, because the
 * list is counsel's to write and an engineer's guess at it is a liability in
 * both directions.
 */

/** A stand-in for what counsel eventually supplies. Not a real list. */
const POPULATED = parseScreeningList('AA:placeholder programme,ZY', 'test-fixture-not-a-real-list');

describe('parsing the configured list', () => {
  it('treats absent, empty and whitespace-only as UNCONFIGURED, not as clear', () => {
    for (const raw of [undefined, '', '   ', ' , , ']) {
      const list = parseScreeningList(raw);
      expect(list.configured, JSON.stringify(raw)).toBe(false);
      expect(list.regions).toEqual([]);
    }
  });

  it('parses codes with and without reasons, and upper-cases them', () => {
    const list = parseScreeningList('aa:because,ZY');
    expect(list.configured).toBe(true);
    expect(list.regions.map((r) => r.region)).toEqual(['AA', 'ZY']);
    expect(list.regions[0]?.reason).toBe('because');
    // No reason supplied still produces one — a refusal with no explanation is
    // useless to the user and to the auditor.
    expect(list.regions[1]?.reason).toContain('ZY');
  });

  it('records provenance so a decision can say where the list came from', () => {
    expect(parseScreeningList('AA', 'counsel-memo-ref').source).toBe('counsel-memo-ref');
    expect(parseScreeningList('AA').source).toContain('INTAFACED_SANCTIONS_REGIONS');
  });

  /**
   * A dropped entry is a region we believe we are blocking and are not — the
   * original bug, reintroduced one typo at a time. It must be loud.
   */
  it('throws on a malformed entry rather than silently skipping it', () => {
    expect(() => parseScreeningList('AA,NOTACODE')).toThrow(ScreeningListError);
  });

  it('reports every problem at once, so a bad list is fixed in one pass', () => {
    try {
      parseScreeningList('TOOLONG,1,AA,AA');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ScreeningListError);
      expect((e as ScreeningListError).issues).toHaveLength(3);
    }
  });

  it('rejects a duplicate region — one entry means one reason to maintain', () => {
    expect(() => parseScreeningList('AA:first,aa:second')).toThrow(ScreeningListError);
  });
});

describe('the state is observable — "screened and clear" vs "screened nothing"', () => {
  it('says NOT CONFIGURED rather than reporting a comfortable zero', () => {
    const status = screeningStatus(EMPTY_SCREENING_LIST);
    expect(status.configured).toBe(false);
    expect(status.blockedRegions).toEqual([]);
    expect(status.summary).toContain('NOT CONFIGURED');
    // The summary must not be readable as a clean bill of health.
    expect(status.summary).toContain('nothing has been screened');
  });

  it('names the regions and the provenance once a list exists', () => {
    const status = screeningStatus(POPULATED);
    expect(status.configured).toBe(true);
    expect(status.blockedRegions).toEqual(['AA', 'ZY']);
    expect(status.summary).toContain('test-fixture-not-a-real-list');
  });

  /**
   * The heart of it. Two ALLOWED decisions, same caller, same region, that used
   * to be byte-identical and are now distinguishable.
   */
  it('carries the difference on an ALLOWED decision, where it used to be invisible', () => {
    const query = { module: 'dex', plane: 'protocol', region: 'QQ', kycTier: 'none' } as const;

    const unscreened = checkAccess({ ...query, screening: EMPTY_SCREENING_LIST });
    const screened = checkAccess({ ...query, screening: POPULATED });

    // Same outcome...
    expect(unscreened.allowed).toBe(true);
    expect(screened.allowed).toBe(true);
    expect(unscreened.code).toBe(screened.code);

    // ...different, and legible, provenance. This is what was impossible.
    expect(unscreened.screening.listConfigured).toBe(false);
    expect(unscreened.screening.blockedRegionCount).toBe(0);
    expect(screened.screening.listConfigured).toBe(true);
    expect(screened.screening.blockedRegionCount).toBe(2);
    expect(screened.screening.source).toBe('test-fixture-not-a-real-list');
  });

  it('carries provenance on denials too, including the plane-unsupported early return', () => {
    const d = checkAccess({ module: 'pay', plane: 'protocol', region: 'QQ', kycTier: 'full', screening: POPULATED });
    expect(d.code).toBe('denied.plane_unsupported');
    expect(d.screening.listConfigured).toBe(true);
  });
});

describe('a populated list actually screens', () => {
  it('refuses a listed region on the PROTOCOL plane, KYC gate or not', () => {
    const d = checkAccess({ module: 'dex', plane: 'protocol', region: 'AA', kycTier: 'none', screening: POPULATED });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('denied.region_blocked');
    expect(d.reason).toBe('placeholder programme');
  });

  it('refuses a listed region on the CUSTODIAL plane even at the top tier', () => {
    const d = checkAccess({ module: 'trade', plane: 'fiat', region: 'AA', kycTier: 'institutional', screening: POPULATED });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('denied.region_blocked');
  });

  it('refuses regardless of the case the region arrives in', () => {
    const d = checkAccess({ module: 'dex', plane: 'protocol', region: 'zy', kycTier: 'none', screening: POPULATED });
    expect(d.code).toBe('denied.region_blocked');
  });

  it('allows a region that is NOT on the list', () => {
    const d = checkAccess({ module: 'dex', plane: 'protocol', region: 'QQ', kycTier: 'none', screening: POPULATED });
    expect(d.allowed).toBe(true);
  });

  it('leaves the rest of the matrix alone — an unlisted region keeps its tier gate', () => {
    const d = checkAccess({ module: 'bank', plane: 'fiat', region: 'DE', kycTier: 'basic', screening: POPULATED });
    expect(d.code).toBe('denied.kyc_required');
  });

  it('isRegionBlocked answers from the configured list, not only the matrix', () => {
    expect(isRegionBlocked('AA', POPULATED)).toBe(true);
    expect(isRegionBlocked('QQ', POPULATED)).toBe(false);
    expect(isRegionBlocked('AA', EMPTY_SCREENING_LIST)).toBe(false);
  });
});

/**
 * §22 + §24 Lane A together. Screening runs BEFORE the permissionless
 * short-circuit; the KYC gate runs after it and is skipped. Losing that
 * ordering turns "zero-KYC but still sanctions screened" from a property into a
 * slogan, so it gets tests in both directions.
 */
describe('ordering: sanctions screening survives the permissionless short-circuit, KYC does not', () => {
  it('still resolves a non-listed region to allowed.permissionless AFTER screening', () => {
    const d = checkAccess({ module: 'dex', plane: 'protocol', region: 'QQ', kycTier: 'none', screening: POPULATED });
    expect(d.code).toBe('allowed.permissionless');
    // And it says a list was consulted on the way there.
    expect(d.screening.listConfigured).toBe(true);
  });

  it('never returns allowed.permissionless for a listed region, at any tier', () => {
    for (const kycTier of ['none', 'basic', 'full', 'institutional'] as const) {
      const d = checkAccess({ module: 'dex', plane: 'protocol', region: 'AA', kycTier, screening: POPULATED });
      expect(d.code, kycTier).toBe('denied.region_blocked');
    }
  });

  it('the protocol module itself keeps its §22 guarantee for a non-listed region', () => {
    const d = checkAccess({ module: 'protocol', plane: 'protocol', region: 'XX', kycTier: 'none', screening: POPULATED });
    expect(d.code).toBe('allowed.permissionless');
  });
});

describe('boot guard — production-like postures refuse to start unscreened', () => {
  it.each(SCREENING_ENFORCED_ENVS)('throws for APP_ENV=%s with no list', (appEnv) => {
    expect(() => assertScreeningConfigured({ APP_ENV: appEnv })).toThrow(UnscreenedJurisdictionError);
  });

  it('names the env and points at the fix rather than just failing', () => {
    try {
      assertScreeningConfigured({ APP_ENV: 'prod' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnscreenedJurisdictionError);
      const message = (e as Error).message;
      expect(message).toContain('INTAFACED_SANCTIONS_REGIONS');
      // It must send the reader to counsel, not invite them to invent a list.
      expect(message).toContain('COMPLIANCE DECISION');
    }
  });

  it('boots in prod once a list is supplied', () => {
    const status = assertScreeningConfigured({ APP_ENV: 'prod', INTAFACED_SANCTIONS_REGIONS: 'AA:placeholder' });
    expect(status.configured).toBe(true);
    expect(status.blockedRegions).toEqual(['AA']);
  });

  it('keeps development frictionless — dev and test boot empty and report the gap', () => {
    for (const appEnv of ['dev', 'test']) {
      const status = assertScreeningConfigured({ APP_ENV: appEnv });
      expect(status.configured, appEnv).toBe(false);
      expect(status.summary, appEnv).toContain('NOT CONFIGURED');
    }
  });

  it('defaults to dev when APP_ENV is unset, rather than failing every local run', () => {
    expect(() => assertScreeningConfigured({})).not.toThrow();
  });

  it('a whitespace-only variable does not satisfy the guard', () => {
    expect(() => assertScreeningConfigured({ APP_ENV: 'prod', INTAFACED_SANCTIONS_REGIONS: '  ,  ' })).toThrow(UnscreenedJurisdictionError);
  });
});

describe('the process-wide list is read from the environment', () => {
  const original = process.env.INTAFACED_SANCTIONS_REGIONS;
  afterEach(() => {
    if (original === undefined) delete process.env.INTAFACED_SANCTIONS_REGIONS;
    else process.env.INTAFACED_SANCTIONS_REGIONS = original;
  });

  it('picks up a change with no reset hook for anyone to forget', () => {
    expect(activeScreeningList().configured).toBe(false);

    process.env.INTAFACED_SANCTIONS_REGIONS = 'AA:placeholder';
    expect(activeScreeningList().configured).toBe(true);

    // And `checkAccess` with no explicit list honours it — this is the path
    // every production call site takes.
    expect(checkAccess({ module: 'dex', plane: 'protocol', region: 'AA', kycTier: 'none' }).code).toBe('denied.region_blocked');

    delete process.env.INTAFACED_SANCTIONS_REGIONS;
    expect(activeScreeningList().configured).toBe(false);
  });
});

/**
 * The list SHIPS EMPTY, deliberately. Asserted so that nobody can merge a
 * guessed sanctions list into the repo without this failing and a human having
 * to say who signed it off.
 */
describe('what ships', () => {
  it('ships no blocklist — the mechanism is armed, the contents are counsel’s', () => {
    const shipped = activeScreeningList({});
    expect(shipped.configured).toBe(false);
    expect(shipped.regions).toEqual([]);
  });
});
