import type { DepthTransport } from './depth-controller';
import { WsDepthTransport } from './ws-transport';

/**
 * WHERE THE LIVE BOOK COMES FROM.
 *
 * This file used to be a §13 socket explaining why there was no depth feed a
 * browser could reach. There is one now — `services/svc-ws` — so the socket is
 * gone and this is the wiring it described.
 *
 * ── What changed, and what deliberately did not ────────────────────────────
 *
 * The audit that socket recorded is still true in every part except the last:
 *
 *  · `svc-matching` still serves the only real snapshot, and is still ABSENT
 *    from svc-edge's route table. Nothing here talks to it. svc-ws does, over
 *    the read surface that needs no credential, and that is the whole reason
 *    svc-ws exists as its own process — see `services/svc-ws/README.md`.
 *  · svc-edge still cannot proxy a socket: its proxy buffers with
 *    `response.text()`. So svc-ws is a second public origin rather than another
 *    prefix behind the edge.
 *  · `svc-trade`'s tRPC router still has no depth procedure, and should not.
 *
 * ── Why this still takes no environment variable ───────────────────────────
 *
 * The origin is an ARGUMENT, resolved once in `app/layout.tsx` beside
 * `NEXT_PUBLIC_EDGE_URL` and handed down. That is the same property the socket
 * version protected, kept for the same reason: nothing deep in the component
 * tree may reach into the environment and conjure a feed whose provenance the
 * app cannot describe. There is one place a deployment is pointed at a front
 * door, and this is not it.
 *
 * When no origin is configured, this returns unavailable with a reason a user
 * can read — and the terminal draws an empty panel rather than six plausible
 * rows of numbers, exactly as before.
 */

export type DepthAvailability =
  | { readonly available: true; readonly transport: DepthTransport; readonly origin: string }
  | { readonly available: false; readonly reason: string; readonly blockedBy: string };

export const DEPTH_UNCONFIGURED_REASON =
  'No depth origin is configured for this deployment, so there is no book to show. svc-ws serves the live stream; this app needs its public URL to reach it.';

export const DEPTH_UNCONFIGURED_BLOCKED_BY = 'NEXT_PUBLIC_WS_URL · svc-ws';

/**
 * Resolve a live depth transport, or say why there is not one.
 *
 * `origin` is `http(s)://host:port` for svc-ws. A malformed one is reported the
 * same way a missing one is: a panel with a reason on it beats a panel with a
 * price on it that came from nowhere.
 */
export function resolveDepthTransport(origin: string | null | undefined): DepthAvailability {
  if (!origin) {
    return { available: false, reason: DEPTH_UNCONFIGURED_REASON, blockedBy: DEPTH_UNCONFIGURED_BLOCKED_BY };
  }

  try {
    const url = new URL(origin);
    // Checked here rather than at subscribe time: a misconfiguration should be
    // a panel that says so on first render, not an error thrown out of an
    // effect three seconds after the user opened the terminal.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(url.protocol);
    return { available: true, transport: new WsDepthTransport({ origin }), origin: url.origin };
  } catch {
    return {
      available: false,
      reason: `The configured depth origin "${origin}" is not a URL this app can open a stream to. It must be http(s)://host:port for svc-ws.`,
      blockedBy: DEPTH_UNCONFIGURED_BLOCKED_BY,
    };
  }
}
