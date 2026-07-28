/**
 * The route table — which path prefix reaches which service.
 *
 * Kept as data, and kept exhaustive on purpose. An edge that forwards anything
 * it does not recognise is a proxy for the whole internal network: one
 * unlisted service, one debug endpoint, one Actuator, and the perimeter is
 * decoration. **Unknown prefix → 404, never a pass-through.**
 *
 * `svc-ledger` and `svc-matching` are deliberately ABSENT. They serve
 * service-to-service HTTP authenticated by a shared secret (#50, #55), and no
 * browser has business reaching either — `ledger.post` moves value on a
 * module's own authority, which is exactly why there is no `ledger:write`
 * scope for a user token to carry.
 */

export interface Upstream {
  /** Path prefix, without a trailing slash. */
  readonly prefix: string;
  /** Env var holding the base URL, so nothing is hardcoded per environment. */
  readonly envVar: string;
  /** Default for local development only. */
  readonly devUrl: string;
}

export const UPSTREAMS: readonly Upstream[] = [
  { prefix: '/api/identity', envVar: 'IDENTITY_URL', devUrl: 'http://localhost:4002' },
  { prefix: '/api/trade', envVar: 'TRADE_URL', devUrl: 'http://localhost:4004' },
  { prefix: '/api/token', envVar: 'TOKEN_URL', devUrl: 'http://localhost:4003' },
  { prefix: '/api/agents', envVar: 'AGENTS_URL', devUrl: 'http://localhost:4008' },
  { prefix: '/api/bank', envVar: 'BANK_URL', devUrl: 'http://localhost:4009' },
  { prefix: '/api/p2p', envVar: 'P2P_URL', devUrl: 'http://localhost:4007' },
  { prefix: '/api/pay', envVar: 'PAY_URL', devUrl: 'http://localhost:4006' },
  { prefix: '/api/blueprint', envVar: 'BLUEPRINT_URL', devUrl: 'http://localhost:4011' },
  { prefix: '/api/protocol', envVar: 'PROTOCOL_URL', devUrl: 'http://localhost:4012' },
  // The Protocol Plane's front door. Routed like any other service — the edge
  // does not know or care that its procedures are permissionless; that is the
  // module's own jurisdiction rule, not a property of the route table.
  { prefix: '/api/dex', envVar: 'DEX_URL', devUrl: 'http://localhost:4010' },
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
      const rest = pathname.slice(upstream.prefix.length);
      return { upstream, path: rest === '' ? '/' : rest };
    }
  }
  return null;
}
