/**
 * @intafaced/execution-arb — §28 external-only arbitrage scanner (D26-P1-X4).
 *
 * Thin product path on top of `@intafaced/venue-adapter` SOR cost model.
 * No second ranking rule, no invented spreads/fees, no internal house legs.
 */
export {
  CROSS_EXCHANGE_DEFAULT_MID,
  CROSS_EXCHANGE_DEFAULT_SPREAD_BPS,
  HOUSE_ARB_PREFERENCE_BPS,
  isCrossRailPair,
  isExternalVenueKind,
  isHouseBookKind,
  scanExternalCrossExchangeArb,
  type ArbInventory,
  type ArbOpportunity,
  type ArbRefuseReason,
  type ArbRefusal,
  type ArbScanItem,
  type ArbVenueQuote,
  type ScanExternalArbInput,
  type ScanExternalArbResult,
} from './arbitrage.js';
export { ARB_BRIDGE_FANTASY_REFUSE_REASON, describeArbitragePolicy, type ArbitragePolicySummary } from './arb-policy.js';
export {
  arbCapitalGate,
  EXECUTION_ARB_MAX_QUOTE_AGE_MS_ENV,
  type ArbCapitalGate,
  type ArbCapitalRefuseReason,
} from './arb-owner-capital-gate.js';
export { ARB_SCAN_CLASSES, EMPTY_BOOK_REFUSE, scanArbClass, type ArbScanClass, type ScanArbClassInput } from './arb-classes.js';
export {
  ARB_LEGS_ATOMIC,
  ARB_LEG_OUTCOMES,
  planArbLegs,
  reduceArbLegGroup,
  type ArbLegGroupFailure,
  type ArbLegGroupRefuseReason,
  type ArbLegGroupResult,
  type ArbLegGroupSuccess,
  type ArbLegOutcome,
  type ArbLegResult,
  type ArbPlannedLeg,
  type PlanArbLegsAccepted,
  type PlanArbLegsInput,
  type PlanArbLegsRefuseReason,
  type PlanArbLegsRefusal,
  type PlanArbLegsResult,
  type ReduceArbLegGroupInput,
} from './arb-legs.js';
export {
  ARB_UNKNOWN_VENUE_SIGNALS,
  observeArbLeg,
  recordArbVenueLegs,
  recoverArbFills,
  type ArbFillConflict,
  type ArbFillFact,
  type ArbUnknownVenueSignalKind,
  type ArbVenueSignal,
  type ObserveArbLegInput,
  type ObserveArbLegResult,
  type RecordArbVenueLegsInput,
  type RecordArbVenueLegsResult,
  type RecoverArbFillsResult,
} from './arb-outage.js';
