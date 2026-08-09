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
  /**
   * Base URL of svc-identity (no trailing slash). Used only when the bearer
   * is a long-lived API key (`ifc_…`) so we can call public `apiKeys.exchange`
   * without giving the edge `INTERNAL_SERVICE_SECRET`.
   */
  identityUrl?: string;
  /** Injected in tests. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Hop-by-hop headers (RFC 7230 §6.1) plus the request identity headers the
 * edge must rewrite itself.
 *
 * Until this list was complete, the comment above claimed the class while only
 * `connection` (plus `host` / `content-length`) was stripped — an audit finding
 * (`docs/audit/2026-08-08-svc-edge.md` #7). `transfer-encoding`, `te`,
 * `trailer`, `upgrade`, `keep-alive` and the proxy-auth pair were forwarded.
 * Undici may reject some of those outbound, but a safety control that relies on
 * the outbound client to paper over a leaky filter is not a control.
 *
 * `host` is not hop-by-hop in the RFC sense; it is stripped because the
 * upstream's host must be the edge's own choice, never the caller's.
 * `content-length` is stripped because the proxy re-serialises the body with
 * `JSON.stringify` and a stale length would lie.
 */
export const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

/** Strip every reserved header, whatever its case. */
export function stripReserved(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower.startsWith(RESERVED_HEADER_PREFIX)) continue;
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
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
 * Platform API keys are `ifc_` + base64url and never contain `.`.
 * Access JWTs are three base64 segments separated by dots — never confuse them.
 */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith('ifc_') && !token.includes('.');
}

/**
 * Call identity's public `apiKeys.exchange` and return the short-lived JWT.
 * Returns null on any failure (wrong key, network, unexpected body).
 */
export async function exchangeApiKeyForAccessToken(
  key: string,
  identityUrl: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string | null> {
  const base = identityUrl.replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetchFn(`${base}/trpc/apiKeys.exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // tRPC HTTP RPC + superjson-shaped body (works with plain json too).
      body: JSON.stringify({ json: { key } }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  // Prefer tRPC envelope; fall back to bare { accessToken }.
  const envelope = body as {
    result?: { data?: { json?: { accessToken?: string }; accessToken?: string } };
    accessToken?: string;
  };
  const token = envelope.result?.data?.json?.accessToken ?? envelope.result?.data?.accessToken ?? envelope.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
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

  let token = bearerFrom(headers);
  if (!token) return { headers: forward, principal: null, rejected: null };

  // Long-lived API key → short-lived JWT via identity (public exchange).
  // Edge still has no INTERNAL_SERVICE_SECRET; this is the only allowed call
  // shape to identity for credentials.
  if (looksLikeApiKey(token)) {
    if (!options.identityUrl) {
      return { headers: forward, principal: null, rejected: 'invalid' };
    }
    const exchanged = await exchangeApiKeyForAccessToken(token, options.identityUrl, options.fetch);
    if (!exchanged) {
      return { headers: forward, principal: null, rejected: 'invalid' };
    }
    token = exchanged;
  }

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
  forward[EDGE_SIGNATURE_HEADER] = signPrincipalHeader(raw, options.edgeSecret, options.region);

  return { headers: forward, principal, rejected: null };
}
