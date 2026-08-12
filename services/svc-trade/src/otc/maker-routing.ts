/**
 * Maker-routed OTC settle — SOCKET §13 `socket.otc-maker-routing`.
 *
 * Platform-principal settle is real (marketMakerMakerFill). Routing a bound
 * fill to an external maker needs an owner-published routing recipe + ledger
 * path. Until then, settle must refuse by name — never invent a maker book.
 */

export const OTC_MAKER_ROUTING_SOCKET = 'socket.otc-maker-routing' as const;

export const OTC_MAKER_ROUTING_RESIDUAL =
  'Maker-routed OTC settle is refuse-closed until owner publishes maker routing + ledger recipe — SOCKET §13 socket.otc-maker-routing; platform principal only';

export function otcMakerRoutingStatus() {
  return {
    published: false as const,
    socket: OTC_MAKER_ROUTING_SOCKET,
    residual: OTC_MAKER_ROUTING_RESIDUAL,
  };
}
