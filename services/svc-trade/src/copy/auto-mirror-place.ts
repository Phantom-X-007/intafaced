/**
 * Auto-mirror place into spot — SOCKET §13 `socket.copy-auto-mirror-place`.
 *
 * `planMirror` claims a durable mirror plan + exposure. Placing that plan as a
 * real spot order is a separate product wire (session-key / follower principal
 * place path). Until that wire exists, public doors must refuse by name —
 * never invent a fill or silently drop the plan.
 */

export const COPY_AUTO_MIRROR_PLACE_SOCKET = 'socket.copy-auto-mirror-place' as const;

export const COPY_AUTO_MIRROR_PLACE_RESIDUAL =
  'trade.copy auto-mirror place into spot is refuse-closed until the follower place wire lands — SOCKET §13 socket.copy-auto-mirror-place; planMirror only; never invent fills';

export function autoMirrorPlaceStatus() {
  return {
    published: false as const,
    socket: COPY_AUTO_MIRROR_PLACE_SOCKET,
    residual: COPY_AUTO_MIRROR_PLACE_RESIDUAL,
  };
}
