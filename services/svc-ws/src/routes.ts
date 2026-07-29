import type { FastifyInstance } from 'fastify';
import { toSnapshot, type DepthHub } from './depth/hub.js';
import { DepthSourceError, type DepthSource } from './depth/source.js';
import type { TradeHub } from './trade/hub.js';
import { withWsSpan } from './tracing.js';

/**
 * The HTTP half of the gateway.
 *
 * ── Why there is an HTTP snapshot at all ────────────────────────────────────
 *
 * `DepthController` (apps/web) resnapshots on a gap, and it must be able to do
 * that WITHOUT tearing down the socket — a reconnect would lose the deltas that
 * arrive during it, which is the bug the controller's buffer exists to prevent.
 * So the snapshot is a plain GET, served from the same book the deltas are
 * diffed against, and the two therefore cannot disagree.
 *
 * The alternative — a "resnapshot please" verb on the socket — would mean
 * parsing inbound frames on an unauthenticated public port. That is a bigger
 * surface than one GET.
 *
 * ── CORS ────────────────────────────────────────────────────────────────────
 *
 * `Access-Control-Allow-Origin: *` on this route, with no
 * `Allow-Credentials`. The browser reaches this service directly (svc-edge
 * buffers and cannot proxy the socket, so putting the snapshot behind the edge
 * and the stream beside it would split one feed across two origins). A wildcard
 * is correct precisely because the response carries nothing about the caller:
 * there is no cookie, no token, and no per-caller content, so "any origin may
 * read this" is a true statement rather than a relaxation. `*` also makes the
 * browser refuse to send credentials, which is the behaviour we want.
 */

/** Same bound as the socket's. The hub does the authoritative check. */
const MARKET_ID = /^[A-Za-z0-9._:-]{1,64}$/;

export interface RouteOptions {
  readonly hub: DepthHub;
  readonly tradeHub: TradeHub;
  readonly source: DepthSource;
  readonly depthLimit: number;
  readonly serviceName: string;
  readonly upstream: string;
  readonly enabled: () => boolean;
}

export function registerRoutes(app: FastifyInstance, options: RouteOptions): void {
  const { hub, tradeHub, source, depthLimit, serviceName, upstream, enabled } = options;

  app.get('/health', async () => ({
    ok: true,
    service: serviceName,
    enabled: enabled(),
    connections: hub.connections + tradeHub.connections,
    depthConnections: hub.connections,
    tradeConnections: tradeHub.connections,
  }));

  /**
   * Readiness is stricter than liveness, as everywhere else in the fleet: the
   * process can be perfectly alive while the kill-switch is off, and a load
   * balancer should stop sending it connections without anyone paging.
   */
  app.get('/ready', async (_req, reply) => {
    if (!enabled()) return reply.code(503).send({ ready: false, reason: 'ws.gateway flag is off' });
    return {
      ready: true,
      upstream,
      depthLimit,
      markets: hub.knownMarkets,
      depth: hub.stats,
      trades: tradeHub.stats,
    };
  });

  app.get('/markets/:marketId/depth', async (req, reply) => {
    reply.header('access-control-allow-origin', '*');

    if (!enabled()) return reply.code(503).send({ code: 'Unavailable', message: 'ws.gateway flag is off' });

    const { marketId } = req.params as { marketId: string };
    if (!MARKET_ID.test(marketId)) {
      return reply.code(400).send({ code: 'BadRequest', message: 'market id must be 1-64 chars of [A-Za-z0-9._:-]' });
    }

    try {
      // Checked against the engine's own market list BEFORE any depth call.
      // `engine.depth()` upstream creates the book if it is missing, so an
      // unchecked id here is a way to grow svc-matching's memory over HTTP.
      if (!(await hub.ensureKnownMarket(marketId))) {
        return reply.code(404).send({ code: 'MarketNotFound', message: `svc-matching has no book for "${marketId}"` });
      }

      // Prefer the hub's own book: it is the exact state every delta on the
      // socket is diffed against, so a client that fetches here and then applies
      // deltas cannot land between two versions of the truth.
      const book = hub.bookFor(marketId);
      if (book) return reply.code(200).send(toSnapshot(book));

      const snapshot = await withWsSpan('ws.depth.snapshot', { marketId }, () => source.snapshot(marketId, depthLimit));
      return reply.code(200).send(snapshot);
    } catch (err) {
      // 502, not 500: this service is fine, svc-matching is not, and a caller
      // needs to tell those apart before deciding whether to retry.
      const message = err instanceof DepthSourceError ? err.message : 'depth unavailable';
      req.log.error({ err, marketId }, 'ws: snapshot failed');
      return reply.code(502).send({ code: 'UpstreamUnavailable', message });
    }
  });

  /** The market list, so a client can discover what it may subscribe to. */
  app.get('/markets', async (_req, reply) => {
    reply.header('access-control-allow-origin', '*');
    return reply.code(200).send({ markets: hub.knownMarkets });
  });
}
