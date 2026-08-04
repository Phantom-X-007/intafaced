import { MODULES, type ModuleId, type Plane } from './modules.js';
import {
  EMPTY_SCREENING_LIST,
  MATRIX_SOURCE,
  SANCTIONS_REGIONS_ENV,
  envScreeningList,
  mergeScreeningLists,
  type ScreenedRegion,
  type ScreeningList,
} from './screening.js';

/**
 * JURISDICTION_MATRIX (§3, §9, §22).
 *
 * The single place geo rules live. Every module checks the matrix; launch
 * markets are a toggle, not a refactor.
 *
 * §22 THE SOVEREIGNTY LAW — encoded in `checkAccess`:
 *   custody === false  → permissionless. No KYC gate. The platform never holds
 *                        the asset, so there is nothing to verify.
 *   custody === true   → tiered verification per this matrix.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPERATOR NOTE — the seed entries below are a STRUCTURE, not legal advice.
 * Every `status` and `minTier` value must be signed off by counsel for the
 * relevant jurisdiction before that market is switched on. `reviewedBy` and
 * `reviewedAt` are required on any rule that ships to prod; `assertReviewed()`
 * is called by the DoD gate for launch markets.
 *
 * THE SANCTIONS BLOCKLIST IS EMPTY, ON PURPOSE, AND STILL NEEDS COUNSEL.
 * No entry below carries `blocked: true`, and no list ships configured. What
 * changed is that the empty state is no longer invisible: every decision now
 * reports whether a list was consulted (`AccessDecision.screening`), and
 * `assertScreeningConfigured()` refuses to let a production-like process boot
 * without one. See `screening.ts` for the shape counsel's answer goes into —
 * supplying it is a config change, not an engineering project.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const KYC_TIERS = ['none', 'basic', 'full', 'institutional'] as const;
export type KycTier = (typeof KYC_TIERS)[number];

const TIER_ORDER: Readonly<Record<KycTier, number>> = { none: 0, basic: 1, full: 2, institutional: 3 };

export function tierSatisfies(held: KycTier, required: KycTier): boolean {
  return TIER_ORDER[held] >= TIER_ORDER[required];
}

export type RuleStatus =
  /** Module available to anyone meeting `minTier`. */
  | 'open'
  /** Available but with reduced limits / extra checks. */
  | 'restricted'
  /** Not offered in this region. */
  | 'blocked';

export interface JurisdictionRule {
  readonly status: RuleStatus;
  readonly minTier: KycTier;
  /** Multiplier applied to standard limits (1 = standard). */
  readonly limitMultiplier?: number;
  readonly notes?: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
}

/** ISO-3166 alpha-2, or `*` for the default rule. */
export type RegionCode = string;

export interface JurisdictionEntry {
  readonly region: RegionCode;
  /**
   * Region is not served at all — overrides every module rule.
   *
   * The other way to block a region is `INTAFACED_SANCTIONS_REGIONS`
   * (screening.ts); both are read by `checkAccess` in the same place. Prefer
   * the env list for anything sanctions-driven: it moves at the speed of a
   * deploy rather than a release, and it carries provenance.
   */
  readonly blocked?: boolean;
  readonly reason?: string;
  /** Per-module overrides; anything unlisted falls back to `defaults`. */
  readonly modules?: Partial<Record<ModuleId, JurisdictionRule>>;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
}

const OPEN_BASIC: JurisdictionRule = { status: 'open', minTier: 'basic' };
const OPEN_FULL: JurisdictionRule = { status: 'open', minTier: 'full' };
const BLOCKED: JurisdictionRule = { status: 'blocked', minTier: 'institutional' };

/**
 * Default rule set — applied to any region without an explicit entry.
 * Deliberately conservative: custodial money movement needs `basic`, leveraged
 * and issuance products need `full`.
 */
