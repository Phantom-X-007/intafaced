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
  const q = url.searchParams.get('access_token');
  if (q) return q;
  const raw = headers.authorization;
  if (!raw || Array.isArray(raw)) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m?.[1] ?? null;
}

export function createPrivateWebSocketGateway(options: PrivateWebSocketGatewayOptions): PrivateWebSocketGateway {
  const { server, hub, heartbeatMs, log, enabled, tokens } = options;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_024 });
  let live = 0;

  server.on('upgrade', (req, socket, head) => {
    void (async () => {
      try {
        const host = req.headers.host ?? 'localhost';
        const url = new URL(req.url ?? '/', `http://${host}`);
        if (url.pathname !== PRIVATE_STREAM_PATH) return;

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
          live++;
          const detach = hub.attach(userId, sinkFor(ws));
          const heartbeat = setInterval(() => {
            if (ws.readyState === ws.OPEN) ws.ping();
          }, heartbeatMs);

          ws.on('close', () => {
            clearInterval(heartbeat);
            detach();
            live = Math.max(0, live - 1);
          });
          ws.on('error', () => {
            clearInterval(heartbeat);
            detach();
          });
          // Inbound frames are ignored — private stream is push-only, same as public.
          ws.on('message', () => undefined);

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
        log.warn({ err: String(err) }, 'ws-private: upgrade failed');
        try {
          reject(socket, 500, 'Internal Server Error');
        } catch {
          /* ignore */
        }
      }
    })();
  });

  return {
    get connections() {
      return live;
    },
    async close(reason: string) {
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
