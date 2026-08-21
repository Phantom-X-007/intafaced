/**
 * trade.options product policy — settlement law honesty (SOCKET §13).
 *
 * Consolidates refuse codes and public posture from `options-listing.ts`.
 * Does not invent live set, settlement asset, refuse matrix, D7 fixing source, or IV surface.
 */

/** §13 socket — options/forex settlement asset law (D26-P0-05). */
export const OPTIONS_SETTLEMENT_SOCKET = 'socket.options-settlement-asset-law' as const;

/** SOCKET §13 pin — keep this code; do not invent a second refuse. */
export const OPTIONS_SETTLEMENT_LAW_UNSET = 'trade.options_settlement_law_unset' as const;

/** D7 fixing env blank after P0-05 is stamped. */
export const OPTIONS_FIXING_UNCONFIGURED = 'trade.options_fixing_unconfigured' as const;

/** Half-listed or invalid contract terms on kind=options. */
export const OPTIONS_TERMS_INCOMPLETE = 'trade.options_terms_incomplete' as const;

export const OPTIONS_SETTLEMENT_RESIDUAL =
  'D26-P0-05 settlement asset law + D7 fixing + complete European terms — refuse-closed (never invent live set / settlement asset / matrix / IV)';

export type OptionType = 'call' | 'put';

/** v1 title is European only — American is not modelled. */
export type OptionStyle = 'european';

export type OptionsPolicySummary = {
  readonly socket: typeof OPTIONS_SETTLEMENT_SOCKET;
  readonly settlementLawUnsetCode: typeof OPTIONS_SETTLEMENT_LAW_UNSET;
  readonly fixingUnconfiguredCode: typeof OPTIONS_FIXING_UNCONFIGURED;
  readonly termsIncompleteCode: typeof OPTIONS_TERMS_INCOMPLETE;
  readonly settlementAssetLawStamped: boolean;
  readonly settlementFixingConfigured: boolean;
  readonly statusLine: string;
  readonly residual: typeof OPTIONS_SETTLEMENT_RESIDUAL;
  readonly blockers: readonly ['D26-P0-05', 'D7_fixing', 'complete_european_terms'];
  readonly allowed: {
    readonly nonOptionsListing: true;
    readonly optionsListing: boolean;
    readonly optionsOrders: false;
  };
  readonly europeanOnly: true;
  readonly fullCollateralV1: true;
  readonly inventsLiveSet: false;
  readonly inventsSettlementAsset: false;
  readonly inventsIvSurface: false;
  readonly ordersStillRefuseUntilEngine: true;
};

/** Public trade.options policy door — mirrors listing gates only, not trading engine. */
export function describeOptionsPolicy(input?: {
  readonly settlementAssetLawConfigured?: string;
  readonly settlementFixingConfigured?: string;
}): OptionsPolicySummary {
  const lawStamped = (input?.settlementAssetLawConfigured ?? '').trim().length > 0;
  const fixingConfigured = (input?.settlementFixingConfigured ?? '').trim().length > 0;
  const listingAllowed = lawStamped && fixingConfigured;
  return {
    socket: OPTIONS_SETTLEMENT_SOCKET,
    settlementLawUnsetCode: OPTIONS_SETTLEMENT_LAW_UNSET,
    fixingUnconfiguredCode: OPTIONS_FIXING_UNCONFIGURED,
    termsIncompleteCode: OPTIONS_TERMS_INCOMPLETE,
    settlementAssetLawStamped: lawStamped,
    settlementFixingConfigured: fixingConfigured,
    statusLine: `socket=${OPTIONS_SETTLEMENT_SOCKET} lawStamped=${lawStamped ? 1 : 0} fixingConfigured=${fixingConfigured ? 1 : 0}`,
    residual: OPTIONS_SETTLEMENT_RESIDUAL,
    blockers: ['D26-P0-05', 'D7_fixing', 'complete_european_terms'],
    allowed: {
      nonOptionsListing: true,
      optionsListing: listingAllowed,
      optionsOrders: false,
    },
    europeanOnly: true,
    fullCollateralV1: true,
    inventsLiveSet: false,
    inventsSettlementAsset: false,
    inventsIvSurface: false,
    ordersStillRefuseUntilEngine: true,
  };
}
