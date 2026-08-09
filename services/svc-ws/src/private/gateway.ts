import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { verifyAccessToken, type TokenConfig } from '@intafaced/auth';
import { CLOSE_GOING_AWAY, type DepthSink, type HubLogger } from '../depth/hub.js';
import type { PrivateOrderHub } from './hub.js';

/**
 * Authenticated private stream (orders, fills, positions).
 *
 * Separate path from the public `/stream` so the public port never grows a
 * credential. Token is `?access_token=` on the upgrade URL (browsers cannot
 * set Authorization on WebSocket upgrades reliably).
 *
 * When `tokens` is null the private path is disabled (403 on upgrade).
 * Positions updates only arrive when `trade.futures` publishes `positionUpdated`;
 * the channel still announces ready so clients do not invent a second socket.
 */

export const PRIVATE_STREAM_PATH = '/private/stream';

export interface PrivateWebSocketGatewayOptions {
  readonly server: Server;
  readonly hub: PrivateOrderHub;
  readonly heartbeatMs: number;
  readonly log: HubLogger;
  readonly enabled: () => boolean;
  /** Null ⇒ private path refuses all upgrades. */
  readonly tokens: TokenConfig | null;
}

export interface PrivateWebSocketGateway {
  readonly connections: number;
  close(reason: string): Promise<void>;
}

function closeReason(reason: string): string {
  return reason.length <= 120 ? reason : `${reason.slice(0, 117)}...`;
}

function sinkFor(socket: WebSocket): DepthSink {
  return {
    get bufferedBytes() {
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

function tokenFrom(url: URL, headers: IncomingMessage['headers']): string | null {
  const q = url.searchParams.get('access_token')?.trim();
  if (q) return q;
  const raw = headers.authorization;
  if (!raw || Array.isArray(raw)) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  return m?.[1] ?? null;
}

export function createPrivateWebSocketGateway(options: PrivateWebSocketGatewayOptions): PrivateWebSocketGateway {
  const { server, hub, heartbeatMs, log, enabled, tokens } = options;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_024, perMessageDeflate: false });

  /**
   * Sockets that have not answered the last ping. Same contract as the public
   * gateway: a client that stops ponging is not a subscriber, it is hub work
   * for nobody — TCP will not tell us for minutes, so we terminate.
   */
  const alive = new WeakSet<WebSocket>();

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    void (async () => {
      // Fixed base — never Host. Path+query live on `req.url`. A Host-derived
      // base can throw (e.g. `Host: a b`) *before* the private-path check; the
      // catch below would then HTTP-500/destroy a socket the public gateway
      // already upgraded on the same server. That is a co-mount isolation break.
      let url: URL;
      try {
        url = new URL(req.url ?? '/', 'http://gateway.invalid');
      } catch (err) {
        // Destroy the socket — a bare return leaves the TCP upgrade hung until
        // the client times out, and on co-mount a public-path parse throw used
        // to abort this listener before we could even get here.
        log.warn({ err: String(err) }, 'ws-private: unreadable upgrade URL');
        try {
          reject(socket, 400, 'Bad Request');
        } catch {
          /* already gone */
        }
        return;
      }
      if (url.pathname !== PRIVATE_STREAM_PATH) return;

      try {
        if (!enabled()) {
          reject(socket, 503, 'Service Unavailable');
          return;
        }
        if (!tokens) {
          reject(socket, 403, 'Forbidden');
          return;
        }

        const raw = tokenFrom(url, req.headers);
        if (!raw) {
          reject(socket, 401, 'Unauthorized');
          return;
        }

        let userId: string;
        try {
          const principal = await verifyAccessToken(raw, tokens);
          if (!principal.userId) {
            reject(socket, 401, 'Unauthorized');
            return;
          }
          if (!principal.scopes.includes('trade:read') && !principal.scopes.includes('trade:write')) {
            reject(socket, 403, 'Forbidden');
            return;
          }
          userId = principal.userId;
        } catch {
          reject(socket, 401, 'Unauthorized');
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          const detach = hub.attach(userId, sinkFor(ws));
          // Capacity refuse closes the sink inside attach — never announce ready
          // for a subscription the hub did not take (fail-closed, no false start).
          if (!detach) {
            // sink.close may race the client open; terminate so the client always
            // sees a hard end and does not sit half-open with zero ready frames.
            try {
              ws.terminate();
            } catch {
              /* ignore */
            }
            return;
          }

          alive.add(ws);
          ws.on('pong', () => alive.add(ws));
          // Inbound frames are ignored — private stream is push-only, same as public.
          ws.on('message', () => undefined);
          ws.on('error', () => ws.terminate());
          // terminate() still emits close — free the hub seat.
          ws.on('close', detach);

          try {
            ws.send(JSON.stringify({ channel: 'orders', type: 'ready', userId }));
            ws.send(JSON.stringify({ channel: 'fills', type: 'ready', userId }));
            ws.send(JSON.stringify({ channel: 'positions', type: 'ready', userId }));
          } catch {
            /* ignore */
          }
          log.info({ userId }, 'ws-private: client connected');
        });
      } catch (err) {
        // Only runs for PRIVATE_STREAM_PATH after the early return above.
        log.warn({ err: String(err) }, 'ws-private: upgrade failed');
        try {
          reject(socket, 500, 'Internal Server Error');
        } catch {
          /* ignore */
        }
      }
    })();
  };

  server.on('upgrade', onUpgrade);

  /**
   * A socket that stopped answering is not a private subscriber — it still holds
   * a hub seat and keeps the process computing frames for nobody. Mirror public
   * `/stream`: miss one pong window → terminate.
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
      await hub.close(reason);
      for (const client of wss.clients) {
        try {
          client.close(CLOSE_GOING_AWAY, closeReason(reason));
        } catch {
          /* ignore */
        }
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
