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
