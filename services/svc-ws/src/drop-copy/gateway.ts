import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { verifyAccessToken, type TokenConfig } from '@intafaced/auth';
import { resolveWsCopy, WS_COPY } from '../copy.js';
import { CLOSE_GOING_AWAY, type DepthSink, type HubLogger } from '../depth/hub.js';
import { redactAccessTokenQuery } from '../private/gateway.js';
import { DROP_COPY_CHANNEL, type DropCopyHub } from './hub.js';

/**
 * Authenticated drop-copy session — separate from `/private/stream`.
 *
 * Read-only evidence. Inbound frames are ignored (no place/cancel vocabulary).
 * Channel is only `drop_copy`; `orders`/`fills` on this path is HTTP 400.
 */

export const DROP_COPY_STREAM_PATH = '/drop-copy/stream';

export const CLOSE_UNAUTHORIZED = 4003;

const MAX_TIMEOUT_MS = 2_147_483_647;

export interface DropCopyWebSocketGatewayOptions {
  readonly server: Server;
  readonly hub: DropCopyHub;
  readonly heartbeatMs: number;
  readonly log: HubLogger;
  readonly enabled: () => boolean;
  readonly tokens: TokenConfig | null;
}

export interface DropCopyWebSocketGateway {
  readonly connections: number;
  close(reason: string): Promise<void>;
}

function closeReason(reason: string): string {
  const copy = resolveWsCopy(reason);
  return copy.length <= 120 ? copy : `${copy.slice(0, 117)}...`;
}

function closeUnauthorized(socket: WebSocket): void {
  try {
    if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
      socket.close(CLOSE_UNAUTHORIZED, closeReason(WS_COPY.tokenExpired));
    }
  } catch {
    try {
      socket.terminate();
    } catch {
      /* ignore */
    }
  }
}

function sinkFor(socket: WebSocket, seat: { expiresAtMs: number }): DepthSink {
  return {
    get bufferedBytes() {
      return socket.bufferedAmount;
    },
    send(frame: string) {
      if (Date.now() >= seat.expiresAtMs) {
        closeUnauthorized(socket);
        return;
      }
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

function parseDropCopyChannel(raw: string | null): typeof DROP_COPY_CHANNEL | null {
  if (raw === null || raw === '' || raw === DROP_COPY_CHANNEL) return DROP_COPY_CHANNEL;
  return null;
}

export function createDropCopyWebSocketGateway(options: DropCopyWebSocketGatewayOptions): DropCopyWebSocketGateway {
  const { server, hub, heartbeatMs, log, enabled, tokens } = options;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_024, perMessageDeflate: false });

  const alive = new WeakSet<WebSocket>();
  const seats = new WeakMap<WebSocket, { token: string; expiresAtMs: number }>();
  const expiryTimers = new Set<ReturnType<typeof setTimeout>>();

  function armExpiry(ws: WebSocket, expiresAtMs: number): ReturnType<typeof setTimeout> {
    const delay = Math.max(0, Math.min(expiresAtMs - Date.now(), MAX_TIMEOUT_MS));
    const timer = setTimeout(() => {
      expiryTimers.delete(timer);
      closeUnauthorized(ws);
    }, delay);
    timer.unref?.();
    expiryTimers.add(timer);
    return timer;
  }

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    void (async () => {
      let url: URL;
      try {
        url = new URL(req.url ?? '/', 'http://gateway.invalid');
      } catch (err) {
        log.warn({ err: String(err) }, 'ws-drop-copy: unreadable upgrade URL');
        try {
          reject(socket, 400, 'Bad Request');
        } catch {
          /* already gone */
        }
        return;
      }
      if (url.pathname !== DROP_COPY_STREAM_PATH) return;
      req.url = redactAccessTokenQuery(req.url ?? '/');

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
        let expiresAtMs: number;
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
          expiresAtMs = principal.expiresAt.getTime();
        } catch {
          reject(socket, 401, 'Unauthorized');
          return;
        }

        if (parseDropCopyChannel(url.searchParams.get('channel')) === null) {
          reject(socket, 400, 'Bad Request');
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          const seat = { token: raw, expiresAtMs };
          const sink = sinkFor(ws, seat);
          const detach = hub.attach(userId, sink);
          if (!detach) {
            try {
              ws.terminate();
            } catch {
              /* ignore */
            }
            return;
          }

          seats.set(ws, seat);
          alive.add(ws);
          const expiryTimer = armExpiry(ws, expiresAtMs);
          ws.on('pong', () => alive.add(ws));
          // Push-only. No command surface — place/cancel JSON is discarded.
          ws.on('message', () => undefined);
          ws.on('error', () => ws.terminate());
          ws.on('close', () => {
            clearTimeout(expiryTimer);
            expiryTimers.delete(expiryTimer);
            detach();
          });
          log.info({ userId }, 'ws-drop-copy: client connected');
        });
      } catch (err) {
        log.warn({ err: String(err) }, 'ws-drop-copy: upgrade failed');
        try {
          reject(socket, 500, 'Internal Server Error');
        } catch {
          /* ignore */
        }
      }
    })();
  };

  server.on('upgrade', onUpgrade);

  const heartbeat = setInterval(() => {
    hub.sweepLag();
    for (const ws of wss.clients) {
      const seat = seats.get(ws);
      if (seat && Date.now() >= seat.expiresAtMs) {
        closeUnauthorized(ws);
        continue;
      }
      if (seat && tokens) {
        void verifyAccessToken(seat.token, tokens).then(
          (principal) => {
            if (ws.readyState !== ws.OPEN) return;
            seat.expiresAtMs = principal.expiresAt.getTime();
          },
          () => closeUnauthorized(ws),
        );
      }
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
      for (const timer of expiryTimers) clearTimeout(timer);
      expiryTimers.clear();
      server.off('upgrade', onUpgrade);
      const copy = resolveWsCopy(reason);
      await hub.close(copy);
      for (const client of wss.clients) {
        try {
          client.close(CLOSE_GOING_AWAY, closeReason(copy));
        } catch {
          /* ignore */
        }
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
