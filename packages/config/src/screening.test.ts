import { afterEach, describe, expect, it } from 'vitest';
import {
  SCREENING_ENFORCED_ENVS,
  UnscreenedJurisdictionError,
  activeScreeningList,
  assertScreeningConfigured,
  businessBlocksFrom,
  checkAccess,
  isRegionBlocked,
  screeningStatus,
  type JurisdictionEntry,
} from './jurisdiction.js';
import { SCREENING_REVIEWED_EMPTY, ScreeningListError, UNSET_SCREENING_LIST, parseScreeningList } from './screening.js';

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
    const status = screeningStatus(UNSET_SCREENING_LIST);
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

    const unscreened = checkAccess({ ...query, screening: UNSET_SCREENING_LIST });
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
    expect(isRegionBlocked('AA', UNSET_SCREENING_LIST)).toBe(false);
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
 * TWO AUTHORITIES, AND NEITHER MAY VOUCH FOR THE OTHER.
 *
 * THE BUG. `MATRIX_SCREENING` turned every `blocked: true` entry in
 * `JURISDICTION_MATRIX` into a `ScreeningList` and `activeScreeningList` merged
 * it with the counsel-supplied one. `mergeScreeningLists` set `configured: true`
 * if EITHER side had anything, and `assertScreeningConfigured` gated on exactly
 * that flag.
 *
 * So one region blocked for a commercial reason — a licence we lack, a market we
 * have not opened, a placeholder somebody left — flipped the production boot
 * guard from "refuse to start" to "satisfied", with the sanctions list still
 * empty and nobody in counsel having supplied a thing. Business configuration,
 * edited in ordinary PRs by ordinary contributors, silently arming a legal
 * control. Latent only because the shipped matrix happens to contain no
 * `blocked: true` entry; live the first time anybody adds one.
 *
 * These tests use a SYNTHETIC matrix, because the shipped one has no blocked
 * entry and a rule about the blocked case that can only be exercised once
 * somebody adds one is a rule with no test.
 */
describe('a business block cannot satisfy the screening guard', () => {
  /** A commercially-blocked region. QQ is unassigned in ISO-3166. */
  const COMMERCIAL: readonly JurisdictionEntry[] = [
    { region: '*' },
    { region: 'QQ', blocked: true, reason: 'No licence in this market yet — commercial, not sanctions' },
  ];

  it('still blocks the region — nothing about the existing refusal is weakened', () => {
    const blocks = businessBlocksFrom(COMMERCIAL);
    expect(blocks.map((b) => b.region)).toEqual(['QQ']);
    expect(blocks[0]?.authority).toBe('business');
  });

  it('is NOT counted as screening coverage, however many there are', () => {
    const status = screeningStatus(UNSET_SCREENING_LIST, businessBlocksFrom(COMMERCIAL));

    // The whole finding, as an assertion.
    expect(status.configured).toBe(false);
    expect(status.declaration).toBe('unset');

    // Reported, and reported as a different number under a different name.
    expect(status.blockedRegions).toEqual([]);
    expect(status.businessBlockedRegions).toEqual(['QQ']);
  });

  it('says out loud that the business blocks are not screening', () => {
    const status = screeningStatus(UNSET_SCREENING_LIST, businessBlocksFrom(COMMERCIAL));
    expect(status.summary).toContain('NOT CONFIGURED');
    expect(status.summary).toContain('not screening');
  });

  /**
   * The guard itself. It reads the screening list's own `declaration` and the
   * matrix is not an input to it — so no matrix content can change this outcome.
   */
  it('leaves the prod boot guard refusing', () => {
    expect(() => assertScreeningConfigured({ APP_ENV: 'prod' })).toThrow(UnscreenedJurisdictionError);
  });

  it('a business block does not become a ScreenedRegion, so it cannot be merged back in by accident', () => {
    const blocks = businessBlocksFrom(COMMERCIAL);
    // Types keep them apart; this asserts the runtime tag agrees, which is what
    // a log or an audit row actually reads.
    for (const b of blocks) expect(b.authority).not.toBe('screening');
  });

  /**
   * Ambiguity fails closed. A `blocked: true` entry with no reason at all —
   * nobody can tell whether it was commercial or legal — refuses in BOTH
   * directions: the region stays blocked, and the guard stays unsatisfied.
   */
  it('an unexplained block refuses in both directions rather than being read as either', () => {
    const unexplained: readonly JurisdictionEntry[] = [{ region: '*' }, { region: 'QQ', blocked: true }];
    const blocks = businessBlocksFrom(unexplained);

    expect(blocks).toHaveLength(1); // still refuses the region
    const status = screeningStatus(UNSET_SCREENING_LIST, blocks);
    expect(status.configured).toBe(false); // and still does not satisfy screening
  });
});

/**
 * WHICH AUTHORITY REFUSED, on the decision itself.
 *
 * A legal control and a commercial choice produce the same `denied.region_blocked`,
 * and they are not the same fact. An auditor who cannot tell them apart cannot
 * tell whether a refusal that disappeared was a market opening or a sanctions
 * control being tuned away while somebody adjusted something else.
 */
