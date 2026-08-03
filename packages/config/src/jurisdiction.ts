import { MODULES, type ModuleId, type Plane } from './modules.js';
import {
  SANCTIONS_REGIONS_ENV,
  SANCTIONS_SOURCE_ENV,
  SCREENING_REVIEWED_EMPTY,
  envScreeningList,
  type BlockAuthority,
  type ScreenedRegion,
  type ScreeningDeclaration,
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
 * No list ships configured. What changed is that the empty state is no longer
 * invisible: every decision reports whether a list was consulted
 * (`AccessDecision.screening`), and `assertScreeningConfigured()` refuses to let
 * a production-like process boot without one. See `screening.ts` for the shape
 * counsel's answer goes into — supplying it is a config change, not an
 * engineering project.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS BUSINESS CONFIGURATION. IT IS NOT THE SANCTIONS AUTHORITY.
 *
 * Everything in `JURISDICTION_MATRIX` — `status`, `minTier`, `limitMultiplier`,
 * and `blocked` — is business configuration: which markets we open, at what
 * tier, with what limits. It is edited by ordinary contributors in ordinary PRs
 * for licensing, commercial and product reasons.
 *
 * The sanctions screening list is a DIFFERENT authority with a DIFFERENT owner
 * (counsel, per DIRECTION §8) and it lives in `screening.ts`, supplied as
 * configuration at deploy time.
 *
 * They used to be able to satisfy each other. A `blocked: true` entry here was
 * folded into a `ScreeningList` and merged with the counsel-supplied one, so
 * ONE region blocked for a commercial reason flipped `assertScreeningConfigured`
 * from "refuse to start" to "satisfied" while the sanctions list was still empty
 * and nobody in counsel had supplied anything. Two authorities sharing one
 * literal, and the weaker one silently vouching for the stronger.
 *
 * They are separated now, and the separation runs both ways:
 *
 *   · A `blocked: true` entry here STILL REFUSES THE REGION. Nothing about the
 *     existing refusal is weakened — see `businessBlockFor` and `checkAccess`.
 *   · It CANNOT satisfy the screening guard. Only `screening.ts` can.
 *   · Every refusal records WHICH authority refused (`AccessDecision.blockedBy`),
 *     so a legal control and a commercial one are never read as the same thing.
 *
 * Where the two cannot be told apart — a `blocked: true` entry whose reason
 * nobody wrote down — the ambiguous case refuses in both directions: the region
 * stays blocked, and the boot guard stays unsatisfied.
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
   * THIS IS A BUSINESS DECISION, NOT A SANCTIONS ONE. Set it for a licence we
   * do not hold, a market we have not opened, a commercial choice, a
   * placeholder. It refuses the region completely and always has.
   *
   * WHAT IT DELIBERATELY DOES NOT DO is count as sanctions screening. It cannot
   * satisfy `assertScreeningConfigured()`, and adding an entry here will not
   * make a production boot stop complaining that no screening list exists. That
   * is not an oversight — it is the point. This array is edited in ordinary PRs
   * by ordinary contributors, and one commercially-blocked region used to be
   * enough to tell the whole platform that counsel had supplied a sanctions
   * list when counsel had supplied nothing.
   *
   * ANYTHING SANCTIONS-DRIVEN GOES IN `INTAFACED_SANCTIONS_REGIONS`
   * (screening.ts). Not merely preferred — required, because that is the list
   * with a named owner, provenance on every decision, and a boot guard behind
   * it. It also moves at the speed of a deploy rather than a release.
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

// ── The two authorities, wired separately ───────────────────────────────────
//
// BUSINESS BLOCKS (below) — `blocked: true` in the matrix. Commercial and
// licensing decisions, edited here in ordinary PRs. They refuse regions.
//
// SCREENING (screening.ts) — counsel-supplied sanctions content, supplied as
// configuration. It refuses regions too, and it is the ONLY thing that can
// satisfy the boot guard.
//
// `checkAccess` consults both in the same place, so the two sources cannot
// start disagreeing about whether a region is served; what it never does is let
// one stand in for the other.
//
// And every decision reports WHETHER A SCREENING LIST WAS CONSULTED. Before
// that existed, "screened and clear" and "screened nothing, because there was
// nothing to screen against" produced identical decisions, so nothing
// downstream — no log, no test, no dashboard — could tell them apart, and the
// empty state read as a green tick.

/** Provenance label for a refusal that came from this file rather than counsel. */
export const BUSINESS_BLOCK_SOURCE = 'JURISDICTION_MATRIX';

/**
 * A region the BUSINESS refuses to serve. Deliberately not a `ScreenedRegion`.
 *
 * Two types rather than one flag on a shared type, because a shared type is
 * what let a matrix entry be counted as counsel's work. These cannot be
 * assigned into each other's collections, so re-merging them is a change
 * somebody has to write on purpose and defend in review — not a one-line
 * `filter().map()` that nobody reads again.
 */
export interface BusinessBlock {
  readonly region: RegionCode;
  /** Optional, exactly as on the entry — see `checkAccess` for the fallbacks. */
  readonly reason?: string;
  readonly source: string;
  /** Always `'business'`. Never `'screening'`. */
  readonly authority: 'business';
}

/**
 * The business blocks in a set of matrix entries.
 *
 * Takes the entries rather than reading the module constant so the rule can be
 * tested against a matrix that actually contains a `blocked: true` entry. The
 * shipped matrix contains none, and a rule about the blocked case that can only
 * be exercised when somebody adds one is a rule with no test.
 */
export function businessBlocksFrom(entries: readonly JurisdictionEntry[]): readonly BusinessBlock[] {
  return entries
    .filter((e) => e.blocked === true)
    .map((e) => ({ region: e.region.toUpperCase(), reason: e.reason, source: BUSINESS_BLOCK_SOURCE, authority: 'business' as const }));
}

const BUSINESS_BLOCKS: readonly BusinessBlock[] = businessBlocksFrom(JURISDICTION_MATRIX);
const BUSINESS_BLOCK_BY_REGION = new Map(BUSINESS_BLOCKS.map((b) => [b.region, b]));

/** The business block for a region, if this file refuses it outright. */
export function businessBlockFor(region: RegionCode): BusinessBlock | undefined {
  return BUSINESS_BLOCK_BY_REGION.get(region.toUpperCase());
}

/**
 * Regions this file refuses for commercial or licensing reasons.
 *
 * Surfaced separately from `screeningStatus().blockedRegions` on purpose: an
 * operator counting "regions we block" must be able to see which of them are a
 * legal control and which are a business choice, because only one of those is
 * counsel's to change.
 */
export function businessBlockedRegions(): readonly RegionCode[] {
  return BUSINESS_BLOCKS.map((b) => b.region);
}

/**
 * The screening list this process is actually using.
 *
 * A pass-through to the env-supplied list, and that is the fix: this function
 * used to merge `blocked: true` matrix entries in, which is how business
 * configuration came to satisfy a sanctions guard. Kept as a named seam because
 * it is where a second SCREENING-authority source (a file, a fetched list)
 * would legitimately be folded in — a business source never would be.
 *
 * Nothing was weakened by removing the fold: `checkAccess` and `isRegionBlocked`
 * have always consulted the matrix's own `blocked` flag directly and still do,
 * so the merged copy contributed no refusal that is not still made.
 */
export function activeScreeningList(env: Record<string, string | undefined> = process.env): ScreeningList {
  return envScreeningList(env);
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
  /**
   * Which of the three screening states this decision was made under.
   *
   * Needed alongside `listConfigured` because `true` with a count of zero is now
   * reachable and means something specific: `reviewed-empty`, a recorded
   * decision that no region is screened out. A reader with only the boolean and
   * the count cannot tell that from a list that happens to be short.
   */
  readonly declaration: ScreeningDeclaration;
  readonly blockedRegionCount: number;
  /** Where the list came from — governance record, env var name, or `unconfigured`. */
  readonly source: string;
}

function provenanceOf(list: ScreeningList): ScreeningProvenance {
  return {
    listConfigured: list.configured,
    declaration: list.declaration,
    blockedRegionCount: list.regions.length,
    source: list.source,
  };
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
  /**
   * WHICH AUTHORITY refused the region, on a `denied.region_blocked`.
   *
   * `'screening'` is a legal control that counsel owns. `'business'` is a
   * commercial or licensing choice that a contributor can change in a PR. They
   * produce the same refusal and they are not the same fact, and an auditor who
   * cannot tell them apart cannot tell whether a refusal that disappeared was a
   * market opening or a sanctions control being tuned away.
   *
   * Absent on every other outcome — including allowed ones, where nothing
   * refused anything.
   */
  readonly blockedBy?: BlockAuthority;
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
  if (businessBlockFor(region) !== undefined) return true;
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

  const rule = ruleFor(q.module, q.region);

  // A region is refused if the BUSINESS blocks it outright OR the SCREENING list
  // names it. Two authorities, one question — "do we serve this region" — so
  // both are read in the same place; a second `blocked` check somewhere else is
  // how two sources start disagreeing.
  //
  // What the decision keeps separate is WHO refused. Screening wins the
  // attribution when both name the region: the legal control is the more
  // consequential fact, and it is the one that must not look removable by
  // editing the matrix.
  const screened = screenedRegion(screening, q.region);
  const businessBlock = businessBlockFor(q.region);
  const regionBlocked = businessBlock !== undefined || screened !== undefined;
  const blockedBy: BlockAuthority | undefined = screened ? 'screening' : businessBlock ? 'business' : undefined;
  const regionBlockReason = screened?.reason ?? businessBlock?.reason;

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
        blockedBy,
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
      blockedBy,
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
  /**
   * Which of the three states. Read this, not just `configured` — `configured`
   * is `true` for a real list AND for a recorded "deliberately empty", and those
   * are different things to show an operator.
   */
  readonly declaration: ScreeningDeclaration;
  /** Regions the SCREENING authority refuses. Counsel's list, and only that. */
  readonly blockedRegions: readonly RegionCode[];
  /**
   * Regions the BUSINESS refuses (`blocked: true` in the matrix).
   *
   * Reported separately and never added to `blockedRegions`. A dashboard that
   * summed them would be showing a total that a contributor can move in an
   * ordinary PR while presenting it as sanctions coverage — the same conflation
   * that let a commercial block satisfy the boot guard, moved to the screen.
   */
  readonly businessBlockedRegions: readonly RegionCode[];
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
 *
 * `business` is a parameter so the rule can be tested against a matrix that
 * actually has a `blocked: true` entry in it; production callers pass neither.
 */
export function screeningStatus(
  screening: ScreeningList = activeScreeningList(),
  business: readonly BusinessBlock[] = BUSINESS_BLOCKS,
): ScreeningStatus {
  const blockedRegions = screening.regions.map((r) => r.region);
  const businessBlockedRegions = business.map((b) => b.region);

  // Named separately in the unconfigured summary, because "we block 2 regions"
  // is exactly what somebody reads as "screening is doing something".
  const businessNote =
    businessBlockedRegions.length === 0
      ? ''
      : ` (${businessBlockedRegions.length} region(s) [${businessBlockedRegions.join(', ')}] are blocked by ` +
        `${BUSINESS_BLOCK_SOURCE} for commercial/licensing reasons — that is business configuration, not screening.)`;

  const summary =
    screening.declaration === 'listed'
      ? `sanctions screening: ${blockedRegions.length} region(s) blocked [${blockedRegions.join(', ')}] from ${screening.source}` +
        businessNote
      : screening.declaration === 'reviewed-empty'
        ? `sanctions screening: REVIEWED, DELIBERATELY EMPTY — 0 regions screened out, on the authority of ` +
          `${screening.source}. This is a recorded decision, not an unset default.` +
          businessNote
        : `sanctions screening: NOT CONFIGURED — 0 regions blocked because no list was consulted. ` +
          `This is not "everywhere is clear"; nothing has been screened. Supply ${SANCTIONS_REGIONS_ENV}.` +
          businessNote;

  return {
    configured: screening.configured,
    declaration: screening.declaration,
    blockedRegions,
    businessBlockedRegions,
    source: screening.source,
    summary,
  };
}

export class UnscreenedJurisdictionError extends Error {
  constructor(
    readonly appEnv: string,
    readonly businessBlockedRegions: readonly RegionCode[] = [],
  ) {
    super(
      `SANCTIONS SCREENING IS NOT CONFIGURED (§24 Lane A) and APP_ENV=${appEnv}. Refusing to start.\n\n` +
        `The screening MECHANISM works; it has no list to screen against, so every region resolves to ` +
        `allowed and no call site, log line or dashboard can tell that apart from a region that was ` +
        `checked and cleared. Serving traffic in that state means telling users they were screened when ` +
        `they were not.\n\n` +
        (businessBlockedRegions.length === 0
          ? ''
          : `NOTE — ${BUSINESS_BLOCK_SOURCE} does block ${businessBlockedRegions.length} region(s) ` +
            `[${businessBlockedRegions.join(', ')}], and those refusals are live. They do NOT satisfy this ` +
            `guard and they are not meant to: a matrix entry is business configuration edited in ordinary ` +
            `PRs — a licence we lack, a market we have not opened, a placeholder — and letting one vouch ` +
            `for a sanctions list would mean a commercial decision could arm a legal control nobody had ` +
            `supplied. Sanctions content has a different owner and comes in below.\n\n`) +
        `THERE ARE EXACTLY TWO WAYS TO SATISFY THIS, and both are a deliberate, attributable act:\n\n` +
        `  1. Supply the list:\n` +
        `       ${SANCTIONS_REGIONS_ENV}="AA:reason,BB:reason"   (ISO-3166 alpha-2, comma separated)\n` +
        `       ${SANCTIONS_SOURCE_ENV}="<governance record>"\n\n` +
        `  2. Record that it was reviewed and is deliberately empty:\n` +
        `       ${SANCTIONS_REGIONS_ENV}="${SCREENING_REVIEWED_EMPTY}"\n` +
        `       ${SANCTIONS_SOURCE_ENV}="<governance record>"      (REQUIRED for this one)\n\n` +
        `     Option 2 is a real answer, not a bypass — "we looked, and no region is screened out" is a ` +
        `legitimate conclusion and the platform must be able to record it. It demands attribution ` +
        `precisely because it has no content: without a named record it would be indistinguishable from ` +
        `somebody silencing this message.\n\n` +
        `WHAT GOES IN THE LIST IS A COMPLIANCE DECISION, NOT AN ENGINEERING ONE. It needs counsel for ` +
        `the jurisdictions served. Do not guess it: too few entries is a sanctions breach, too many is ` +
        `unlawful discrimination. And do not answer it by adding \`blocked: true\` to the matrix — that ` +
        `is the wrong authority and will not clear this. See packages/config/src/screening.ts.\n\n` +
        `Development and test are deliberately unaffected — APP_ENV=dev boots unconfigured and logs the ` +
        `gap instead.`,
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
 * SATISFIABLE ONLY BY THE SCREENING AUTHORITY. It gates on the screening list's
 * own `declaration`, and the only thing that can produce a declaration other
 * than `unset` is `parseScreeningList` reading `INTAFACED_SANCTIONS_REGIONS`.
 * The business matrix is not an input to this decision at all — it is read below
 * solely so the refusal message can name blocks that exist and say why they do
 * not count. That is the fix: this used to gate on a merged list, and one
 * `blocked: true` matrix entry cleared it.
 *
 * FAIL CLOSED. `unset` is the only state that throws, and it is also the state
 * every ambiguous input resolves to — an absent variable, a blank one, one
 * holding only commas, and a matrix block whose authority cannot be established.
 * Nothing here treats "we could not tell" as "supplied".
 *
 * Returns the status so the caller can log it — in dev, where this does not
 * throw, the log line IS the control's visibility.
 */
export function assertScreeningConfigured(env: Record<string, string | undefined> = process.env): ScreeningStatus {
  const list = activeScreeningList(env);
  const status = screeningStatus(list);
  const appEnv = env.APP_ENV ?? 'dev';
  const enforced = (SCREENING_ENFORCED_ENVS as readonly string[]).includes(appEnv);
  if (enforced && list.declaration === 'unset') {
    throw new UnscreenedJurisdictionError(appEnv, status.businessBlockedRegions);
  }
  return status;
}
