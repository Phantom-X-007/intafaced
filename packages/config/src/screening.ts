/**
 * SANCTIONS / REGION SCREENING LIST — §24 Lane A, as configuration.
 *
 *   "Sanctions-screening on the hosted front-end per applicable law; the
 *    contracts themselves are permissionless infrastructure."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * `checkAccess` has always been able to refuse a region. Nothing has ever told
 * it which regions to refuse, so it refused none — and a decision that screened
 * nothing was byte-for-byte identical to a decision that screened a real list
 * and cleared you. Every call site, every test and every log line saw the same
 * `allowed`. The mechanism was green because it was empty.
 *
 * This file makes the two states different things:
 *
 *   `configured: false` → NO list was consulted. Not "clean", *unknown*.
 *   `configured: true`  → a list exists, and this region is not on it.
 *
 * and `assertScreeningConfigured` (jurisdiction.ts) refuses to let a
 * production-like process boot in the first state.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE DELIBERATELY DOES NOT CONTAIN
 *
 * A sanctions list. It ships empty and it stays empty until counsel supplies
 * one. Naming jurisdictions here would be an engineer drafting a legal control:
 * too few is a sanctions breach, too many is unlawful discrimination, and the
 * repo has no standing to be wrong in either direction. The MECHANISM is
 * engineering; the CONTENTS are a compliance decision with a named owner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONFIGURED SHAPE
 *
 *   INTAFACED_SANCTIONS_REGIONS
 *     Comma-separated. Each item is an ISO-3166 alpha-2 code, optionally
 *     followed by `:` and the reason an operator (or a refused user) should
 *     see. Whitespace around items is ignored; codes are case-insensitive.
 *
 *       INTAFACED_SANCTIONS_REGIONS="AA:UNSC resolution ref,BB:programme ref"
 *
 *     A reason is not required, but supply one. It is what the refusal says,
 *     what the audit log carries, and what tells the next operator whether an
 *     entry is still current or a leftover from a lifted programme.
 *
 *   INTAFACED_SANCTIONS_LIST_SOURCE
 *     Free-text provenance for the list above — the governance record, ticket,
 *     or published list revision it came from. Recorded on every screening
 *     decision so "who decided this, and when" is answerable from a log line
 *     rather than from someone's memory.
 *
 *       INTAFACED_SANCTIONS_LIST_SOURCE="counsel-memo-2026-08-01"
 *
 * A region can also be blocked by adding `blocked: true` to its
 * `JURISDICTION_MATRIX` entry. Both sources are honoured and both count as
 * "a list was consulted"; the env var exists so that supplying the list is a
 * config change at deploy time rather than a code change, a review and a
 * release. When counsel answers, nobody should have to open an editor.
 */

/** Env var holding the blocklist. See the header for the shape. */
export const SANCTIONS_REGIONS_ENV = 'INTAFACED_SANCTIONS_REGIONS';

/** Env var holding the list's provenance. */
export const SANCTIONS_SOURCE_ENV = 'INTAFACED_SANCTIONS_LIST_SOURCE';

/** Provenance string used when the blocklist comes from the matrix itself. */
export const MATRIX_SOURCE = 'JURISDICTION_MATRIX';

export interface ScreenedRegion {
  /** ISO-3166 alpha-2, upper-cased. */
  readonly region: string;
  /** Shown on refusal and carried in the audit log. */
  readonly reason: string;
  /** Where this entry came from — env var name, or `JURISDICTION_MATRIX`. */
  readonly source: string;
}

export interface ScreeningList {
  readonly regions: readonly ScreenedRegion[];
  /**
   * Was a real list consulted?
   *
   * The whole point of this file. `false` means nothing was screened — NOT that
   * the caller's region is clear. Never render this as a green tick.
   */
  readonly configured: boolean;
  /** Provenance, for logs and the operator dashboard. */
  readonly source: string;
}

