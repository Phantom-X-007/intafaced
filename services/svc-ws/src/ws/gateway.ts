import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { CLOSE_GOING_AWAY, CLOSE_POLICY, type DepthHub, type DepthSink, type HubLogger } from '../depth/hub.js';
import { PRIVATE_STREAM_PATH } from '../private/gateway.js';
import type { TradeHub } from '../trade/hub.js';

/**
 * THE SOCKET.
 *
 * ── No authentication, and no way to become one ─────────────────────────────
 *
 * A price is not a secret and a public market's depth is the point of it being
 * public (§9). So this port takes no token, reads no cookie, and verifies no
 * principal. The hazard with an unauthenticated public port is not that
 * somebody reads a price — it is that it becomes a path to something else, so:
 *
 *   · **Inbound frames are never interpreted.** There is no subscribe verb, no
 *     command vocabulary, no JSON parser on the read side. The market is a
 *     query parameter on the upgrade and it is the only thing a client ever
 *     says. `maxPayload` is 1 KiB so a client cannot make us buffer one either.
 *     One market per socket; a terminal that wants two opens two.
 *   · **The market id is checked against the engine's own list** before any
 *     depth call is made for it. `svc-matching`'s `engine.depth()` creates the
 *     book if it is missing, so an unvalidated id is a memory-growth primitive
 *     against the engine, driven from a browser. `DepthHub.ensureKnownMarket`
 *     is that check and `depth/source.ts` explains it at length.
 *   · **The process holds no credential.** Not `INTERNAL_SERVICE_SECRET`, not
 *     `EDGE_PRINCIPAL_SECRET`, no database URL. Compromising this service gets
 *     an attacker the ability to read public depth and public trade prints,
 *     which they already had. Connecting to NATS for `orderFilled` does not
 *     change that — the bus is not a money path and the public wire strips
 *     order ids before fan-out.
 *
 * There is deliberately no Origin check. An origin allow-list is an
 * authorisation control, and there is nothing here to authorise — it would
 * inconvenience a bot without protecting anything, since the same data is a
 * `curl` away. Cross-site WebSocket hijacking is a risk to endpoints that
 * carry ambient credentials; this one carries none.
 *
 * ── Channels ────────────────────────────────────────────────────────────────
 *
 * `?market=<id>` alone is depth (snapshot + deltas), unchanged. Pass
 * `channel=trades` for the public trade tape. Orders and positions are
 * per-principal and are deliberately not on this port.
 *
 * ── Why not through svc-edge ────────────────────────────────────────────────
 *
 * The edge proxy buffers with `response.text()` — its README lists streaming
 * under "Not built yet" — so it cannot carry a socket. Routing this through it
 * would mean teaching the edge to upgrade connections, which grows the one
 * component whose whole design goal is the smallest blast radius in the fleet.
 * A second public port on a process that holds nothing is the cheaper trade.
 */

/** Bounded before anything else touches it. The hub does the authoritative check. */
const MARKET_ID = /^[A-Za-z0-9._:-]{1,64}$/;

export const STREAM_PATH = '/stream';

export type StreamChannel = 'depth' | 'trades';

export interface WebSocketGatewayOptions {
  readonly server: Server;
  readonly hub: DepthHub;
  readonly tradeHub: TradeHub;
  readonly heartbeatMs: number;
  readonly log: HubLogger;
  /** Reads the kill-switch at connection time, so flipping it needs no restart. */
  readonly enabled: () => boolean;
}

export interface WebSocketGateway {
  readonly connections: number;
  close(reason: string): Promise<void>;
}

/** RFC 6455 caps a close reason at 123 bytes; a longer one throws. */
function closeReason(reason: string): string {
  return reason.length <= 120 ? reason : `${reason.slice(0, 117)}...`;
}

