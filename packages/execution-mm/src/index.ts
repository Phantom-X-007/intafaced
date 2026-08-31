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
export { describeMarketMakingPolicy, type MarketMakingPolicySummary } from './mm-policy.js';
export {
  EXECUTION_MM_SPREAD_SKEW_BANDS_ENV,
  mmSpreadSkewBandsGate,
  validateMmOwnerSpreadSkew,
  type MmSpreadSkewBands,
  type MmSpreadSkewBandsGate,
  type MmSpreadSkewBandsRefuseReason,
} from './mm-spread-skew-bands.js';
export {
  massQuoteExternalMm,
  type MmMassQuoteAccepted,
  type MmMassQuoteEntry,
  type MmMassQuoteEntryOutcome,
  type MmMassQuoteInput,
  type MmMassQuoteResult,
  type MmMassQuoteSetRefusal,
  type MmMassQuoteSetRefuseReason,
} from './mm-mass-quote.js';
export {
  EXECUTION_MM_MMP_THRESHOLDS_ENV,
  evaluateMmMmpTrigger,
  mmMmpThresholdsGate,
  runMmMmpAction,
  type MmMmpAction,
  type MmMmpActionAccepted,
  type MmMmpActionRefusal,
  type MmMmpActionResult,
  type MmMmpObservation,
  type MmMmpThresholds,
  type MmMmpThresholdsGate,
  type MmMmpThresholdsRefuseReason,
  type MmMmpTriggerClear,
  type MmMmpTriggerEvaluation,
  type MmMmpTriggerReason,
  type MmMmpTriggerTripped,
} from './mm-mmp-thresholds.js';
