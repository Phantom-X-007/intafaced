/**
 * Live OTC mid feed — SOCKET §13 `socket.otc-mid-feed`.
 *
 * `createConfigOtcMidSource` stamps a fixed boot map (asOf = boot). That is
 * not a live feed: after owner `maxMidAgeSeconds` the desk goes dark on purpose.
 *
 * Closing this socket: `createVenueOtcMidSource` refreshes asOf from the venue
 * snapshot's observedAt when TRADE_OTC_MID_FROM_VENUE is on and a public adapter
 * exists. Default remains OFF. Never invent mids; unmapped / dark book → null.
 */

export const OTC_MID_FEED_SOCKET = 'socket.otc-mid-feed' as const;

export const OTC_MID_FEED_RESIDUAL =
  'Live OTC mid feed is refuse-closed until TRADE_OTC_MID_FROM_VENUE + a known public venue adapter — SOCKET §13 socket.otc-mid-feed; boot TRADE_OTC_MIDS map is not a live feed; never invent mids';

export function otcMidFeedStatus(liveObservationFeed = false) {
  if (liveObservationFeed) {
    return {
      published: true as const,
      socket: OTC_MID_FEED_SOCKET,
      residual: null,
      bootMapAllowed: false as const,
      liveObservationFeed: true as const,
    };
  }
  return {
    published: false as const,
    socket: OTC_MID_FEED_SOCKET,
    residual: OTC_MID_FEED_RESIDUAL,
    /** Honest label: config boot map exists in code but is not this socket closed. */
    bootMapAllowed: true as const,
    liveObservationFeed: false as const,
  };
}