export const DEFAULT_MODULE_RULES: Readonly<Record<ModuleId, JurisdictionRule>> = {
  // The edge gates nothing itself. Applying a tier here would block the
  // anonymous requests that `auth.register` and `auth.login` depend on, and
  // would put a jurisdiction check in front of every module rather than in the
  // module that owns the rule.
  // No tier: the platform never holds the asset, so there is nothing to
  // verify anyone against (§503, §585). The jurisdiction STATUS still applies —
  // a sanctioned region is a legal constraint, not a custody one.
  dex: { status: 'open', minTier: 'none' },
  edge: { status: 'open', minTier: 'none' },
  identity: { status: 'open', minTier: 'none' },
  ledger: OPEN_BASIC,
  token: OPEN_BASIC,
  matching: { status: 'open', minTier: 'none' },
  trade: OPEN_BASIC,
  // Public market data. There is no user, no account and no asset behind a
  // depth frame, so there is nobody for a tier to be about — the same reasoning
  // that leaves `matching` at `none`. The jurisdiction STATUS still applies: a
  // blocked region is a legal constraint on serving the region at all, which is
  // a separate question from custody.
  ws: { status: 'open', minTier: 'none' },
  pay: OPEN_FULL,
  p2p: OPEN_BASIC,
  blueprint: { status: 'open', minTier: 'none' },
  bank: OPEN_FULL,
  launch: OPEN_FULL,
  academy: { status: 'open', minTier: 'none' },
  market: OPEN_BASIC,
  'mining-pool': OPEN_BASIC,
  agents: { status: 'open', minTier: 'none' },
  'core-ops': { status: 'open', minTier: 'none' },
  support: { status: 'open', minTier: 'none' },
  // Inbox only — no custody, no money movement. minTier none so a user can
  // always read their own notifications regardless of verification tier.
  notify: { status: 'open', minTier: 'none' },
  // Protocol Plane — no custody, therefore no tier. Kept explicit so a future
  // edit that raises these trips the custody-scan review.
  chain: { status: 'open', minTier: 'none' },
  indexer: { status: 'open', minTier: 'none' },
  bridge: OPEN_FULL,
  protocol: { status: 'open', minTier: 'none' },
};

/**
 * Seed matrix. Add a market by adding an entry — no code changes anywhere else.
 * Entries here carry no `reviewedBy` yet: `assertReviewed()` will refuse to let
 * them into a prod launch-market list until counsel signs them.
 */
export const JURISDICTION_MATRIX: readonly JurisdictionEntry[] = [
  { region: '*' },

  // Illustrative structure only — populate per counsel before enabling.
  {
    region: 'GB',
    modules: {
      trade: {
        status: 'restricted',
        minTier: 'full',
        limitMultiplier: 1,
        notes: 'Leveraged products restricted for retail — confirm scope with counsel.',
      },
    },
  },
  {
    region: 'US',
    modules: {
      trade: { status: 'restricted', minTier: 'full', notes: 'State-by-state licensing analysis required before enabling.' },
      launch: BLOCKED,
      bank: BLOCKED,
    },
  },
];

const BY_REGION = new Map(JURISDICTION_MATRIX.map((e) => [e.region.toUpperCase(), e]));

// ── Sanctions / region screening ────────────────────────────────────────────
// The list itself lives in configuration (see screening.ts). This section is
// only the wiring: how the matrix's own `blocked` entries fold in with the
// configured list, and how a decision reports WHETHER A LIST WAS CONSULTED.
//
// That last part is the whole point. Before this, "screened and clear" and
// "screened nothing, because there was nothing to screen against" produced
// identical decisions, so nothing downstream — no log, no test, no dashboard —
// could tell them apart, and the empty state read as a green tick.

/** Regions the matrix itself blocks outright. Currently none — see `blocked`. */
const MATRIX_SCREENING: ScreeningList = (() => {
  const regions: ScreenedRegion[] = JURISDICTION_MATRIX.filter((e) => e.blocked === true).map((e) => ({
    region: e.region.toUpperCase(),
    reason: e.reason ?? `Not served in ${e.region}`,
    source: MATRIX_SOURCE,
  }));
  return regions.length > 0 ? { regions, configured: true, source: MATRIX_SOURCE } : EMPTY_SCREENING_LIST;
})();

let activeCache: { fromEnv: ScreeningList; list: ScreeningList } | null = null;

/**
 * The screening list this process is actually using: the configured list plus
 * any `blocked: true` matrix entries.
 *
 * Env first, so a deploy-time correction beats a stale matrix entry without a
 * code change. Cached on the env list's identity, which is itself stable per
 * raw env string — so changing the variable in a test is picked up with no
 * reset hook to forget.
 */
export function activeScreeningList(env: Record<string, string | undefined> = process.env): ScreeningList {
  const fromEnv = envScreeningList(env);
  if (activeCache && activeCache.fromEnv === fromEnv) return activeCache.list;
  const list = mergeScreeningLists(fromEnv, MATRIX_SCREENING);
  activeCache = { fromEnv, list };
  return list;
}

