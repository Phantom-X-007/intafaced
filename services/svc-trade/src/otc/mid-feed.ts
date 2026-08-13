/**
 * Live OTC mid feed — SOCKET §13 `socket.otc-mid-feed`.
 *
 * `createConfigOtcMidSource` stamps a fixed boot map (asOf = boot). That is
 * not a live feed: after owner `maxMidAgeSeconds` the desk goes dark on purpose.
 * Closing this socket needs an observation feed that refreshes asOf — never
 * invent mids or keep a boot memory past age.
 */

export const OTC_MID_FEED_SOCKET = 'socket.otc-mid-feed' as const;

export const OTC_MID_FEED_RESIDUAL =
  'Live OTC mid feed is refuse-closed until an observation source refreshes asOf — SOCKET §13 socket.otc-mid-feed; boot TRADE_OTC_MIDS map is not a live feed; never invent mids';

export function otcMidFeedStatus() {
  return {
    published: false as const,
    socket: OTC_MID_FEED_SOCKET,
    residual: OTC_MID_FEED_RESIDUAL,
    /** Honest label: config boot map exists in code but is not this socket closed. */
    bootMapAllowed: true as const,
    liveObservationFeed: false as const,
  };
}
