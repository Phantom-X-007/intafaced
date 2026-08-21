/**
 * trade.options product policy — settlement law honesty (SOCKET §13).
 *
 * Does not invent live set, settlement asset, refuse matrix, or D7 fixing source.
 */
import { OPTIONS_SETTLEMENT_LAW_UNSET } from './options-listing.js';

export type OptionsPolicySummary = ReturnType<typeof describeOptionsPolicy>;

/** Public honesty board for trade.options — listing gates only, not trading engine. */
export function describeOptionsPolicy(input?: { readonly settlementAssetLawConfigured?: string }) {
  const stamped = (input?.settlementAssetLawConfigured ?? '').trim().length > 0;
  return {
    settlementLawUnsetCode: OPTIONS_SETTLEMENT_LAW_UNSET,
    settlementAssetLawStamped: stamped,
    europeanOnly: true as const,
    fullCollateralV1: true as const,
    inventsLiveSet: false as const,
    inventsSettlementAsset: false as const,
    inventsIvSurface: false as const,
    ordersStillRefuseUntilEngine: true as const,
  };
}