let lookupCache: { list: ScreeningList; byRegion: ReadonlyMap<string, ScreenedRegion> } | null = null;

function screenedRegion(list: ScreeningList, region: RegionCode): ScreenedRegion | undefined {
  if (!lookupCache || lookupCache.list !== list) {
    lookupCache = { list, byRegion: new Map(list.regions.map((r) => [r.region, r])) };
  }
  return lookupCache.byRegion.get(region.toUpperCase());
}

/**
 * Carried on EVERY `AccessDecision`, allowed ones included.
 *
 * `listConfigured: false` with `blockedRegionCount: 0` is the state this whole
 * change exists to surface: nothing was screened. A log line, an API response
 * or an operator dashboard can now render "0 regions blocked — list not
 * configured" instead of a reassuring tick, because the decision itself says so.
 * A compliance control whose status nobody can see is not a control.
 */
export interface ScreeningProvenance {
  /** Was a real blocklist consulted at all? `false` means nothing was screened. */
  readonly listConfigured: boolean;
  readonly blockedRegionCount: number;
  /** Where the list came from — env provenance string, matrix, or `unconfigured`. */
  readonly source: string;
}

function provenanceOf(list: ScreeningList): ScreeningProvenance {
  return { listConfigured: list.configured, blockedRegionCount: list.regions.length, source: list.source };
}

export interface AccessQuery {
  readonly module: ModuleId;
  readonly region: RegionCode;
  readonly plane: Plane;
  readonly kycTier: KycTier;
  /**
   * Screen against this list instead of the process-wide one.
   *
   * For tests and for any caller that resolves its own governed list. Omitted
   * — which is every production call site — means `activeScreeningList()`.
   */
  readonly screening?: ScreeningList;
}

export interface AccessDecision {
  readonly allowed: boolean;
  /** Machine-readable outcome for logs, metrics, and UI copy keys. */
  readonly code:
    | 'allowed'
    | 'allowed.permissionless'
    | 'denied.region_blocked'
    | 'denied.module_blocked'
    | 'denied.kyc_required'
    | 'denied.plane_unsupported';
  readonly requiredTier?: KycTier;
  readonly status: RuleStatus;
  readonly limitMultiplier: number;
  readonly reason: string;
  /**
   * Whether a real sanctions/region list backed this decision.
   *
   * Present on allowed decisions too, and that is the point: `allowed` alone
   * cannot distinguish "we screened you and you are fine" from "we screened
   * nobody". This field can.
   */
  readonly screening: ScreeningProvenance;
}

/**
 * The effective rule for a module in a region — the per-region override if one
 * exists, otherwise the default.
 *
 * Exported because any surface that wants the *rule* (status + minTier) rather
 * than a yes/no decision would otherwise recompose
 * `entry.modules?.[m] ?? DEFAULT_MODULE_RULES[m]` itself, duplicating this
 * lookup outside the file that owns it. That duplicate is what drifts.
 */
export function ruleFor(module: ModuleId, region: RegionCode): JurisdictionRule {
  const entry = BY_REGION.get(region.toUpperCase());
  return entry?.modules?.[module] ?? DEFAULT_MODULE_RULES[module];
}

/**
 * Is this region blocked outright, whatever the module?
 *
 * Consults the configured screening list as well as the matrix — a caller that
 * only read the matrix would answer `false` for a region the operator blocked
 * by configuration, which is the same silent disagreement `checkAccess` is
 * being fixed to avoid.
 *
 * Note what a `false` here does NOT mean: it does not mean screened-and-clear.
 * Use `screeningStatus()` if you need to know whether anything was screened.
 */
export function isRegionBlocked(region: RegionCode, screening: ScreeningList = activeScreeningList()): boolean {
  if (BY_REGION.get(region.toUpperCase())?.blocked === true) return true;
  return screenedRegion(screening, region) !== undefined;
}

/**
 * Regions whose matrix entry lacks counsel sign-off.
 *
 * These cannot become launch markets — `assertReviewed` refuses them. Surfacing
 * the list is what lets the admin console show the gap rather than an operator
 * discovering it at launch.
 */
export function unreviewedRegions(): RegionCode[] {
  return JURISDICTION_MATRIX.filter((e) => !e.reviewedBy || !e.reviewedAt).map((e) => e.region);
}

