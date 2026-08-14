/**
 * Auto-mirror place into spot — follower `placeOrder` wire.
 *
 * `planMirror` claims a durable plan. Place uses the follower's live principal
 * through the ordinary spot path (holds + ledger). Never invents a fill.
 *
 * When the place port is not wired, doors still refuse by name (SOCKET residual).
 *
 * `clientOrderId` on placeOrder is 1–64 chars. A raw
 * `copy-mirror:<followUuid>:<engineFillId>` overflows as soon as fillId is a
 * real engine key — and then the hold retry key is refused, which looks like
 * copy is broken when the book is fine. Hash when the readable form does not fit.
 */
import { createHash } from 'node:crypto';
import type { Principal } from '@intafaced/auth';
import type { Amount } from '@intafaced/ledger-client';

export const COPY_AUTO_MIRROR_PLACE_SOCKET = 'socket.copy-auto-mirror-place' as const;

export const COPY_AUTO_MIRROR_PLACE_RESIDUAL =
  'trade.copy auto-mirror place into spot is refuse-closed until the follower place port is wired — SOCKET §13 socket.copy-auto-mirror-place; planMirror only; never invent fills';

/** Same bound as TradeService.placeOrderInner — a retry key longer than this never holds. */
export const COPY_MIRROR_CLIENT_ORDER_ID_MAX = 64;

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
  const readable = `copy-mirror:${followId}:${fillId}`;
  if (readable.length <= COPY_MIRROR_CLIENT_ORDER_ID_MAX) return readable;
  return createHash('sha256').update(readable).digest('hex').slice(0, COPY_MIRROR_CLIENT_ORDER_ID_MAX);
}
