/**
 * trade.otc product policy — RFQ desk honesty (D-S-02 Part A / SOCKET §13).
 *
 * Spreads, stake gates, maker routing, and mid feed stay refuse-closed until owner law.
 */
import { OTC_DESK_LAW_RESIDUAL } from './errors.js';
import { OTC_MAKER_ROUTING_RESIDUAL, OTC_MAKER_ROUTING_SOCKET } from './maker-routing.js';
import { OTC_MID_FEED_RESIDUAL, OTC_MID_FEED_SOCKET } from './mid-feed.js';

export type OtcPolicySummary = ReturnType<typeof describeOtcPolicy>;

/** Public honesty board for trade.otc RFQ desk — no invented spread or maker book. */
export function describeOtcPolicy() {
  return {
    deskLawUnsetResidual: OTC_DESK_LAW_RESIDUAL,
    makerRoutingSocket: OTC_MAKER_ROUTING_SOCKET,
    makerRoutingUnsetResidual: OTC_MAKER_ROUTING_RESIDUAL,
    midFeedSocket: OTC_MID_FEED_SOCKET,
    midFeedUnsetResidual: OTC_MID_FEED_RESIDUAL,
    platformPrincipalOnly: true as const,
    inventsSpreadBps: false as const,
    inventsStakeGate: false as const,
    inventsMakerBook: false as const,
    inventsMidPrice: false as const,
    moneyViaLedgerClientOnly: true as const,
  };
}
