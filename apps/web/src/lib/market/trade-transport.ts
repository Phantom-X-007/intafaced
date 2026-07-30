import { z } from 'zod';
import type { TradePrint } from '@intafaced/market-data';

/**
 * THE LIVE TRADE-TAPE TRANSPORT — `svc-ws` `channel=trades`.
 *
 * Depth needs a controller (gap → withhold → resnapshot). A trade print does
 * not: each frame stands alone and `sequence` is only a dedupe key. So this is
 * thinner than `WsDepthTransport` — open a socket, validate frames, hand them
 * up. There is no separate HTTP snapshot; the hub replays its recent ring on
 * connect (`services/svc-ws/src/trade/hub.ts`).
 *
 * ── Money ──────────────────────────────────────────────────────────────────
 *
 * Price and quantity are decimal strings, never JSON numbers. A float that
 * slipped through would be wrong in a place nobody looks until a settlement
 * disagrees.
 *
 * ── Why the same origin as depth ───────────────────────────────────────────
 *
 * Same process, same public port, different channel query. Orders and positions
 * are deliberately not on this port (per-principal, private gateway).
 */

/**
 * Same decimal rule as `ws-transport.ts`, redeclared rather than imported so
 * the market layer does not couple two transports into one file.
 */
const decimal = z.string().regex(/^\d+(\.\d{1,18})?$/, 'expected an unsigned decimal string with at most 18 decimal places');

const tradePrintSchema = z.object({
  type: z.literal('trade'),
  marketId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  price: decimal,
  quantity: decimal,
  ts: z.string().min(1),
});

/**
 * The slice of `WebSocket` this uses.
 *
 * Structural rather than the DOM type so the transport is testable without a
 * browser or a live server — and so the tests exercise the same code the
 * browser runs, rather than a mock of it.
 */
export interface TradeSocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  close(): void;
}

export interface WsTradeTransportOptions {
  /** `http://host:port` or `https://…`. The socket URL is derived from it. */
  readonly origin: string;
  /** Injected in tests. */
  readonly openSocket?: (url: string) => TradeSocketLike;
}

/** `http` → `ws`, `https` → `wss`, always `channel=trades`. */
export function tradesStreamUrl(origin: string, marketId: string): string {
  const url = new URL(origin);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`trade origin must be http(s), got "${url.protocol}"`);
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/stream';
  url.search = `market=${encodeURIComponent(marketId)}&channel=trades`;
  return url.toString();
}

export class WsTradeTransport {
  readonly #origin: string;
  readonly #openSocket: (url: string) => TradeSocketLike;

  constructor(options: WsTradeTransportOptions) {
    this.#origin = options.origin.replace(/\/+$/, '');
    this.#openSocket = options.openSocket ?? ((url) => new WebSocket(url) as unknown as TradeSocketLike);
  }

  /**
   * Subscribe to public trade prints for one market.
   *
   * `onOpen` fires once the socket is up. The hub may replay zero prints for a
   * quiet market, so open — not the first print — is what moves the UI out of
   * "connecting" without inventing a last price.
   *
   * Returns an unsubscribe that closes the socket and silences callbacks. A
   * close we asked for is not reported as an error.
   */
  subscribe(marketId: string, onPrint: (print: TradePrint) => void, onError: (err: Error) => void, onOpen?: () => void): () => void {
    let socket: TradeSocketLike;
    try {
      socket = this.#openSocket(tradesStreamUrl(this.#origin, marketId));
    } catch (err) {
      // A bad origin must surface as an unavailable panel with a reason, not as
      // an exception thrown out of a React effect.
      onError(err instanceof Error ? err : new Error('could not open the trade stream'));
      return () => undefined;
    }

    let stopped = false;

    socket.onopen = () => {
      if (!stopped) onOpen?.();
    };

    socket.onmessage = (event) => {
      if (stopped) return;
      let raw: unknown;
      try {
        raw = JSON.parse(String(event.data));
      } catch {
        onError(new Error('trade stream sent a frame that is not JSON'));
        return;
      }

      const parsed = tradePrintSchema.safeParse(raw);
      if (!parsed.success) {
        // Drop it and say so. Applying a half-understood print is how a tape
        // starts inventing prices quietly.
        onError(new Error('trade stream sent a frame this client does not understand'));
        return;
      }
      onPrint(parsed.data);
    };

    socket.onerror = () => {
      if (!stopped) onError(new Error('trade stream connection failed'));
    };

    socket.onclose = (event) => {
      // A close is not an error when we asked for it. When we did not, the
      // reason svc-ws sent is the most useful thing a user can be shown.
      if (stopped) return;
      onError(new Error(event.reason ? `trade stream closed: ${event.reason}` : `trade stream closed (${event.code})`));
    };

    return () => {
      stopped = true;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    };
  }
}
