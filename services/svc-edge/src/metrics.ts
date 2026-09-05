import { Metrics, MODULE_LOCAL, MODULE_UNROUTED, PROMETHEUS_CONTENT_TYPE, methodLabel, statusClass } from '@intafaced/telemetry';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolve } from './routes.js';

/**
 * THE SCRAPE SURFACE (§14.5).
 *
 * `@intafaced/telemetry` owns the series names, the label set, the buckets and
 * the exposition format — deliberately, so the nineteenth service to adopt this
 * produces the same series as the first and the committed dashboard needs no
 * edit. What lives HERE is the Fastify-shaped part: when to observe, what to
 * call the module, and the route that serves the text.
 *
 * ── Why the edge is where an SLO gets measured ──────────────────────────────
 *
 * §20 calls its targets "engineering SLOs, not slogans". An SLO is a promise to
 * a USER, so it is measured where the user is — the front door, with every hop
 * behind it included. `svc-trade` timing its own handler cannot see the queue
 * in front of it, and would report health during exactly the incident an SLO
 * exists to catch.
 *
 * ── Why this is not on the rate limiter's exempt list ───────────────────────
 *
 * `/health` and `/ready` are exempt in `hardening.ts` because throttling a load
 * balancer's probe turns a busy edge into an outage. `/metrics` is NOT added to
 * that list, and it was a decision rather than an oversight:
 *
 *   · The scrape is 6 requests per minute (`scrape_interval: 10s`) against an
 *     owner-set `EDGE_RATE_LIMIT_MAX` (example 300/min), keyed per client. Prometheus
 *     reaches `svc-edge:4000` directly on the compose network, so it holds its
 *     own bucket and no amount of user traffic can spend it.
 *     `observability-wiring.test.ts` asserts that headroom against the real
 *     config rather than leaving it as an assumption in a comment.
 *   · Exempting it would make an unthrottled, ever-growing payload available to
 *     anyone who could reach the port. `/metrics` is internal by deployment
 *     policy, and a control that only holds when the policy holds is not one to
 *     lean on.
 */

/**
 * How the caller presented, as recorded by the proxy handler.
 *
 * `none` is for requests that never went through principal exchange at all —
 * `/health`, `/ready`, `/metrics`, and anything refused before the handler ran.
 * It is a distinct value rather than a blank, because "no token was checked"
 * and "a token was checked and was absent" are different facts and an
 * availability panel that merges them cannot show an auth outage.
 */
export type AuthOutcome = 'authenticated' | 'anonymous' | 'refused' | 'none';

/**
 * Outcomes stashed per in-flight request.
 *
 * A `WeakMap` rather than `app.decorateRequest` + module augmentation: the
 * entry dies with the request object, so there is no cleanup to forget and no
 * global Fastify type change for one service's private field.
 */
const OUTCOMES = new WeakMap<FastifyRequest, AuthOutcome>();

/** Called by the proxy once it knows how the caller's token resolved. */
export function markAuthOutcome(req: FastifyRequest, outcome: AuthOutcome): void {
  OUTCOMES.set(req, outcome);
}

/**
 * Which module a finished request was for.
 *
 * Bounded by construction: every value comes from `UPSTREAMS` or is one of the
 * two reserved names. The path is split on `?` only — this is a LABEL, not the
 * kill-switch's security decision, and `control-plane.ts` keeps its own stricter
 * parser for the case where getting it wrong lets a request through a halt.
 * Here, the worst outcome of a dot segment is a request attributed to
 * `_unrouted`, and `resolve()` returning null is the honest answer for a path
 * the edge did not forward.
 */
export function moduleLabel(rawUrl: string): string {
  const pathname = rawUrl.split('?')[0] ?? rawUrl;
  if (!pathname.startsWith('/api/')) return MODULE_LOCAL;
  return resolve(pathname)?.upstream.module ?? MODULE_UNROUTED;
}

export interface MetricsOptions {
  /** Value of the `service` label. Pass `env.SERVICE_NAME`. */
  readonly service: string;
  /** Path the endpoint is served on. Must match `metrics_path` in prometheus.yaml. */
  readonly path?: string;
  /** Inject a registry in tests. Defaults to a fresh one. */
  readonly registry?: Metrics;
}

/** The path this service serves the exposition on. The scrape config must agree. */
export const METRICS_PATH = '/metrics';

/**
 * Register the observation hook and the scrape route.
 *
 * Returns the registry so a test can read it directly — but note that every
 * test in `metrics.test.ts` goes through `app.inject()` and reads the RESPONSE
 * BODY instead. A registry that counts correctly while the route is unmounted
 * is the exact failure this repo has shipped seven times.
 */
export function registerMetrics(app: FastifyInstance, options: MetricsOptions): Metrics {
  const registry = options.registry ?? new Metrics();
  const path = options.path ?? METRICS_PATH;

  /**
   * `onResponse` fires for EVERY reply — including 404s, 429s from the rate
   * limiter, 503s from the kill-switch guard and 400s from the path resolver.
   * That is the point: an SLO computed only over requests that reached a
   * handler is an SLO that goes green during an outage, because the failures
   * never entered the denominator.
   */
  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    // Fastify measures this from the moment the request was received, so it
    // includes the hooks above — the limiter, the guard, principal exchange —
    // not just the handler's own time. Milliseconds in, seconds out, because
    // the exposition's convention is seconds and a histogram whose unit
    // disagrees with its name is unreadable on any shared dashboard.
    const seconds = reply.elapsedTime / 1000;

    registry.observe(
      {
        service: options.service,
        module: moduleLabel(req.url),
        method: methodLabel(req.method),
        status: statusClass(reply.statusCode),
        outcome: OUTCOMES.get(req) ?? 'none',
      },
      seconds,
    );
  });

  app.get(path, async (_req, reply) => {
    // The content type is not decoration. Prometheus negotiates on it, and a
    // payload served as `application/json` is a target that scrapes, parses
    // nothing and reports itself UP with zero series.
    return reply.header('content-type', PROMETHEUS_CONTENT_TYPE).send(registry.render());
  });

  return registry;
}
