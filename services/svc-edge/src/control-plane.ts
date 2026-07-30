import type { FastifyInstance } from 'fastify';
import { AuthError } from '@intafaced/auth';
import { statusForAuthError, type AdminApi } from './admin-api.js';
import type { KillSwitchState } from './kill-switch.js';

/**
 * THE OPERATOR CONTROL PLANE, AS SOMETHING A TEST CAN DRIVE (§14.6).
 *
 * `index.ts` reads `env` and calls `app.listen()` at module scope, so importing
 * it from a test means booting the real edge against real upstreams. That is why
 * the enforcement rule and the admin routes live here instead: `index.ts`
 * registers them, and a test registers the same two functions on its own Fastify
 * instance with a stub upstream behind them.
 *
 * The point of doing it this way rather than unit-testing `decide()` alone —
 * which `kill-switch.test.ts` also does — is that the interesting failures were
 * never in the rule. They were in the wiring: a prefix that mapped to no module,
 * a release path the rule never saw, a switch nothing could reach. Those are
 * only visible to a request that actually crosses the HTTP boundary.
 */

/**
 * The kill-switch, as an `onRequest` hook.
 *
 * A hook rather than a check inside the proxy handler, for two reasons that both
 * matter during an incident:
 *
 *   · It runs BEFORE body parsing and before the principal exchange, so a killed
 *     module costs the platform nothing per request — no signature verification,
 *     no upstream round trip, no JSON parse of a payload that is going to be
 *     refused anyway.
 *   · It cannot be bypassed by a route added later. A guard written inside one
 *     handler protects that handler; a hook protects the door.
 *
 * Non-`/api` paths are ignored, which is what keeps the hook off `/admin/*`,
 * `/health` and `/ready`. An operator must be able to reach the control plane
 * while modules are killed — otherwise the switch that halted the platform
 * cannot be used to un-halt it — and a load balancer must still get an answer
 * from `/ready`.
 */
export function registerKillSwitchGuard(app: FastifyInstance, killSwitches: KillSwitchState): void {
  app.addHook('onRequest', async (req, reply) => {
    const pathname = req.url.split('?')[0] ?? req.url;
    if (!pathname.startsWith('/api/')) return;

    /**
     * FAIL CLOSED, TWICE.
     *
     * `KillSwitchState.decide` already catches its own failures and returns
     * `undecidable`. This second catch is not belt-and-braces for its own sake:
     * it covers the case where the state OBJECT is broken or replaced — a future
     * durable store whose client throws on a dropped connection, say — and so it
     * holds the property regardless of what `decide` is.
     *
     * A safety control that opens when its own check errors is worse than no
     * control at all: the operator believes the market is halted, the console
     * says it is halted, and orders are being accepted.
     */
    let decision;
    try {
      decision = killSwitches.decide(pathname, req.method);
    } catch {
      decision = { module: null, refused: true, reason: 'undecidable' as const };
    }

    if (!decision.refused) return;

    // `undecidable` means the switch's own check threw and it failed closed.
    // Logged at error and given its own code, because "refused because an
    // operator said so" and "refused because we could not tell" call for
    // completely different responses at 3am.
    if (decision.reason === 'undecidable') {
      req.log.error({ path: pathname }, 'edge: kill-switch check failed — refusing, failing closed');
      return reply.code(503).header('retry-after', '30').send({
        error: 'the operator kill-switch could not be evaluated; refusing',
        code: 'edge.kill_switch_undecidable',
      });
    }

    req.log.warn({ module: decision.module, path: pathname }, 'edge: refused — module killed by operator');
    // 503 with `retry-after`, not 403: this is a temporary operational state, and
    // a client that reads 403 as "you may never do this" will stop retrying once
    // the incident is over.
    return reply
      .code(503)
      .header('retry-after', '30')
      .send({
        error: `module "${decision.module}" is switched off by the operator`,
        code: 'edge.module_killed',
        module: decision.module,
      });
  });
}

/**
 * The `/admin/*` routes.
 *
 * Registered explicitly, and deliberately OUTSIDE `/api/*`: `resolve()` returns
 * null for `/admin/...`, so if one of these were missing it would 404 rather
 * than fall through to an upstream. The catch-all proxy is never what decides
 * whether an admin path is real.
 */
export function registerAdminRoutes(app: FastifyInstance, admin: AdminApi): void {
  /**
   * Authenticate, or answer. Returns null when it has already replied, so a
   * handler cannot forget to stop.
   */
  const operator = async (
    header: string | undefined,
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    kind: 'module' | 'treasury',
  ) => {
    try {
      const principal = kind === 'treasury' ? await admin.authenticateTreasury(header) : await admin.authenticate(header);
      return { principal, bearer: header as string };
    } catch (err) {
      if (err instanceof AuthError) {
        reply.code(statusForAuthError(err)).send({ error: err.message, code: err.code });
        return null;
      }
      throw err;
    }
  };

  app.get('/admin/kill-switches', async (req, reply) => {
    if (!(await operator(req.headers.authorization, reply, 'module'))) return reply;
    return admin.read();
  });

  app.post('/admin/kill-switches', async (req, reply) => {
    const auth = await operator(req.headers.authorization, reply, 'module');
    if (!auth) return reply;

    let result;
    try {
      result = admin.apply(req.body, auth.principal);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message, code: 'edge.invalid_kill_switch' });
    }

    // WARN, not INFO. Somebody reading logs after an incident is looking for
    // exactly this line, and it carries who, what, why and the prior state.
    req.log.warn(
      { operator: auth.principal.userId, body: req.body, state: result.disabledModules, entry: result.audit[0] },
      'edge: kill-switch changed',
    );
    return result;
  });

  /**
   * The ledger freeze — the switch that halts ALL value movement (§4.2).
   *
   * `admin:treasury`, not `admin:write`: halting one market and halting the
   * money plane are different authorities and must not share a credential.
   * Forwarded to svc-ledger with the operator's OWN token, so
   * `posting_freeze.actor` is written from svc-ledger's own verification and the
   * edge cannot cause a freeze attributed to anybody else.
   *
   * Whatever svc-ledger answers is passed through unchanged, including its
   * failures. The edge must never turn a refused or unconfirmed freeze into a
   * 200 — an operator told the platform is halted when it is not is worse off
   * than one told nothing at all.
   */
  app.get('/admin/ledger/freeze', async (req, reply) => {
    const auth = await operator(req.headers.authorization, reply, 'treasury');
    if (!auth) return reply;
    const res = await admin.readFreeze(auth.bearer);
    return reply.code(res.status).send(res.body);
  });

  app.post<{ Params: { action: string } }>('/admin/ledger/:action', async (req, reply) => {
    const action = req.params.action;
    if (action !== 'freeze' && action !== 'unfreeze') {
      return reply.code(404).send({ error: 'no route', code: 'edge.no_route' });
    }

    const auth = await operator(req.headers.authorization, reply, 'treasury');
    if (!auth) return reply;

    let res;
    try {
      res = await admin.setFreeze(action === 'freeze', req.body, auth.bearer);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message, code: 'edge.invalid_freeze_request' });
    }

    req.log.warn({ operator: auth.principal.userId, action, status: res.status }, 'edge: LEDGER FREEZE state change requested');
    return reply.code(res.status).send(res.body);
  });
}
