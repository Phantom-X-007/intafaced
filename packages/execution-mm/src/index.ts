/**
 * @intafaced/execution-mm — §28 external-only market-making engine half (D26-P1-X5).
 *
 * Thin product path on top of `@intafaced/venue-adapter` SOR cost model.
 * Quoting + cross-venue hedge + kill-switches for EXTERNAL venues only.
 * Internal half refuses with an honest reason (D26-P0-01).
 */
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
