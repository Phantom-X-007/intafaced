import Fastify from 'fastify';
import { AuthError } from '@intafaced/auth';
import { createAdminApi, statusForAuthError } from './admin-api.js';
import { env } from './env.js';
import { KillSwitchState, procedureOf } from './kill-switch.js';
import { EdgeMetrics, statusClass } from './metrics.js';
import { exchangePrincipal } from './principal-exchange.js';
import { resolve, UPSTREAMS } from './routes.js';
import { withEdgeSpan } from './tracing.js';

/**
 * svc-edge — the front door (§9).
 *
 * Everything a browser touches arrives here, and nothing reaches a service any
 * other way. Its single job: turn a bearer token into a principal the services
 * will believe, and refuse to carry anything else the caller tried to smuggle
 * under our header prefix.
 *
 * Until this existed, `packages/contracts/src/edge.ts` verified a signature no
 * component produced, so every `scopedProcedure` in the platform refused every
 * caller. svc-identity issued a JWT that opened no door.
 */

const app = Fastify({ logger: { level: env.LOG_LEVEL }, disableRequestLogging: false });

const upstreamUrl = (envVar: string, devUrl: string): string => (process.env[envVar] ?? devUrl).replace(/\/$/, '');

const tokenConfig = {
  secret: env.JWT_ACCESS_SECRET,
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
};

/** §14.6 — the operator kill-switch, and the first one in the platform anything can reach. */
const killSwitches = new KillSwitchState();
const admin = createAdminApi(killSwitches, tokenConfig);

/** §14.5 — what the SLO panel in Grafana is built on. */
const metrics = new EdgeMetrics();

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

app.get('/ready', async () => ({
  ready: true,
  // The route table, so an operator can see what the edge will forward without
  // reading the source. Deliberately no secrets, no upstream URLs.
  routes: UPSTREAMS.map((u) => u.prefix),
  // Readiness is about the process, never about the switches: a killed module
  // is an operator's decision, and taking the edge out of the load balancer
  // because of it would remove the surface that serves cancels and reads.
  disabledModules: killSwitches.disabledModules(),
}));

/** Prometheus scrape target. Internal — see the header of `metrics.ts`. */
app.get('/metrics', async (_req, reply) => reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8').send(metrics.render()));

// ── Operator control plane (§14.6) ──────────────────────────────────────────

app.get('/admin/kill-switches', async (req, reply) => {
  try {
    await admin.authenticate(req.headers.authorization);
  } catch (err) {
    if (err instanceof AuthError) return reply.code(statusForAuthError(err)).send({ error: err.message, code: err.code });
    throw err;
  }
  return admin.read();
});

app.post('/admin/kill-switches', async (req, reply) => {
  let operator;
  try {
    operator = await admin.authenticate(req.headers.authorization);
  } catch (err) {
    if (err instanceof AuthError) return reply.code(statusForAuthError(err)).send({ error: err.message, code: err.code });
    throw err;
  }

  let result;
  try {
    result = admin.apply(req.body, operator);
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message, code: 'edge.invalid_kill_switch' });
  }

  // WARN, not INFO. Somebody reading logs after an incident is looking for
  // exactly this line, and it carries who, what and why.
  req.log.warn({ operator: operator.userId, body: req.body, state: result.disabledModules }, 'edge: kill-switch changed');
  return result;
});

/**
 * The proxy.
 *
 * A catch-all rather than a route per upstream, because the failure mode of a
 * missing route must be 404 — not "fell through to a default upstream".
 */