/**
 * The one function every module calls before serving a user.
 *
 * §22: zero-KYC follows custody. If the module cannot take custody on the
 * requested plane, access is permissionless and this returns immediately —
 * we never gate what we do not hold.
 */
export function checkAccess(q: AccessQuery): AccessDecision {
  const mod = MODULES[q.module];
  const screening = q.screening ?? activeScreeningList();
  const provenance = provenanceOf(screening);

  if (!mod.planes.includes(q.plane)) {
    return {
      allowed: false,
      code: 'denied.plane_unsupported',
      status: 'blocked',
      limitMultiplier: 0,
      reason: `${q.module} does not operate on the ${q.plane} plane`,
      screening: provenance,
    };
  }

  const entry = BY_REGION.get(q.region.toUpperCase());
  const rule = ruleFor(q.module, q.region);

  // A region is refused if the matrix blocks it outright OR the configured
  // screening list names it. Both are the same answer to the same question, so
  // both are read in the same place — a second `blocked` check somewhere else
  // is how the two sources start disagreeing.
  const screened = screenedRegion(screening, q.region);
  const regionBlocked = entry?.blocked === true || screened !== undefined;
  const regionBlockReason = screened?.reason ?? entry?.reason;

  // ── Sovereignty law ──────────────────────────────────────────────────────
  // Protocol plane + non-custodial module = there is nothing to KYC.
  // Region blocks still apply at the hosted front end (sanctions screening,
  // §24 Lane A) but the protocol itself is permissionless infrastructure.
  //
  // ORDER IS LOAD-BEARING: the region check runs BEFORE the permissionless
  // return, so sanctions screening survives a short-circuit that the KYC gate
  // does not. That ordering is what makes "zero-KYC but still sanctions
  // screened" a true statement rather than a slogan. Do not lift the
  // permissionless return above it.
  const permissionless = q.plane === 'protocol' && !mod.custodial;
  if (permissionless) {
    if (regionBlocked) {
      return {
        allowed: false,
        code: 'denied.region_blocked',
        status: 'blocked',
        limitMultiplier: 0,
        reason: regionBlockReason ?? `Hosted access unavailable in ${q.region}`,
        screening: provenance,
      };
    }
    return {
      allowed: true,
      code: 'allowed.permissionless',
      status: 'open',
      limitMultiplier: rule.limitMultiplier ?? 1,
      reason: 'Non-custodial: no identity requirement (§22)',
      screening: provenance,
    };
  }

  // ── Fiat plane / custodial path ──────────────────────────────────────────
  if (regionBlocked) {
    return {
      allowed: false,
      code: 'denied.region_blocked',
      status: 'blocked',
      limitMultiplier: 0,
      reason: regionBlockReason ?? `Not served in ${q.region}`,
      screening: provenance,
    };
  }

  if (rule.status === 'blocked') {
    return {
      allowed: false,
      code: 'denied.module_blocked',
      status: 'blocked',
      limitMultiplier: 0,
      reason: rule.notes ?? `${q.module} is not offered in ${q.region}`,
      screening: provenance,
    };
  }

  if (!tierSatisfies(q.kycTier, rule.minTier)) {
    return {
      allowed: false,
      code: 'denied.kyc_required',
      requiredTier: rule.minTier,
      status: rule.status,
      limitMultiplier: 0,
      reason: `Verification tier "${rule.minTier}" required for ${q.module} in ${q.region}`,
      screening: provenance,
    };
  }

  return {
    allowed: true,
    code: 'allowed',
    status: rule.status,
    limitMultiplier: rule.limitMultiplier ?? 1,
    reason: rule.notes ?? 'Permitted',
    screening: provenance,
  };
}

export class UnreviewedJurisdictionError extends Error {
  constructor(readonly regions: readonly string[]) {
    super(
      `Launch markets missing counsel review in JURISDICTION_MATRIX: ${regions.join(', ')}. ` +
        `Add reviewedBy + reviewedAt before enabling these markets.`,
    );
    this.name = 'UnreviewedJurisdictionError';
  }
}

/**
 * Called by the DoD gate before a market goes live. A region cannot be a launch
 * market until its matrix entry carries a reviewer and a date.
 */
