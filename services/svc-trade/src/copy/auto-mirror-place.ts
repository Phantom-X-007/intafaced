/**
 * Auto-mirror place into spot — follower `placeOrder` wire.
 *
 * `planMirror` claims a durable plan. Place uses the follower's live principal
 * through the ordinary spot path (holds + ledger). Never invents a fill.
 *
 * When the place port is not wired, doors still refuse by name (SOCKET residual).
 */
import type { Principal } from '@intafaced/auth';
import type { Amount } from '@intafaced/ledger-client';

export const COPY_AUTO_MIRROR_PLACE_SOCKET = 'socket.copy-auto-mirror-place' as const;

export const COPY_AUTO_MIRROR_PLACE_RESIDUAL =
  'trade.copy auto-mirror place into spot is refuse-closed until the follower place port is wired — SOCKET §13 socket.copy-auto-mirror-place; planMirror only; never invent fills';

export type PlaceFollowerOrderInput = {
  readonly symbol?: string;
  readonly marketId?: string;
  readonly side: 'buy' | 'sell';
  readonly qty: Amount;
  readonly clientOrderId: string;
};

export type PlaceFollowerOrderPort = (principal: Principal, input: PlaceFollowerOrderInput) => Promise<{ orderId: string }>;

export function autoMirrorPlaceStatus(wired: boolean) {
  return {
    published: wired,
    socket: COPY_AUTO_MIRROR_PLACE_SOCKET,
    residual: wired ? null : COPY_AUTO_MIRROR_PLACE_RESIDUAL,
  };
}

export function copyMirrorClientOrderId(followId: string, fillId: string): string {
  return `copy-mirror:${followId}:${fillId}`;
}
