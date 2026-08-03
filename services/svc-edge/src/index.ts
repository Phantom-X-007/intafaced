import Fastify from 'fastify';
import { assertScreeningConfigured } from '@intafaced/config';
import { createAdminApi, httpLedgerOperator } from './admin-api.js';
import { registerAdminRoutes, registerKillSwitchGuard } from './control-plane.js';
import { CORS_ENFORCED_ENVS, edgeOriginAllowlist, registerCors } from './cors.js';
import { env } from './env.js';
import { KillSwitchState } from './kill-switch.js';
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

/**
 * §24 Lane A, asserted at boot rather than assumed.
 *
 * The edge is where region screening applies — it is the hosted front end, and
 * it is the component that resolves `region` server-side for every request in
 * the platform. So it is the component that must not start up unable to screen.
 *
 * Modelled on svc-protocol's §22 sovereignty assertion: throw rather than boot
 * into a state that quietly misleads users. Without a list, `checkAccess`
 * clears every region and calls it screened. In `dev` and `test` this returns
 * instead of throwing, and the warning below is the control's visibility.
 */
const screening = assertScreeningConfigured();
app.log[screening.configured ? 'info' : 'warn'](
  { appEnv: env.APP_ENV, configured: screening.configured, blocked: screening.blockedRegions.length, source: screening.source },
  screening.summary,
);

/**
 * Which browser origins may call this edge (see `cors.ts`).
 *
 * Read before anything is registered, because a malformed list throws here — a
 * list that does not say what its author meant is a boot failure, in the same
 * spirit as the screening list above. An ABSENT list is not: it is a closed door
 * that this log line and `/ready` make visible, and `cors.ts` argues at length
 * why the two cases differ.
 *
 * ERROR, not `warn`, when an enforced environment has nothing configured. That
 * state means every front-end this deployment serves is being refused by the
 * browser, and it presents to users as the platform being down — which is
 * exactly the failure that went unnoticed for weeks before this file had a CORS
 * layer at all.
 */
const cors = edgeOriginAllowlist();
const corsEnforced = (CORS_ENFORCED_ENVS as readonly string[]).includes(env.APP_ENV);
app.log[cors.configured ? 'info' : corsEnforced ? 'error' : 'warn'](
  { appEnv: env.APP_ENV, configured: cors.configured, allowedOrigins: cors.origins.length, source: cors.source },
  cors.summary,
);

/**
 * FIRST — before every route and before the kill-switch guard.
 *
 * The ordering is the control, not a tidiness preference. Registered here, the
 * preflight is answered without the kill-switch ever being consulted (so an
 * unauthenticated `OPTIONS` cannot report which modules an operator has halted),
 * and the allow-origin header is on the reply before any later hook or handler
 * sends a 404, a 503 or a 502 — so the browser can read our refusals instead of
 * reporting them all as the same opaque CORS error.
 */
registerCors(app, cors);

const upstreamUrl = (envVar: string, devUrl: string): string => (process.env[envVar] ?? devUrl).replace(/\/$/, '');

const tokenConfig = {
  secret: env.JWT_ACCESS_SECRET,
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
};

/** §14.6 — the operator kill-switch, and the first one in the platform anything can reach. */
const killSwitches = new KillSwitchState({ statePath: env.EDGE_KILL_STATE_PATH });

const admin = createAdminApi(killSwitches, {
  tokens: tokenConfig,
  // Null when unset, and the console is told. `LEDGER_URL` is a URL, not a
  // secret — `env.ts` withholds `DATABASE_URL`, `NATS_URL` and
  // `INTERNAL_SERVICE_SECRET` from this service, and none of them is needed
  // here: the edge forwards the operator's own token and holds no credential of
  // the ledger's.
  ledger: env.LEDGER_URL ? httpLedgerOperator(env.LEDGER_URL, env.UPSTREAM_TIMEOUT_MS) : null,
});

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

app.get('/ready', async () => ({
  ready: true,
  // The route table, so an operator can see what the edge will forward without
  // reading the source. Deliberately no secrets, no upstream URLs.
  routes: UPSTREAMS.map((u) => u.prefix),
  // Whether screening is armed, and how many regions it refuses — a count, not
  // the codes. An operator needs to see the control is on; an unauthenticated
  // caller does not need our exact configuration read back to them.
  screening: { configured: screening.configured, blockedRegions: screening.blockedRegions.length },
  // Same shape, same reason: whether a browser allowlist was SUPPLIED, and how
  // many origins it holds — a count, never the origins themselves. "Zero because
  // nobody configured one" and "zero because the list is short" are different
  // facts, and a probe that renders both as `0` cannot tell an operator which
  // one is why the front-end says the platform is unreachable.
  cors: { configured: cors.configured, allowedOrigins: cors.origins.length },
  // Readiness is about the process, never about the switches: a killed module is
  // an operator's decision, and taking the edge out of the load balancer because
  // of it would remove the surface that serves cancels and reads.
  disabledModules: killSwitches.disabledModules(),
}));

// ── Operator control plane (§14.6) ─────────────────────────────────
//
// Both live in `control-plane.ts` rather than inline here, so the end-to-end
// test drives THE SAME code this process serves. A kill-switch verified only
// through a test-only copy of the rule is not verified.

registerKillSwitchGuard(app, killSwitches);
registerAdminRoutes(app, admin);

/**
 * The proxy.
 *
 * A catch-all rather than a route per upstream, because the failure mode of a
 * missing route must be 404 — not "fell through to a default upstream".
 */
app.all('/api/*', async (req, reply) => {
  const url = new URL(req.url, `http://${env.HTTP_HOST}`);
  const target = resolve(url.pathname);

  if (!target) {
    // An unlisted prefix is not forwarded anywhere. An edge that proxies what
    // it does not recognise is a proxy for the entire internal network.
    return reply.code(404).send({ error: 'no route', code: 'edge.no_route' });
  }

  // The kill-switch already ran, in the `onRequest` hook registered above —
  // before body parsing and before this handler exists. See `control-plane.ts`
  // for why it is a hook and not a check here: a guard inside one handler
  // protects that handler, a hook protects the door.

  const exchanged = await exchangePrincipal(req.headers, {
    tokens: tokenConfig,
    edgeSecret: env.EDGE_PRINCIPAL_SECRET,
    // Resolved here, never read from the request: region drives the
    // jurisdiction matrix, so a caller who could set it would choose its own
    // regulator. A single configured value today; geo-IP replaces this line.
    region: env.DEFAULT_REGION,
    // Direct to identity for `ifc_…` API keys — never via this edge (loop).
    identityUrl: env.IDENTITY_URL,
  });

  // A refused token is logged and the request continues as ANONYMOUS. The
  // service decides — `protectedProcedure` answers UNAUTHORIZED with the right
  // status, and a `publicProcedure` still works, which is what lets a caller
  // with an expired token reach `auth.refresh` and recover.
  if (exchanged.rejected) {
    req.log.info({ reason: exchanged.rejected, path: url.pathname }, 'edge: token refused, forwarding anonymous');
  }

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
        return reply.code(502).send({ error: 'upstream unavailable', code: 'edge.upstream_unavailable' });
      }

      const text = await response.text();
      return reply
        .code(response.status)
        .header('content-type', response.headers.get('content-type') ?? 'application/json')
        .send(text);
    },
  );
});

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
