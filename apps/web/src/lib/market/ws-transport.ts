import { z } from 'zod';
import type { DepthMessage, DepthSnapshot } from '@intafaced/market-data';
import type { DepthTransport } from './depth-controller';

/**
 * THE LIVE DEPTH TRANSPORT — `svc-ws`.
 *
 * `DepthController` above it does the hard part (gap → withhold the book →
 * resnapshot). This is the plumbing under it, and it is deliberately thin: the
 * wire format is `DepthMessage` from `@intafaced/market-data`, unchanged, so
 * the server's `diffDepth` and this app's `applyDelta` are two halves of one
 * function rather than two implementations of one idea.
 *
 * ── Why this does not go through svc-edge ──────────────────────────────────
 *
 * The edge proxy buffers with `response.text()` (`services/svc-edge/src/index.ts`
 * — its README lists streaming under "Not built yet"), so it cannot carry a
 * socket. svc-ws is therefore a second public origin. That is a deliberate
 * trade argued in `services/svc-ws/README.md`: svc-ws holds no database, no
 * bus, no service secret and no principal key, so a second door onto it opens
 * onto a room containing public prices and nothing else.
 *
 * ── Why the snapshot is a separate GET ─────────────────────────────────────
 *
 * A resnapshot must not tear down the socket, or the deltas that arrive during
 * it are lost — which is the exact failure `DepthController`'s buffer exists to
 * prevent. So the snapshot is an ordinary fetch, served by svc-ws from the same
 * book its deltas are diffed against. The two cannot disagree.
 *
 * ── Money ──────────────────────────────────────────────────────────────────
 *
 * Every price and quantity is validated as a decimal string before it reaches
 * `bookFromSnapshot`. A JSON number that slipped through would be a float, and
 * a float in an order book is wrong in a place nobody looks.
 */

/**
 * The same rule `lib/api/wire.ts` uses, declared again here rather than
 * imported. The market layer must not depend on the tRPC wire layer: this
 * transport speaks to svc-ws over its own protocol and shares nothing with the
 * edge client but a house style. One regex is a cheaper duplication than a
 * dependency that says two unrelated things are one thing.
 */
const decimal = z.string().regex(/^\d+(\.\d{1,18})?$/, 'expected an unsigned decimal string with at most 18 decimal places');

const wireLevel = z.tuple([decimal, decimal]);

const snapshotSchema = z.object({
  type: z.literal('snapshot'),
  marketId: z.string(),
  sequence: z.number().int(),
  bids: z.array(wireLevel),
  asks: z.array(wireLevel),
});

const deltaSchema = z.object({
  type: z.literal('delta'),
  marketId: z.string(),
  fromSequence: z.number().int(),
  sequence: z.number().int(),
  bids: z.array(wireLevel),
  asks: z.array(wireLevel),
});

const messageSchema = z.discriminatedUnion('type', [snapshotSchema, deltaSchema]);

/**
 * The slice of `WebSocket` this uses.
 *
 * Structural rather than the DOM type so the transport is testable without a
 * browser or a live server — and so the tests exercise the same code the
 * browser runs, rather than a mock of it.
 */
export interface DepthSocketLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  close(): void;
}

export interface WsDepthTransportOptions {
  /** `http://host:port` or `https://…`. The socket URL is derived from it. */
  readonly origin: string;
  /** Injected in tests. */
  readonly openSocket?: (url: string) => DepthSocketLike;
  readonly fetch?: typeof globalThis.fetch;
}

/** `http` → `ws`, `https` → `wss`. Anything else is a configuration error. */
export function streamUrl(origin: string, marketId: string): string {
  const url = new URL(origin);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`depth origin must be http(s), got "${url.protocol}"`);
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/stream';
  url.search = `market=${encodeURIComponent(marketId)}`;
  return url.toString();
}

export function snapshotUrl(origin: string, marketId: string): string {
  return `${origin.replace(/\/+$/, '')}/markets/${encodeURIComponent(marketId)}/depth`;
}

export class WsDepthTransport implements DepthTransport {
  readonly #origin: string;
  readonly #openSocket: (url: string) => DepthSocketLike;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: WsDepthTransportOptions) {
    this.#origin = options.origin.replace(/\/+$/, '');
    this.#openSocket = options.openSocket ?? ((url) => new WebSocket(url) as unknown as DepthSocketLike);
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async snapshot(marketId: string, signal?: AbortSignal): Promise<DepthSnapshot> {
    const response = await this.#fetch(snapshotUrl(this.#origin, marketId), signal ? { signal } : {});
    if (!response.ok) throw new Error(`depth snapshot failed: svc-ws answered ${response.status}`);

    const parsed = snapshotSchema.safeParse(await response.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(`depth snapshot was not a snapshot: ${first ? `${first.path.join('.')}: ${first.message}` : 'shape mismatch'}`);
    }
    return parsed.data;
  }

  subscribe(marketId: string, onMessage: (message: DepthMessage) => void, onError: (err: Error) => void): () => void {
    let socket: DepthSocketLike;
    try {
      socket = this.#openSocket(streamUrl(this.#origin, marketId));
    } catch (err) {
      // A bad origin must surface as an unavailable panel with a reason, not as
      // an exception thrown out of a React effect.
      onError(err instanceof Error ? err : new Error('could not open the depth stream'));
      return () => undefined;
    }

    let stopped = false;

    socket.onmessage = (event) => {
      if (stopped) return;
      let raw: unknown;
      try {
        raw = JSON.parse(String(event.data));
      } catch {
        onError(new Error('depth stream sent a frame that is not JSON'));
        return;
      }

      const parsed = messageSchema.safeParse(raw);
      if (!parsed.success) {
        // Drop it and say so. Applying a half-understood frame is how a book
        // starts disagreeing with the exchange quietly.
        onError(new Error('depth stream sent a frame this client does not understand'));
        return;
      }
      onMessage(parsed.data);
    };

    socket.onerror = () => {
      if (!stopped) onError(new Error('depth stream connection failed'));
    };

    socket.onclose = (event) => {
      // A close is not an error when we asked for it. When we did not, the
      // reason svc-ws sent is the most useful thing a user can be shown —
      // "slow consumer", "unknown market", "gateway shutting down".
      if (stopped) return;
      onError(new Error(event.reason ? `depth stream closed: ${event.reason}` : `depth stream closed (${event.code})`));
    };

    return () => {
      stopped = true;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    };
  }
}
