import type { DepthTransport } from './depth-controller';

/**
 * WHERE A LIVE BOOK WOULD COME FROM — and why there is not one today.
 *
 * This file is a §13 socket, written as code rather than as a TODO so the shape
 * of the missing piece is unambiguous.
 *
 * ── The audit ──────────────────────────────────────────────────────────────
 *
 * There are exactly two pieces of depth machinery in the repo, and neither is
 * reachable from a browser:
 *
 *  1. **`svc-matching` serves `GET /markets/:marketId/depth?limit=`** — a real
 *     snapshot with a real engine sequence. It is deliberately ABSENT from the
 *     edge route table (`services/svc-edge/src/routes.ts`): it authenticates
 *     with `INTERNAL_SERVICE_SECRET`, and putting that secret in a browser — or
 *     giving `apps/web` a server route that holds it — would hand the public
 *     surface a credential that reaches the internal network. svc-edge's README
 *     is explicit that the internet-facing component holds the smallest blast
 *     radius in the fleet. So we do not do it.
 *
 *  2. **There is no delta stream at all.** `ws.gateway` ("WebSocket fan-out:
 *     depth, trades, orders, positions") is not built — see
 *     `tooling/tracker/features.mjs`. svc-matching's README calls the Redis
 *     snapshot sink for it future work. And svc-edge cannot proxy one anyway:
 *     its proxy buffers with `response.text()`, which is not a websocket path.
 *
 * `svc-trade`'s tRPC router — the one thing behind `/api/trade` — has
 * `markets`, `orders` and `fills`, and no depth procedure of any kind.
 *
 * ── What this means for the terminal ───────────────────────────────────────
 *
 * The book renders as unavailable, with that reason on screen. It does not
 * render six plausible rows of numbers. A hardcoded ladder is worse than an
 * empty panel, because a hardcoded ladder is a price a trader will act on.
 *
 * `DepthController` above is complete and tested against the gap → resnapshot
 * contract. When a transport exists, it is constructed here and returned from
 * `resolveDepthTransport`; nothing else in the app changes.
 */

export type DepthAvailability =
  | { readonly available: true; readonly transport: DepthTransport; readonly origin: string }
  | { readonly available: false; readonly reason: string; readonly blockedBy: string };

export const DEPTH_SOCKET_REASON =
  'No depth feed is reachable from a browser. svc-matching serves snapshots but is deliberately absent from the svc-edge route table, and the ws.gateway delta stream is not built.';

export const DEPTH_SOCKET_BLOCKED_BY = 'ws.gateway · svc-edge route table';

/**
 * Resolve a live depth transport, or say why there is not one.
 *
 * Takes no environment override on purpose. An env var that could point this at
 * some other host would be a way to make the panel show numbers whose
 * provenance the app cannot describe — which is exactly the failure the socket
 * exists to prevent.
 */
export function resolveDepthTransport(): DepthAvailability {
  return { available: false, reason: DEPTH_SOCKET_REASON, blockedBy: DEPTH_SOCKET_BLOCKED_BY };
}
