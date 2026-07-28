import { MODULES, type ModuleId, type Plane } from './modules.js';

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
  /** Region is not served at all — overrides every module rule. */
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

export interface AccessQuery {
  readonly module: ModuleId;
  readonly region: RegionCode;
  readonly plane: Plane;
  readonly kycTier: KycTier;
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

/** Is this region blocked outright, whatever the module? */
export function isRegionBlocked(region: RegionCode): boolean {
  return BY_REGION.get(region.toUpperCase())?.blocked === true;
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

  if (!mod.planes.includes(q.plane)) {
    return {
      allowed: false,
      code: 'denied.plane_unsupported',
      status: 'blocked',
      limitMultiplier: 0,
      reason: `${q.module} does not operate on the ${q.plane} plane`,
    };
  }

  const entry = BY_REGION.get(q.region.toUpperCase());
  const rule = ruleFor(q.module, q.region);

  // ── Sovereignty law ──────────────────────────────────────────────────────
  // Protocol plane + non-custodial module = there is nothing to KYC.
  // Region blocks still apply at the hosted front end (sanctions screening,
  // §24 Lane A) but the protocol itself is permissionless infrastructure.
  const permissionless = q.plane === 'protocol' && !mod.custodial;
  if (permissionless) {
    if (entry?.blocked) {
      return {
        allowed: false,
        code: 'denied.region_blocked',
        status: 'blocked',
        limitMultiplier: 0,
        reason: entry.reason ?? `Hosted access unavailable in ${q.region}`,
      };
    }
    return {
      allowed: true,
      code: 'allowed.permissionless',
      status: 'open',
      limitMultiplier: rule.limitMultiplier ?? 1,
      reason: 'Non-custodial: no identity requirement (§22)',
    };
  }

  // ── Fiat plane / custodial path ──────────────────────────────────────────
  if (entry?.blocked) {
    return {
      allowed: false,
      code: 'denied.region_blocked',
      status: 'blocked',
      limitMultiplier: 0,
      reason: entry.reason ?? `Not served in ${q.region}`,
    };
  }

  if (rule.status === 'blocked') {
    return {
      allowed: false,
      code: 'denied.module_blocked',
      status: 'blocked',
      limitMultiplier: 0,
      reason: rule.notes ?? `${q.module} is not offered in ${q.region}`,
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
    };
  }

  return {
    allowed: true,
    code: 'allowed',
    status: rule.status,
    limitMultiplier: rule.limitMultiplier ?? 1,
    reason: rule.notes ?? 'Permitted',
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