/** The state before anyone supplies anything. Screens nothing, and says so. */
export const EMPTY_SCREENING_LIST: ScreeningList = {
  regions: [],
  configured: false,
  source: 'unconfigured',
};

export class ScreeningListError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[],
  ) {
    super(`${message}\n  - ${issues.join('\n  - ')}`);
    this.name = 'ScreeningListError';
  }
}

const REGION_CODE = /^[A-Za-z]{2}$/;

/**
 * Parse the env format into a list.
 *
 * Malformed entries throw rather than being skipped. A silently dropped entry
 * is a region we believe we are blocking and are not — which is the exact
 * failure this whole file exists to make impossible, reintroduced one typo at a
 * time. Every problem is reported at once so a bad list is fixed in one pass.
 */
export function parseScreeningList(raw: string | undefined, source?: string): ScreeningList {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return EMPTY_SCREENING_LIST;

  const provenance = source?.trim() || `env:${SANCTIONS_REGIONS_ENV}`;
  const issues: string[] = [];
  const seen = new Set<string>();
  const regions: ScreenedRegion[] = [];

  for (const item of trimmed.split(',')) {
    const entry = item.trim();
    if (entry === '') continue;

    const colon = entry.indexOf(':');
    const code = (colon === -1 ? entry : entry.slice(0, colon)).trim();
    const reason = (colon === -1 ? '' : entry.slice(colon + 1)).trim();

    if (!REGION_CODE.test(code)) {
      issues.push(`"${entry}" — expected an ISO-3166 alpha-2 code, optionally followed by ":reason"`);
      continue;
    }

    const upper = code.toUpperCase();
    if (seen.has(upper)) {
      issues.push(`"${upper}" listed more than once — one entry per region, so there is one reason to maintain`);
      continue;
    }

    seen.add(upper);
    regions.push({
      region: upper,
      reason: reason || `Not served in ${upper} (sanctions screening, §24 Lane A)`,
      source: provenance,
    });
  }

  if (issues.length > 0) {
    throw new ScreeningListError(`Invalid ${SANCTIONS_REGIONS_ENV}:`, issues);
  }

  // Reachable when the value is only commas and whitespace. That is somebody
  // meaning to supply a list and supplying nothing, so it is unconfigured — the
  // boot guard should treat it exactly like an absent variable.
  if (regions.length === 0) return EMPTY_SCREENING_LIST;

  return { regions, configured: true, source: provenance };
}

/**
 * Merge two lists. Used to fold `JURISDICTION_MATRIX` blocks in with the
 * env-supplied ones; `configured` is true if EITHER source supplied anything,
 * because either one means a real list was consulted.
 *
 * On a region present in both, the first list wins — callers pass the
 * env-supplied list first, so a deploy-time correction beats a stale entry
 * baked into the matrix without needing a code change to take effect.
 */
export function mergeScreeningLists(a: ScreeningList, b: ScreeningList): ScreeningList {
  if (!b.configured) return a;
  if (!a.configured) return b;

  const seen = new Set(a.regions.map((r) => r.region));
  const regions = [...a.regions, ...b.regions.filter((r) => !seen.has(r.region))];
  return { regions, configured: true, source: `${a.source} + ${b.source}` };
}

let cache: { raw: string | undefined; source: string | undefined; list: ScreeningList } | null = null;

/**
 * The env-supplied list for this process.
 *
 * Keyed on the raw strings rather than memoised once, so a test (or an operator
 * hot-reloading config) that changes the variable is picked up without a reset
 * hook that somebody has to remember to call.
 */
export function envScreeningList(env: Record<string, string | undefined> = process.env): ScreeningList {
  const raw = env[SANCTIONS_REGIONS_ENV];
  const source = env[SANCTIONS_SOURCE_ENV];
  if (cache && cache.raw === raw && cache.source === source) return cache.list;
  const list = parseScreeningList(raw, source);
  cache = { raw, source, list };
  return list;
}