export function assertReviewed(launchMarkets: readonly RegionCode[]): void {
  const unreviewed = launchMarkets.filter((r) => {
    const entry = BY_REGION.get(r.toUpperCase());
    return !entry?.reviewedBy || !entry?.reviewedAt;
  });
  if (unreviewed.length > 0) throw new UnreviewedJurisdictionError(unreviewed);
}

export function regionsWithEntries(): RegionCode[] {
  return JURISDICTION_MATRIX.map((e) => e.region).filter((r) => r !== '*');
}

// ── The screening control, made visible and made mandatory ──────────────────

export interface ScreeningStatus {
  /** `false` = nothing was screened. Not "clear". Never render this as a tick. */
  readonly configured: boolean;
  readonly blockedRegions: readonly RegionCode[];
  readonly source: string;
  /** One line an operator can read in a log or on a dashboard. */
  readonly summary: string;
}

/**
 * The state of the screening control, for logs, `/ready` payloads, and the
 * admin console.
 *
 * Exists because "how many regions are we blocking" and "are we blocking
 * anything on purpose" are different questions, and the answer to both used to
 * be an indistinguishable zero.
 */
export function screeningStatus(screening: ScreeningList = activeScreeningList()): ScreeningStatus {
  const blockedRegions = screening.regions.map((r) => r.region);

  const summary = screening.configured
    ? `sanctions screening: ${blockedRegions.length} region(s) blocked [${blockedRegions.join(', ')}] from ${screening.source}`
    : `sanctions screening: NOT CONFIGURED — 0 regions blocked because no list was consulted. ` +
      `This is not "everywhere is clear"; nothing has been screened. Supply ${SANCTIONS_REGIONS_ENV}.`;

  return { configured: screening.configured, blockedRegions, source: screening.source, summary };
}

export class UnscreenedJurisdictionError extends Error {
  constructor(readonly appEnv: string) {
    super(
      `SANCTIONS SCREENING IS NOT CONFIGURED (§24 Lane A) and APP_ENV=${appEnv}. Refusing to start.\n\n` +
        `The screening MECHANISM works; it has no list to screen against, so every region resolves to ` +
        `allowed and no call site, log line or dashboard can tell that apart from a region that was ` +
        `checked and cleared. Serving traffic in that state means telling users they were screened when ` +
        `they were not.\n\n` +
        `Fix it by supplying the list as configuration:\n` +
        `  ${SANCTIONS_REGIONS_ENV}="AA:reason,BB:reason"    (ISO-3166 alpha-2, comma separated)\n` +
        `  INTAFACED_SANCTIONS_LIST_SOURCE="<governance record>"\n\n` +
        `WHAT GOES IN THE LIST IS A COMPLIANCE DECISION, NOT AN ENGINEERING ONE. It needs counsel for ` +
        `the jurisdictions served. Do not guess it: too few entries is a sanctions breach, too many is ` +
        `unlawful discrimination. See packages/config/src/screening.ts.\n\n` +
        `Development and test are deliberately unaffected — APP_ENV=dev boots with an empty list and ` +
        `logs the gap instead.`,
    );
    this.name = 'UnscreenedJurisdictionError';
  }
}

/**
 * APP_ENVs where an unconfigured blocklist is a boot failure.
 *
 * `staging` is included on purpose: it is a production-like posture that can be
 * reachable by real users, and an environment that lets the empty state through
 * is where the empty state gets normalised before it reaches prod. `dev` and
 * `test` stay frictionless — nobody should need a sanctions list to run a unit
 * test or open the app locally.
 */
export const SCREENING_ENFORCED_ENVS = ['staging', 'prod'] as const;

/**
 * Called at boot by any service that serves the hosted front end.
 *
 * Modelled on svc-protocol's §22 sovereignty assertion: a property the platform
 * claims is checked at startup rather than assumed, and the process refuses to
 * run rather than quietly mislead users about it.
 *
 * Returns the status so the caller can log it — in dev, where this does not
 * throw, the log line IS the control's visibility.
 */
export function assertScreeningConfigured(env: Record<string, string | undefined> = process.env): ScreeningStatus {
  const status = screeningStatus(activeScreeningList(env));
  const appEnv = env.APP_ENV ?? 'dev';
  const enforced = (SCREENING_ENFORCED_ENVS as readonly string[]).includes(appEnv);
  if (enforced && !status.configured) throw new UnscreenedJurisdictionError(appEnv);
  return status;
}
