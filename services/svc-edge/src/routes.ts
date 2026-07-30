import type { ModuleId } from '@intafaced/config';

/**
 * The route table — which path prefix reaches which service.
 *
 * Kept as data, and kept exhaustive on purpose. An edge that forwards anything
 * it does not recognise is a proxy for the whole internal network: one
 * unlisted service, one debug endpoint, one Actuator, and the perimeter is
 * decoration. **Unknown prefix → 404, never a pass-through.**
 *
 * `svc-ledger` and `svc-matching` are deliberately ABSENT from `/api/*`. They
 * serve service-to-service HTTP authenticated by a shared secret (#50, #55),
 * and no browser has business reaching either — `ledger.post` moves value on a
 * module's own authority, which is exactly why there is no `ledger:write`
 * scope for a user token to carry. The ledger's OPERATOR surface (the durable
 * posting freeze) is reached instead through the explicit, non-proxied
 * `/admin/ledger/*` routes in `admin-api.ts`, which forward one named
 * procedure each rather than opening a path to the money plane.
 */

export interface Upstream {
  /** Path prefix, without a trailing slash. */
  readonly prefix: string;
  /**
   * The module this prefix belongs to, stated rather than derived.
   *
   * ── Why this field exists, and what it cost to not have it ────────────────
   *
   * An earlier revision derived the module by stripping `/api/` off the prefix.
   * That works for twelve of the thirteen routes and fails silently on the one
   * that matters: `/api/v1` is the public CCXT REST contract, it forwards to
   * `svc-trade`, and `v1` is not a module id. Two bugs came out of that single
   * assumption.
   *
   * The first is loud: building the map threw at import, so `svc-edge` did not
   * boot at all. The second is the dangerous one, and it is what a "fix" that
   * skipped unmappable prefixes would have shipped — `/api/v1` would have had
   * no module, so killing `trade` would have refused `/api/trade/trpc/
   * orders.create` while `POST /api/v1/orders` kept placing orders. An operator
   * would have read "trade: killed" on the console while the exchange took new
   * risk through the front door.
   *
   * Stating the module makes both impossible: the type requires it, and one
   * upstream naming a different module than its prefix suggests is now a
   * deliberate, reviewable line rather than an accident of string handling.
   */
  readonly module: ModuleId;
  /** Env var holding the base URL, so nothing is hardcoded per environment. */
  readonly envVar: string;
  /** Default for local development only. */
  readonly devUrl: string;
  /**
   * When true, forward the full inbound pathname instead of stripping `prefix`.
   * Used for CCXT-contract paths (`/api/v1/...`) that must land on the upstream
   * at the same absolute path (the exchange mounts `/api/v1/markets`, not `/markets`).
   */
  readonly preservePath?: boolean;
}

export const UPSTREAMS: readonly Upstream[] = [
  { prefix: '/api/identity', module: 'identity', envVar: 'IDENTITY_URL', devUrl: 'http://localhost:4002' },
  { prefix: '/api/trade', module: 'trade', envVar: 'TRADE_URL', devUrl: 'http://localhost:4004' },
  // Public exchange REST (CCXT contract paths). Path preserved so
  // edge /api/v1/markets → trade /api/v1/markets.
  //
  // `module: 'trade'` and not 'v1'. This is the same service as the row above
  // reached under a different contract, so the kill-switch must treat the two
  // as one module or halting the market would only halt half of it.
  { prefix: '/api/v1', module: 'trade', envVar: 'TRADE_URL', devUrl: 'http://localhost:4004', preservePath: true },
  { prefix: '/api/token', module: 'token', envVar: 'TOKEN_URL', devUrl: 'http://localhost:4003' },
  { prefix: '/api/agents', module: 'agents', envVar: 'AGENTS_URL', devUrl: 'http://localhost:4008' },
  { prefix: '/api/bank', module: 'bank', envVar: 'BANK_URL', devUrl: 'http://localhost:4009' },
  { prefix: '/api/p2p', module: 'p2p', envVar: 'P2P_URL', devUrl: 'http://localhost:4007' },
  { prefix: '/api/pay', module: 'pay', envVar: 'PAY_URL', devUrl: 'http://localhost:4006' },
  { prefix: '/api/blueprint', module: 'blueprint', envVar: 'BLUEPRINT_URL', devUrl: 'http://localhost:4011' },
  { prefix: '/api/protocol', module: 'protocol', envVar: 'PROTOCOL_URL', devUrl: 'http://localhost:4012' },
  // The Protocol Plane's front door. Routed like any other service — the edge
  // does not know or care that its procedures are permissionless; that is the
  // module's own jurisdiction rule, not a property of the route table.
  { prefix: '/api/dex', module: 'dex', envVar: 'DEX_URL', devUrl: 'http://localhost:4010' },
  // svc-indexer mounts its router and answers on 4013, but had no route here,
  // so every chain query 404'd at the edge while the service itself was
  // healthy. A service reachable only from inside the network is not reachable.
  { prefix: '/api/indexer', module: 'indexer', envVar: 'INDEXER_URL', devUrl: 'http://localhost:4013' },
  { prefix: '/api/notify', module: 'notify', envVar: 'NOTIFY_URL', devUrl: 'http://localhost:4015' },
  { prefix: '/api/academy', module: 'academy', envVar: 'ACADEMY_URL', devUrl: 'http://localhost:4016' },
] as const;

export interface Resolved {
  readonly upstream: Upstream;
  /** Path to request on the upstream, with the prefix removed. */
  readonly path: string;
}

/**
 * Resolve an inbound path, or null.
 *
 * Longest prefix wins, so `/api/identity-admin` could never be captured by
 * `/api/identity` if such a route were added later. Matching is on a segment
 * boundary for the same reason.
 */
export function resolve(pathname: string): Resolved | null {
  const candidates = [...UPSTREAMS].sort((a, b) => b.prefix.length - a.prefix.length);

  for (const upstream of candidates) {
    if (pathname === upstream.prefix || pathname.startsWith(`${upstream.prefix}/`)) {
      if (upstream.preservePath) {
        return { upstream, path: pathname };
      }
      const rest = pathname.slice(upstream.prefix.length);
      return { upstream, path: rest === '' ? '/' : rest };
    }
  }
  return null;
}