function sinkFor(socket: WebSocket): DepthSink {
  return {
    get bufferedBytes() {
      // The socket's OWN buffer. This service keeps no queue of its own, so
      // this is the only place a slow client can accumulate anything.
      return socket.bufferedAmount;
    },
    send(frame: string) {
      socket.send(frame);
    },
    close(code: number, reason: string) {
      socket.close(code, closeReason(reason));
    },
  };
}

function reject(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function parseChannel(raw: string | null): StreamChannel | null {
  if (raw === null || raw === '' || raw === 'depth') return 'depth';
  if (raw === 'trades') return 'trades';
  return null;
}

export function createWebSocketGateway(options: WebSocketGatewayOptions): WebSocketGateway {
  const { server, hub, tradeHub, heartbeatMs, log, enabled } = options;

  const wss = new WebSocketServer({
    noServer: true,
    // Nothing inbound is read, so nothing inbound needs room. This is the cap
    // on what one client can make this process allocate.
    maxPayload: 1024,
    // Compression is off: per-message deflate holds a zlib context per socket
    // (~300 KiB with default windows), which turns "many idle subscribers" —
    // the normal state of a market-data server — into a memory problem. Depth
    // frames are small and already mostly digits.
    perMessageDeflate: false,
  });

  /** Sockets that have not answered the last ping. */
  const alive = new WeakSet<WebSocket>();

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    // Fixed base — never Host. Same reason as private: a Host-derived base can
    // throw before the path check and, on co-mount, abort later upgrade listeners
    // with an uncaught exception so the socket never gets a 4xx and hangs.
    let url: URL;
    try {
      url = new URL(request.url ?? '/', 'http://gateway.invalid');
    } catch (err) {
      log.warn({ err: String(err) }, 'ws: unreadable upgrade URL');
      return reject(socket, 400, 'Bad Request');
    }
    // Co-mounted with private gateway: Node fires every upgrade listener.
    // Only ignore the private path so private auth can run; other paths still 404.
    // Shared constant — string drift would 404 private before auth ever runs.
    if (url.pathname === PRIVATE_STREAM_PATH) return;
    if (url.pathname !== STREAM_PATH) return reject(socket, 404, 'Not Found');

    if (!enabled()) return reject(socket, 503, 'Service Unavailable');

    const marketId = url.searchParams.get('market');
    if (!marketId || !MARKET_ID.test(marketId)) return reject(socket, 400, 'Bad Request');

    const channel = parseChannel(url.searchParams.get('channel'));
    if (channel === null) return reject(socket, 400, 'Bad Request');

    wss.handleUpgrade(request, socket, head, (ws) => {
      const detach = channel === 'trades' ? tradeHub.attach(marketId, sinkFor(ws)) : hub.attach(marketId, sinkFor(ws));
      // Capacity refuse closes the sink inside attach — terminate so the client
      // never sits half-open with zero frames (mirrors private gateway).
      if (!detach) {
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        return;
      }

      alive.add(ws);
      ws.on('pong', () => alive.add(ws));
      // Inbound frames are dropped without being parsed. See the header.
      ws.on('message', () => undefined);
      ws.on('error', () => ws.terminate());
      ws.on('close', detach);
    });
  };

  server.on('upgrade', onUpgrade);

  /**
   * A socket that stopped answering is not a subscriber, it is a book snapshot
   * being computed for nobody every tick. TCP will not tell us for minutes.
   */
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  return {
    get connections() {
      return wss.clients.size;
    },
    async close(reason: string) {
      clearInterval(heartbeat);
      server.off('upgrade', onUpgrade);
      // Say why, rather than dropping the TCP connection: a client that is told
      // reconnects with backoff, and one that is not reconnects immediately.
      hub.closeAll(CLOSE_GOING_AWAY, reason);
      tradeHub.closeAll(CLOSE_GOING_AWAY, reason);
      for (const ws of wss.clients) ws.close(CLOSE_GOING_AWAY, closeReason(reason));
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      log.info({ reason }, 'ws: gateway closed');
    },
  };
}

export { CLOSE_POLICY };