describe('every refusal records which authority made it', () => {
  it('attributes a screening-list refusal to the screening authority', () => {
    const d = checkAccess({ module: 'dex', plane: 'protocol', region: 'AA', kycTier: 'none', screening: POPULATED });
    expect(d.code).toBe('denied.region_blocked');
    expect(d.blockedBy).toBe('screening');
  });

  it('leaves it absent when nothing refused', () => {
    const d = checkAccess({ module: 'dex', plane: 'protocol', region: 'QQ', kycTier: 'none', screening: POPULATED });
    expect(d.allowed).toBe(true);
    expect(d.blockedBy).toBeUndefined();
  });
});

/**
 * "REVIEWED, AND DELIBERATELY EMPTY" IS NOT "NOBODY HAS DONE THIS YET".
 *
 * Both screen zero regions. One is a conclusion somebody reached and signed;
 * the other is a gap. A platform that cannot record the first has only two
 * options once counsel answers "no regions" — lie by inventing an entry, or run
 * forever with a boot guard it cannot satisfy — and both are worse than a state.
 */
describe('the deliberately-empty list is a distinct, attributable state', () => {
  const ATTESTED = {
    APP_ENV: 'prod',
    INTAFACED_SANCTIONS_REGIONS: SCREENING_REVIEWED_EMPTY,
    INTAFACED_SANCTIONS_LIST_SOURCE: 'counsel-memo-placeholder-ref',
  };

  it('satisfies the boot guard when it is attributed', () => {
    const status = assertScreeningConfigured(ATTESTED);
    expect(status.declaration).toBe('reviewed-empty');
    expect(status.configured).toBe(true);
    expect(status.blockedRegions).toEqual([]);
  });

  it('REFUSES without attribution — an unsigned "none" is indistinguishable from silencing the guard', () => {
    expect(() => assertScreeningConfigured({ APP_ENV: 'prod', INTAFACED_SANCTIONS_REGIONS: SCREENING_REVIEWED_EMPTY })).toThrow(
      ScreeningListError,
    );
  });

  it('the refusal tells the reader that leaving it unset is the honest alternative', () => {
    try {
      parseScreeningList(SCREENING_REVIEWED_EMPTY);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ScreeningListError);
      expect((e as Error).message).toContain('leave INTAFACED_SANCTIONS_REGIONS unset');
    }
  });

  it('is a DIFFERENT state from unset, not merely a different summary', () => {
    const reviewed = parseScreeningList(SCREENING_REVIEWED_EMPTY, 'counsel-memo-placeholder-ref');
    expect(reviewed.declaration).toBe('reviewed-empty');
    expect(UNSET_SCREENING_LIST.declaration).toBe('unset');

    // Same zero regions. Different states. That is the entire point.
    expect(reviewed.regions).toEqual(UNSET_SCREENING_LIST.regions);
    expect(reviewed.declaration).not.toBe(UNSET_SCREENING_LIST.declaration);
  });

  it('names the authority in the summary rather than reading as a clean tick', () => {
    const status = screeningStatus(parseScreeningList(SCREENING_REVIEWED_EMPTY, 'counsel-memo-placeholder-ref'), []);
    expect(status.summary).toContain('DELIBERATELY EMPTY');
    expect(status.summary).toContain('counsel-memo-placeholder-ref');
    // It must not read as "we screened everyone and everyone is fine".
    expect(status.summary).toContain('recorded decision');
  });

  /**
   * The state reaches the decision, not just the dashboard. `listConfigured:
   * true` with a count of zero used to be unreachable; now it means something
   * specific, and a reader with only the boolean and the count cannot tell it
   * from a short list.
   */
  it('rides on every decision, so a zero count is legible', () => {
    const reviewed = parseScreeningList(SCREENING_REVIEWED_EMPTY, 'counsel-memo-placeholder-ref');
    const d = checkAccess({ module: 'dex', plane: 'protocol', region: 'QQ', kycTier: 'none', screening: reviewed });

    expect(d.allowed).toBe(true);
    expect(d.screening.listConfigured).toBe(true);
    expect(d.screening.blockedRegionCount).toBe(0);
    expect(d.screening.declaration).toBe('reviewed-empty');
  });

  it('an unset list still says unset on the decision', () => {
    const d = checkAccess({ module: 'dex', plane: 'protocol', region: 'QQ', kycTier: 'none', screening: UNSET_SCREENING_LIST });
    expect(d.screening.declaration).toBe('unset');
  });

  it('is case-insensitive, because config files are typed by people', () => {
    expect(parseScreeningList('NONE', 'ref').declaration).toBe('reviewed-empty');
    expect(parseScreeningList(' None ', 'ref').declaration).toBe('reviewed-empty');
  });

  /** It must be the WHOLE value — never a member of a list. */
  it('is not a list entry — "none,AA" is a malformed list, not an attestation', () => {
    expect(() => parseScreeningList('none,AA', 'ref')).toThrow(ScreeningListError);
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
    expect(shipped.declaration).toBe('unset');
    expect(shipped.regions).toEqual([]);
  });

  /**
   * And ships no business block either. If this fails, somebody added
   * `blocked: true` to the matrix — which is allowed, and is a commercial
   * decision — and this test is where they confirm they meant a commercial
   * block and not a sanctions one, which belongs in `screening.ts`.
   */
  it('ships no business block — and if one lands, it is a commercial decision, not a legal one', () => {
    expect(screeningStatus(UNSET_SCREENING_LIST).businessBlockedRegions).toEqual([]);
  });
});
