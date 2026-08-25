import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { verifyAccessToken, type TokenConfig } from '@intafaced/auth';
import { resolveWsCopy, WS_COPY } from '../copy.js';
import { CLOSE_GOING_AWAY, type DepthSink, type HubLogger } from '../depth/hub.js';
import { type PrivateOrderHub, type PrivateStreamChannel } from './hub.js';
import { EMPTY_PRIVATE_BOOK, type PrivateBookPort } from './book.js';
import { CodController, type CodLeaseRange, type TradeCancelPort } from './cod.js';
import { assertLiveCredential, type LiveCredentialPort } from './live-credential.js';

/**
 * Authenticated private stream (orders, fills, positions).
 *
 * Separate path from the public `/stream` so the public port never grows a
 * credential. Token is `?access_token=` on the upgrade URL (browsers cannot
 * set Authorization on WebSocket upgrades reliably).
 *
 * `?channel=orders|fills|positions` selects one catalog. Omitted (or empty)
 * announces and fans all three — back-compat. Unknown channel is HTTP 400.
 * Positions updates still only arrive when `trade.futures` publishes
 * `positionUpdated`; a positions ready frame is not a fabricated book.
 *
 * When `tokens` is null the private path is disabled (403 on upgrade).
 */

export const PRIVATE_STREAM_PATH = '/private/stream';

/** Application close: access token `exp` elapsed (HTTP 401 is upgrade-only). */
export const CLOSE_UNAUTHORIZED = 4003;

/** `setTimeout` delay is a 32-bit signed int; longer waits fire immediately. */
const MAX_TIMEOUT_MS = 2_147_483_647;

const PRIVATE_CHANNELS: readonly PrivateStreamChannel[] = ['orders', 'fills', 'positions'];

/**
 * Drop `access_token` from a request-target so access logs never store the credential.
 * Query parse uses a fixed base — the Host header is not involved.
 */
export function redactAccessTokenQuery(requestTarget: string): string {
  const q = requestTarget.indexOf('?');
  if (q === -1 || !requestTarget.includes('access_token=')) return requestTarget;
  let parsed: URL;
  try {
    parsed = new URL(requestTarget, 'http://gateway.invalid');
  } catch {
    return requestTarget.slice(0, q);
  }
  if (!parsed.searchParams.has('access_token')) return requestTarget;
  parsed.searchParams.delete('access_token');
  const search = parsed.searchParams.toString();
  return search ? `${parsed.pathname}?${search}` : parsed.pathname;
}

/**
 * `null` = unknown (caller 400s). `'all'` = omitted/empty query (three frames).
 * Mirrors public `parseChannel` shape, with a different default.
 */
function parsePrivateChannel(raw: string | null): PrivateStreamChannel | 'all' | null {
  if (raw === null || raw === '') return 'all';
  if (raw === 'orders' || raw === 'fills' || raw === 'positions') return raw;
  return null;
}

export interface PrivateWebSocketGatewayOptions {
  readonly server: Server;
  readonly hub: PrivateOrderHub;
  readonly heartbeatMs: number;
  readonly log: HubLogger;
  readonly enabled: () => boolean;
  /** Null ⇒ private path refuses all upgrades. */
  readonly tokens: TokenConfig | null;
  /**
   * Whether private bus consumers are attached. Ready frames include `bus: true|false`
   * so a client can tell "quiet market" from "unsubscribed — will miss updates".
   * Defaults to true when omitted (unit tests that do not wire a bus).
   */
  readonly busAttached?: () => boolean;
  /**
   * Current open orders (and positions). Tests inject a fake; production uses
   * `HttpPrivateBookPort` against svc-trade `GET /api/v1/orders/open`.
   * Omitted → honest empty snapshot (`orders: []`), not omitted frames.
   */
  readonly book?: PrivateBookPort;
  /** Owner socket. Null/omit → arm refuses `cod.lease_range_unconfigured`. */
  readonly codRange?: CodLeaseRange | null;
  /** Optional user-token cancel-all. Missing → fire reports OUTCOME_UNKNOWN. */
  readonly tradeCancel?: TradeCancelPort | null;
  readonly now?: () => number;
  readonly scheduleCod?: (fn: () => void, delayMs: number) => () => void;
  /**
   * Injected live session/key check. Omitted/null = JWT `exp` only.
   * Production wires this when IDENTITY_URL and IDENTITY_OWNERSHIP_SECRET are set.
   */
  readonly liveCredential?: LiveCredentialPort | null;
}

export interface PrivateWebSocketGateway {
  readonly connections: number;
  /** COD leases on this replica. Revoke must drop to 0 without `cod.fired`. */
  readonly armedCount: number;
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

type PrivateSeat = {
  token: string;
  expiresAtMs: number;
  userId: string;
  hasWrite: boolean;
  sessionId: string;
  apiKeyId?: string;
};

function sinkFor(
  socket: WebSocket,
  seat: PrivateSeat,
  live?: { assert: () => Promise<void>; onDead: () => void },
): DepthSink {
  return {
    get bufferedBytes() {
      return socket.bufferedAmount;
    },
    send(frame: string) {
      if (Date.now() >= seat.expiresAtMs) {
        closeUnauthorized(socket);
        return;
      }
      if (!live) {
        socket.send(frame);
        return;
      }
      void live.assert().then(
        () => {
          if (socket.readyState === socket.OPEN && Date.now() < seat.expiresAtMs) {
            socket.send(frame);
          }
        },
        () => {
          live.onDead();
          closeUnauthorized(socket);
        },
      );
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
