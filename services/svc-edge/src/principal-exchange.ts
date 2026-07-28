import { AuthError, verifyAccessToken, type Principal, type TokenConfig } from '@intafaced/auth';
import { encodePrincipal, signPrincipalHeader, EDGE_PRINCIPAL_HEADER, EDGE_SIGNATURE_HEADER } from '@intafaced/contracts';

/**
 * THE EDGE (§9) — where a bearer token becomes a principal.
 *
 * Every mounted service reads `ctx.principal` and never re-derives it, and
 * `createEdgeContext` will only believe a principal that carries a valid
 * signature. Nothing in the platform produced that signature. The result, found
 * by audit: **every `scopedProcedure` in the OS refused every caller**, because
 * svc-identity issued a JWT that opened no door.
 *
 * This module is the join. It is the only place in the system that turns proof
 * of identity into authority, so its failure modes are the platform's.
 *
 * ── The rule that matters more than the happy path ──────────────────────────
 *
 * `x-intafaced-*` headers are the edge's vocabulary, not the caller's. A client
 * that sends `x-intafaced-principal` is either confused or attacking, and the
 * two are indistinguishable from here.
 *
 * So the headers are STRIPPED FIRST, unconditionally, before any decision about
 * whether to add our own. Not overwritten — stripped. The difference matters on
 * every path where we decide NOT to set them: an anonymous request, a failed
 * verification, an expired token. Overwriting only protects the success case,
 * which is the one case that was never at risk.
 *
 * `region` is included in that strip, and that is the subtle one. It drives the
 * jurisdiction matrix (§9) — which modules a caller may reach at all. A client
 * that could set its own region could select its own regulator.
 */

/** Headers a client may never supply. Stripped before anything else happens. */
export const RESERVED_HEADER_PREFIX = 'x-intafaced-';

export interface ExchangeResult {
  /** Headers to forward upstream. Never includes anything the client sent. */
  headers: Record<string, string>;
  /** Null for an anonymous request — which is a valid outcome, not an error. */
  principal: Principal | null;
  /** Why a token was refused. Null when accepted or when none was offered. */
  rejected: 'malformed' | 'expired' | 'invalid' | null;
}

export interface ExchangeOptions {
  tokens: TokenConfig;
  /** Shared with every mounted service. Signs the principal we forward. */
  edgeSecret: string;
  /**
   * Resolved server-side — never from the request. Today a single configured
   * value; when geo-IP lands it resolves per request. Either way the caller
   * does not get a vote.
   */
  region: string;
}

/** Strip every reserved header, whatever its case. */
export function stripReserved(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower.startsWith(RESERVED_HEADER_PREFIX)) continue;
    // Hop-by-hop headers must not be proxied; `host` must be the upstream's.
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue;
    // The upstream has no use for the bearer token and should never see it —
    // a service that can read a token is a service that can replay it.
    if (lower === 'authorization') continue;
    if (value === undefined) continue;
    out[lower] = Array.isArray(value) ? (value[0] ?? '') : value;
  }
  return out;
}

function bearerFrom(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

/**
 * Exchange an inbound request's credentials for forwardable headers.
 *
 * Never throws on a bad token. A caller presenting a forged or expired token is
 * an ordinary event on a public endpoint, and it must land the request on the
 * service as ANONYMOUS rather than as a 500 — `protectedProcedure` will refuse
 * it there with the right status. Failing closed means failing quietly to
 * anonymous, not failing loudly.
 */
export async function exchangePrincipal(
  headers: Record<string, string | string[] | undefined>,
  options: ExchangeOptions,
  now: Date = new Date(),
): Promise<ExchangeResult> {
  // FIRST. Before parsing, before verifying, before any branch that might
  // return early — nothing the client sent under our prefix survives.
  const forward = stripReserved(headers);
  forward['x-intafaced-region'] = options.region;

  const token = bearerFrom(headers);
  if (!token) return { headers: forward, principal: null, rejected: null };

  let principal: Principal;
  try {
    principal = await verifyAccessToken(token, options.tokens);
  } catch (err) {
    const code = err instanceof AuthError ? err.code : 'token.invalid';
    const rejected = code === 'token.expired' ? 'expired' : code === 'token.malformed' ? 'malformed' : 'invalid';
    return { headers: forward, principal: null, rejected };
  }

  // Belt and braces: `verifyAccessToken` checks `exp`, but the principal we
  // SIGN carries its own `expiresAt` and services re-check it. If those ever
  // disagree, the shorter one must win, and refusing here is how that happens.
  if (principal.expiresAt.getTime() <= now.getTime()) {
    return { headers: forward, principal: null, rejected: 'expired' };
  }

  const raw = encodePrincipal(principal);
  forward[EDGE_PRINCIPAL_HEADER] = raw;
  forward[EDGE_SIGNATURE_HEADER] = signPrincipalHeader(raw, options.edgeSecret);

  return { headers: forward, principal, rejected: null };
}