app.all('/api/*', async (req, reply) => {
  const startedAt = process.hrtime.bigint();
  const url = new URL(req.url, `http://${env.HTTP_HOST}`);
  const target = resolve(url.pathname);

  /**
   * Record once, on every exit from this handler.
   *
   * `auth` is filled in below when the exchange has happened; the early
   * returns above it are still measured, because a 404 the SLO cannot see is a
   * 404 the SLO reports as healthy.
   */
  let authOutcome = 'anonymous';
  const record = (status: number): void => {
    const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    metrics.observe(
      {
        module: target ? (target.upstream.prefix.replace(/^\/api\//, '') as string) : '_unrouted',
        procedure: boundedProcedure(url.pathname),
        status: statusClass(status),
        auth: authOutcome,
      },
      seconds,
    );
  };

  if (!target) {
    // An unlisted prefix is not forwarded anywhere. An edge that proxies what
    // it does not recognise is a proxy for the entire internal network.
    record(404);
    return reply.code(404).send({ error: 'no route', code: 'edge.no_route' });
  }

  /**
   * THE KILL-SWITCH, BEFORE THE TOKEN IS EVEN LOOKED AT (§14.6).
   *
   * Deliberately ahead of the principal exchange. A module that is switched off
   * should cost the platform nothing per request — not a signature verification,
   * and certainly not an upstream round trip. It also means a killed module
   * refuses identically whoever is asking, which is the behaviour an operator
   * expects from a switch labelled "off".
   *
   * 503 with `retry-after`, not 403: this is a temporary operational state, and
   * a client that reads 403 as "you may never do this" will stop retrying after
   * the incident is over.
   */
  const decision = killSwitches.decide(url.pathname, req.method);
  if (decision.refused) {
    req.log.warn({ module: decision.module, path: url.pathname }, 'edge: refused — module killed by operator');
    record(503);
    return reply
      .code(503)
      .header('retry-after', '30')
      .send({
        error: `module "${decision.module}" is switched off by the operator`,
        code: 'edge.module_killed',
        module: decision.module,
      });
  }

  const exchanged = await exchangePrincipal(req.headers, {
    tokens: tokenConfig,
    edgeSecret: env.EDGE_PRINCIPAL_SECRET,
    // Resolved here, never read from the request: region drives the
    // jurisdiction matrix, so a caller who could set it would choose its own
    // regulator. A single configured value today; geo-IP replaces this line.
    region: env.DEFAULT_REGION,
  });

  // A refused token is logged and the request continues as ANONYMOUS. The
  // service decides — `protectedProcedure` answers UNAUTHORIZED with the right
  // status, and a `publicProcedure` still works, which is what lets a caller
  // with an expired token reach `auth.refresh` and recover.
  if (exchanged.rejected) {
    req.log.info({ reason: exchanged.rejected, path: url.pathname }, 'edge: token refused, forwarding anonymous');
  }

  authOutcome = exchanged.rejected ? 'refused' : exchanged.principal ? 'authenticated' : 'anonymous';

  const base = upstreamUrl(target.upstream.envVar, target.upstream.devUrl);
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : (req.body as unknown);

  return withEdgeSpan(
    'edge.proxy',
    {
      upstream: target.upstream.prefix,
      method: req.method,
      auth: exchanged.rejected ?? (exchanged.principal ? 'authenticated' : 'anonymous'),
    },
    async () => {
      let response: Response;
      try {
        response = await fetch(`${base}${target.path}${url.search}`, {
          method: req.method,
          headers: exchanged.headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(env.UPSTREAM_TIMEOUT_MS),
        });
      } catch (err) {
        // 502, not 500: the edge is fine, the upstream is not, and a caller
        // needs to tell those apart before deciding whether to retry.
        req.log.error({ err, upstream: target.upstream.prefix }, 'edge: upstream unreachable');
        record(502);
        return reply.code(502).send({ error: 'upstream unavailable', code: 'edge.upstream_unavailable' });
      }

      const text = await response.text();
      record(response.status);
      return reply
        .code(response.status)
        .header('content-type', response.headers.get('content-type') ?? 'application/json')
        .send(text);
    },
  );
});

/**
 * The `procedure` metric label, bounded.
 *
 * A label taken straight from a caller-controlled path is a cardinality bomb.
 * The shape is checked before the value is used, and `EdgeMetrics` caps the
 * series count on top of that — two independent limits, because this endpoint
 * sits behind the public door and the repo has no rate limiting anywhere yet.
 */
function boundedProcedure(pathname: string): string {
  const procedure = procedureOf(pathname);
  if (!procedure) return '_other';
  if (procedure.length > 64) return '_other';
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){0,3}$/.test(procedure) ? procedure : '_other';
}

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, routes: UPSTREAMS.length }, 'svc-edge ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      process.exit(0);
    })();
  });
}
