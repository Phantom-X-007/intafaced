import { WsTradeTransport } from './trade-transport';

/**
 * WHERE THE PUBLIC TRADE TAPE COMES FROM.
 *
 * Same origin as depth: `NEXT_PUBLIC_WS_URL` → svc-ws. Depth is the default
 * channel on `/stream`; trades pass `channel=trades`. The app already carries
 * that origin through context (`useDepthOrigin`) so a component cannot point
 * the tape at a host whose provenance it cannot state.
 *
 * When no origin is configured, this returns unavailable with a reason a user
 * can read — and the terminal draws an empty panel rather than a row of
 * invented last prices.
 */

export type TradeAvailability =
  | { readonly available: true; readonly transport: WsTradeTransport; readonly origin: string }
  | { readonly available: false; readonly reason: string; readonly blockedBy: string };

export const TRADE_UNCONFIGURED_REASON =
  'No market-data origin is configured for this deployment, so there is no public tape to show. svc-ws serves channel=trades; this app needs its public URL to reach it.';

export const TRADE_UNCONFIGURED_BLOCKED_BY = 'NEXT_PUBLIC_WS_URL · svc-ws channel=trades';

/**
 * Resolve a live trade transport, or say why there is not one.
 *
 * `origin` is `http(s)://host:port` for svc-ws — the same value depth uses.
 */
export function resolveTradeTransport(origin: string | null | undefined): TradeAvailability {
  if (!origin) {
    return { available: false, reason: TRADE_UNCONFIGURED_REASON, blockedBy: TRADE_UNCONFIGURED_BLOCKED_BY };
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(url.protocol);
    return { available: true, transport: new WsTradeTransport({ origin }), origin: url.origin };
  } catch {
    return {
      available: false,
      reason: `The configured market-data origin "${origin}" is not a URL this app can open a stream to. It must be http(s)://host:port for svc-ws.`,
      blockedBy: TRADE_UNCONFIGURED_BLOCKED_BY,
    };
  }
}
