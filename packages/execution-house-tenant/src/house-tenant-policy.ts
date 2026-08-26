/**
 * execution.house-tenant product policy — D26-P0-01 external-only, kill-first.
 *
 * Consolidates the public honesty posture from `house-tenant.ts`. Does not
 * invent venue lists, mids, fees, internal-trading paths, or a second book.
 *
 * Law: docs/adr/2026-08-08-house-desk-and-market-making-fairness.md
 */

import { HOUSE_INTERNAL_VENUE_DETAIL, type TenantVenueTarget } from './house-tenant.js';
import { HOUSE_FILL_MAY_LOOK_LIKE_TENANT, HOUSE_MAY_SPEND_TENANT_MONEY } from './house-vs-tenant.js';

export const HOUSE_TENANT_POLICY_RULING = 'D26-P0-01' as const;

export const HOUSE_TENANT_BLOCKED_TARGETS = ['internal', 'matching-book'] as const;

export type HouseTenantPolicySummary = ReturnType<typeof describeHouseTenantPolicy>;

/** Public honesty board for execution.house-tenant Stage-1 mechanism. */
export function describeHouseTenantPolicy() {
  return {
    ruling: HOUSE_TENANT_POLICY_RULING,
    externalOnlyV1: true as const,
    killSwitchAppliesFirst: true as const,
    internalVenueBlocked: true as const,
    matchingBookBlocked: true as const,
    blockedTargets: HOUSE_TENANT_BLOCKED_TARGETS,
    internalVenueDetail: HOUSE_INTERNAL_VENUE_DETAIL,
    mechanismMayBeBuilt: true as const,
    noMatchingPathPrivilege: true as const,
    noQueuePrivilege: true as const,
    noAlphaInRepo: true as const,
    noSecondMoneyBook: true as const,
    houseMaySpendTenantMoney: HOUSE_MAY_SPEND_TENANT_MONEY,
    houseFillMayLookLikeTenant: HOUSE_FILL_MAY_LOOK_LIKE_TENANT,
    missingTenantIdRefuses: true as const,
    inventsVenueList: false as const,
    inventsInternalTradingPath: false as const,
    existenceDisclosureDeferred: true as const,
    hardMarkExclusionWhenInternalQuotes: true as const,
  };
}

/** ADR rule 5 — admin kill is evaluated before any venue target. */
export function policyKillSwitchFirst(killed: boolean): boolean {
  return killed;
}

/** Q1 external-only — internal and matching-book halves stay blocked for v1. */
export function policyBlocksInternalHalf(target: TenantVenueTarget): boolean {
  return target.kind === 'internal' || target.kind === 'matching-book';
}

/** External venue ids are opaque caller strings — never invented here. */
export function policyAllowsExternalOnly(target: TenantVenueTarget): boolean {
  return target.kind === 'external' && target.venueId.trim().length > 0;
}

export type HouseTenantPolicyGate = 'clear' | 'kill_switch' | 'internal_venue' | 'invalid_venue';

/**
 * Ordered policy gate: kill_switch → internal_venue → invalid_venue → clear.
 * Mirrors `authorizeTenantVenue` without requiring a sealed tenant record.
 */
export function evaluateHouseTenantPolicyGate(killed: boolean, target: TenantVenueTarget): HouseTenantPolicyGate {
  if (policyKillSwitchFirst(killed)) return 'kill_switch';
  if (policyBlocksInternalHalf(target)) return 'internal_venue';
  if (target.kind === 'external' && target.venueId.trim().length === 0) return 'invalid_venue';
  return 'clear';
}
