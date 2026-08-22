/**
 * trade.otc product policy — RFQ desk honesty (D-S-02 Part A / SOCKET §13).
 *
 * Spreads, stake gates, maker routing, and mid feed stay refuse-closed until owner law.
 */
import { OTC_DESK_LAW_RESIDUAL } from './errors.js';
import { OTC_MAKER_ROUTING_RESIDUAL, OTC_MAKER_ROUTING_SOCKET } from './maker-routing.js';
import {
  OTC_MID_FEED_FLAG_ON_SYMBOL_MAP_EMPTY,
  OTC_MID_FEED_FLAG_ON_VENUE_UNWIRED,
  OTC_MID_FEED_RESIDUAL,
  OTC_MID_FEED_SOCKET,
  type OtcMidFeedWiring,
} from './mid-feed.js';

export type OtcPolicySummary = ReturnType<typeof describeOtcPolicy>;

/** Public honesty board for trade.otc RFQ desk — no invented spread or maker book. */
export function describeOtcPolicy() {
  const midFeedWiringStates: readonly OtcMidFeedWiring[] = [
    'flag_off',
    'flag_on_venue_unwired',
    'flag_on_symbol_map_empty',
    'live_observation',
  ];
  return {
    deskLawUnsetResidual: OTC_DESK_LAW_RESIDUAL,
    makerRoutingSocket: OTC_MAKER_ROUTING_SOCKET,
    makerRoutingUnsetResidual: OTC_MAKER_ROUTING_RESIDUAL,
    midFeedSocket: OTC_MID_FEED_SOCKET,
    midFeedUnsetResidual: OTC_MID_FEED_RESIDUAL,
    midFeedWiringStates,
    midFeedFlagOnVenueUnwiredResidual: OTC_MID_FEED_FLAG_ON_VENUE_UNWIRED,
    midFeedFlagOnSymbolMapEmptyResidual: OTC_MID_FEED_FLAG_ON_SYMBOL_MAP_EMPTY,
    midFeedWiringHonest: true as const,
    platformPrincipalOnly: true as const,
    inventsSpreadBps: false as const,
    inventsStakeGate: false as const,
    inventsMakerBook: false as const,
    inventsMidPrice: false as const,
    moneyViaLedgerClientOnly: true as const,
  };
}
