/**
 * @intafaced/execution-arb — §28 external-only arbitrage scanner (D26-P1-X4).
 *
 * Thin product path on top of `@intafaced/venue-adapter` SOR cost model.
 * No second ranking rule, no invented spreads/fees, no internal house legs.
 */
export {
  CROSS_EXCHANGE_DEFAULT_SPREAD_BPS,
  isCrossRailPair,
  isExternalVenueKind,
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
