import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * TRANSPORT HARDENING — the two controls the front door was missing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * svc-edge is the only component the internet reaches, and it proxies to every
 * service in the fleet. Until this file it sent no security headers at all, and
 * it counted nothing: there was no throttle of any kind on any path.
 *
 * The absent throttle is the sharper of the two. `/api/*` is a catch-all that
 * forwards to `resolve()`'s route table, and one of those routes is
 * svc-identity. A password guess and a legitimate login are the same request
 * shape to this process, so an unauthenticated caller could spend attempts at
 * whatever rate their socket allowed — against the component that mints the
 * bearer tokens the entire platform trusts. Nothing downstream compensates:
 * `exchangePrincipal` refuses a bad token cheaply and correctly, and refusing
 * cheaply a million times is still a million attempts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT HERE
 *
 * **`@fastify/cors` does not replace `cors.ts`.** That file is hand-rolled for
 * properties the plugin does not offer: every `OPTIONS` terminated at the edge
 * and never proxied, a preflight answer computed from the `Origin` header alone
 * so it cannot be used as a route oracle, and allow-origin headers that survive
 * onto 404/502/503 refusals. Those are load-bearing and tested. Swapping them
 * for a plugin default would be a regression wearing the costume of a cleanup.
 *
 * **`@fastify/under-pressure` is not registered.** It answers 503 when event-loop
 * lag crosses a threshold. On a money platform that means shedding an order
 * cancel — the request a user most needs served — precisely when the system is
 * busiest. Load shedding is a product decision about which calls are droppable,
 * and nobody has made it. Serving slowly is not the same failure as refusing,
 * and this file will not quietly convert one into the other.
 */

/** Probe paths that must never be throttled. */
const UNTHROTTLED = new Set(['/health', '/ready']);

export interface RateLimitConfig {
  /** Requests allowed per window, per key. */
  readonly max: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** When false, no limiter is registered at all. */
  readonly enabled: boolean;
  /**
   * Whether Fastify was constructed with `trustProxy`. Not used to configure
   * the limiter — it is used to describe, honestly, what the key actually is.
   */
  readonly trustProxy: boolean;
}

/**
 * What the limiter will actually key on, in words an operator can act on.
 *
 * This exists because the dangerous failure here is silent and inverted. Behind
 * nginx or a load balancer WITHOUT `trustProxy`, every caller in the world
 * arrives with the proxy's address, so `req.ip` is one value and the limit
 * becomes a single global budget shared by all users. A control installed to
 * stop one attacker would instead throttle the whole platform on that
 * attacker's behalf — a self-inflicted outage that looks, from inside, exactly
 * like the control working.
 *
 * So the posture is stated at boot rather than assumed, in the same spirit as
 * the screening and CORS summaries next to it in `index.ts`.
 */
export function rateLimitSummary(config: RateLimitConfig): { level: 'info' | 'warn'; summary: string } {
  if (!config.enabled) {
    return {
      level: 'warn',
      summary:
        'rate limit: DISABLED — the front door counts nothing. Every path, including the ' +
        'proxy to svc-identity, accepts requests as fast as a caller can send them. ' +
        'Set EDGE_RATE_LIMIT_ENABLED=true.',
    };
  }

  if (!config.trustProxy) {
    return {
      level: 'warn',
      summary:
        `rate limit: ${config.max} per ${config.windowMs}ms keyed on the DIRECT socket address, ` +
        `because EDGE_TRUST_PROXY is unset. If this deployment sits behind nginx or a load ` +
        `balancer, every caller shares ONE bucket and this limit throttles the whole platform ` +
        `rather than any individual. Set EDGE_TRUST_PROXY to the proxy's address or CIDR.`,
    };
  }

  return {
    level: 'info',
    summary: `rate limit: ${config.max} per ${config.windowMs}ms per client address (proxy headers trusted)`,
  };
}

/**
 * Security headers.
 *
 * This service answers JSON and serves no markup, so most of helmet's document
 * protections have nothing to act on. Two are switched off deliberately rather
 * than left at a default:
 *
 *   · CSP is off. A policy on a response no browser renders protects nothing,
 *     and a wrong one is a support ticket from whichever front-end embeds an
 *     error body. `apps/admin` sets its own policy over its own documents.
 *   · HSTS is off HERE. The edge terminates no TLS — nginx and the load
 *     balancer do — so a max-age emitted from behind them is a promise made by
 *     the component least able to keep it. It belongs at the TLS terminator,
 *     where somebody can see the certificate.
 *
 * What is left is the set that means something for an API: `nosniff`, a denied
 * frame ancestry, no cross-domain policies, and a referrer policy.
 */
export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: false,
    strictTransportSecurity: false,
    // Answers are JSON and are not a document; denying framing costs nothing
    // and removes a clickjacking question nobody should have to re-ask.
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    // `crossOriginResourcePolicy` would add `same-origin`, which contradicts the
    // deliberate cross-origin grant `cors.ts` issues to the configured
    // allowlist. Left off so one file owns that decision.
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
}

/**
 * The throttle.
 *
 * Registered AFTER `registerCors`, and the order is a control rather than a
 * preference — the same argument `cors.ts` makes for its own position:
 *
 *   · A preflight is answered inside the CORS hook and never reaches this
 *     limiter, so an `OPTIONS` storm cannot exhaust a legitimate user's budget
 *     and browsers do not spend quota on requests they were forced to send.
 *   · The allow-origin header is already on the reply when a 429 is sent, so a
 *     browser can READ the refusal. A throttle the browser reports as a generic
 *     CORS error tells a user the platform is broken instead of telling them to
 *     slow down.
 *
 * `/health` and `/ready` are exempt. Throttling a load balancer's probe is how
 * a busy-but-working edge gets pulled out of rotation and turned into an outage
 * — the limiter would cause exactly the unavailability it was installed to
 * prevent.
 */
export async function registerRateLimit(app: FastifyInstance, config: RateLimitConfig): Promise<void> {
  if (!config.enabled) return;

  await app.register(rateLimit, {
    max: config.max,
    timeWindow: config.windowMs,
    // In-process counters. One replica cannot see another's, so N replicas
    // means N budgets — the honest description is "per replica", and a shared
    // store is a §13 socket, not something to fake with a comment.
    allowList: (req: FastifyRequest) => {
      const pathname = req.url.split('?')[0] ?? req.url;
      return UNTHROTTLED.has(pathname);
    },
    // The refusal says what happened and names the retry window. `code` matches
    // the `edge.*` vocabulary the other refusals in this service use, so a
    // client can branch on it the same way.
    //
    // `statusCode` is not decoration: the builder's return value is thrown as
    // the error, and Fastify reads the status from it. Omit the field and a
    // throttle answers 500 — the body says "rate limited" while the status tells
    // every client and dashboard the edge crashed.
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'too many requests',
      code: 'edge.rate_limited',
      retryAfterSeconds: Math.ceil(Number(context.ttl) / 1000),
    }),
  });
}
