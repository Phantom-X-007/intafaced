/**
 * @intafaced/execution-mm — §28 external-only MM half (D26-P1-X5) + house-tenant
 * Q1 pin (D26-P0-01). Thin path on `@intafaced/venue-adapter` SOR cost model.
 * Internal matching-book targets refuse with an honest reason. No invented preference.
 */
export {
  pinHouseTenantTarget,
  refuseHouseTenantInternalBook,
  type HouseTenantExternalOk,
  type HouseTenantPinResult,
  type HouseTenantRefuseReason,
  type HouseTenantRefusal,
  type HouseTenantTarget,
} from './house-tenant.js';
export {
  evaluateMmKillSwitches,
  isExternalVenueKind,
  planExternalMmHedge,
  quoteExternalMm,
  refuseInternalMm,
  type MmBookDepth,
  type MmHedgePlan,
  type MmHedgeVenue,
  type MmInventoryState,
  type MmKillConfig,
  type MmKillClear,
  type MmKillEvaluation,
  type MmKillReason,
  type MmKillTripped,
  type MmQuoteAccepted,
  type MmQuoteLeg,
  type MmRefuseReason,
  type MmRefusal,
  type MmVolatilityState,
  type PlanExternalMmHedgeInput,
  type PlanExternalMmHedgeResult,
  type QuoteExternalMmInput,
  type QuoteExternalMmResult,
} from './market-making.js';
