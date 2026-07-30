import Fastify from 'fastify';
import postgres from 'postgres';
import { env } from './env.js';
import { PayError, PayService } from './payment-service.js';
import { UserMoneyService } from './user-money-service.js';
import { createLedgerClient } from './ledger-client.js';
import { CardSandboxAdapter } from './rails/card-sandbox.js';
import { CryptoNativeAdapter } from './rails/crypto-native.js';
import { RailRegistry } from './rails/registry.js';
import { assertRailPosture, defaultChainFor, railPostureStatus, selectPublicCheckoutRail } from './rails/posture.js';
import { createPayRouter } from './router.js';
import { registerCheckoutRoutes } from './checkout-page.js';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';

/**
 * svc-pay — the payments core (§6.1).
 *
 * Gateway mode, the `RailAdapter` interface, and the two v1 adapters. PSP mode,
 * PayFac trees, smart routing, fraud scoring, the checkout builder,
 * subscriptions and plugins are each a separate tracker feature, and none of
 * them requires a change to the adapter interface — which is the claim
 * `src/rails/conformance.ts` exists to keep testable.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'pay,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM pay.merchants LIMIT 1`.catch(() => {
  throw new Error('pay schema is missing — run migrations before starting svc-pay');
});

// Value moves through svc-ledger, never through this service's own tables
// (Doctrine §0.6). This client is the only path.
const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);

/**
 * The chain behind `crypto-native`.
 *
 * §13 socket: the production chain watcher implements `CryptoChainPort` and is
 * swapped in here — one line, no change to the adapter and none to the core.
 *
 * WHAT CHANGED, AND WHY IT MATTERED. This line used to read `new MemoryChain()`
 * unconditionally. In a production deployment that is not a placeholder, it is a
 * money bug: `MemoryChain.send` SUCCEEDS and returns `0xout00000001`, so a user's
 * withdrawal on `crypto-native` debited their real ledger balance, stored that
 * string as the rail reference, and answered `sent`. The user was told their
 * money was on its way and nothing had been broadcast anywhere.
 *
 * So dev and test get the in-memory reference chain — which models confirmation
 * depth and idempotent broadcast, and is what the whole suite runs on — and
 * `staging`/`prod` get `UnconfiguredChain`, which refuses every call with a
 * message naming what the owner has to obtain. A refusal reverses the hold in the
 * same call and gives the user their money back; a fabricated success does not.
 */
const chain = defaultChainFor(process.env);

const rails = new RailRegistry([
  new CryptoNativeAdapter({
    chain,
    secret: env.PAY_CRYPTO_WEBHOOK_SECRET,
    minConfirmations: env.PAY_MIN_CONFIRMATIONS,
    toleranceSeconds: env.PAY_WEBHOOK_TOLERANCE_SECONDS,
  }),
  new CardSandboxAdapter({
    secret: env.PAY_CARD_SANDBOX_WEBHOOK_SECRET,
    toleranceSeconds: env.PAY_WEBHOOK_TOLERANCE_SECONDS,
  }),
]);

/**
 * IS THIS DEPLOYMENT ALLOWED TO MOVE REAL MONEY THROUGH A RAIL THAT IS NOT REAL?
 *
 * Asserted before the listener opens, in the same spirit as `createEdgeContext`
 * below and `assertScreeningConfigured` in packages/config: a property the
 * platform claims is checked at startup, and the process refuses to run rather
 * than quietly mislead users about their money.
 *
 * Throws in `staging`/`prod` while any registered rail is a sandbox, unless an
 * operator has said `PAY_ALLOW_SANDBOX_RAILS=true` by name. The returned policy
 * is handed to both services below, so the boot refusal and the per-call refusal
 * are one decision rather than two that can drift apart.
 */
const railPosture = assertRailPosture(rails, { ...process.env, PAY_ALLOW_SANDBOX_RAILS: env.PAY_ALLOW_SANDBOX_RAILS });
const railStatus = railPostureStatus(rails, railPosture.policy);

/**
 * A rail named in `PAY_CHECKOUT_RAILS` that is not registered would mean the
 * public checkout silently falling through to the next entry — or, on a
 * single-entry list, refusing every payer with "no rail configured" while the
 * operator believes one is. That is a deployment mistake and it belongs at boot,
 * exactly like `PAY_OPERATOR_CREDIT_RAILS` below.
 */
for (const { railId } of env.PAY_CHECKOUT_RAILS) {
  if (!rails.has(railId)) {
    throw new Error(`PAY_CHECKOUT_RAILS names "${railId}", which is not a registered rail. Registered: ${rails.ids().join(', ')}`);
  }
}

const pay = new PayService(sql, ledger, rails, {
  defaultFeeBps: env.PAY_DEFAULT_FEE_BPS,
  valueMovement: railPosture.policy,
  checkoutRails: env.PAY_CHECKOUT_RAILS,
  checkoutSessionTtlSeconds: env.PAY_CHECKOUT_SESSION_TTL_SECONDS,
  linkDefaultTtlDays: env.PAY_LINK_DEFAULT_TTL_DAYS,
  linkMaxTtlDays: env.PAY_LINK_MAX_TTL_DAYS,
  maxOpenSessionsPerLink: env.PAY_CHECKOUT_MAX_OPEN_SESSIONS,
});

/**
 * User money in and out (§4.2). Merchant money is `PayService`; this is a user's
 * own balance crossing the platform boundary.
 *
 * Fails fast on a misconfigured credit rail. `PAY_OPERATOR_CREDIT_RAILS` naming
 * a rail that is not registered would mean every operator deposit on it failing
 * at request time with an error about a rail id, which reads like a caller
 * mistake; it is a deployment one, and it belongs at boot.
 */
for (const railId of env.PAY_OPERATOR_CREDIT_RAILS) {
  if (!rails.has(railId)) {
    throw new Error(`PAY_OPERATOR_CREDIT_RAILS names "${railId}", which is not a registered rail. Registered: ${rails.ids().join(', ')}`);
  }
}

const userMoney = new UserMoneyService(sql, ledger, rails, {
  operatorCreditRails: env.PAY_OPERATOR_CREDIT_RAILS,
  valueMovement: railPosture.policy,
});

export const appRouter = createPayRouter(pay, rails, userMoney);
export type { PayRouter } from './router.js';

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

/**
 * Built before the listener opens: a service that cannot authenticate the edge
 * must fail to start, not start and serve every caller as anonymous.
 */
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

/**
 * `/ready` NAMES WHICH RAILS ARE REAL.
 *
 * It used to answer `rails: ['crypto-native', 'card-sandbox']`, which reads as
 * two working rails. An operator dashboard rendering that has no way to know
 * that neither of them can send a payment anywhere. The list of ids is the same;
 * what is added is the only part that matters when somebody asks "can users
 * withdraw".
 */
/**
 * `publicCheckout` IS ITS OWN QUESTION, and it is not answered by `liveRails`.
 *
 * "Which rails are live" and "can an anonymous person on the hosted checkout
 * actually pay this merchant right now" are different, because the public
 * surface is gated more strictly than the merchant integration path is: a
 * sandbox rail that is perfectly usable for `payment.create` is refused for a
 * hosted checkout under `live-only`. An operator console that renders the first
 * and infers the second will tell somebody the checkout works when every payer
 * is getting a 503.
 */
function publicCheckoutStatus(): { rails: string[]; acceptable: boolean; reason?: string } {
  const configured = env.PAY_CHECKOUT_RAILS.map((r) => r.railId);
  try {
    const adapter = selectPublicCheckoutRail(rails, configured, railPosture.policy);
    return { rails: configured, acceptable: true, reason: `would open on ${adapter.id}` };
  } catch (err) {
    return { rails: configured, acceptable: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

app.get('/ready', async () => ({
  ready: true,
  rails: rails.ids(),
  railModes: Object.fromEntries(rails.list().map((r) => [r.id, r.mode])),
  liveRails: railStatus.live,
  sandboxRails: railStatus.sandbox,
  valueMovement: railStatus.policy,
  chain: chain.description,
  publicCheckout: publicCheckoutStatus(),
}));

/**
 * Hosted payment-link checkout (HTML). Public — the token is the capability.
 * Browser reaches it via edge `/api/pay/checkout?token=…` (prefix stripped).
 */
await registerCheckoutRoutes(app, pay, { basePath: env.PAY_PUBLIC_BASE_PATH });

/**
 * THE WEBHOOK ENDPOINT.
 *
 * Reachable by anyone on the internet, and what it says is "money moved". Two
 * things therefore matter here and nowhere else in this file:
 *
 *  1. The RAW body. `content-type-parser` is disabled for this route so the
 *     bytes that were signed are the bytes that get verified. Fastify's JSON
 *     parser would hand us an object, and re-serialising it changes key order
 *     and whitespace — at which point every honest delivery fails and somebody
 *     "fixes" it by relaxing the check.
 *
 *  2. One response for every rejection. A verification endpoint that explains
 *     why it rejected something is an oracle for forging the next attempt.
 */
/**
 * THE PARSER COLLISION, and why the webhook is encapsulated.
 *
 * This service needs two mutually exclusive body parsers on one port:
 *
 *   · the webhook needs the RAW STRING, or signature verification compares
 *     re-serialised bytes against a signature over the original ones;
 *   · tRPC needs a PARSED OBJECT, and is handed a string it cannot read.
 *
 * Registering the raw parser on the root instance — as this file did while
 * nothing was mounted — makes every tRPC procedure fail to deserialise its
 * input. The failure is not obvious: the request arrives, the router matches,
 * and zod reports a malformed payload, which reads like a client bug.
 *
 * Fastify content-type parsers are per-encapsulation-context, so the webhook
 * gets its own plugin scope and its parser stays inside it. Nothing outside
 * this scope is affected, and the two can share a port without either being
 * compromised for the other's benefit.
 */
await app.register(async (webhookScope) => {
  webhookScope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  webhookScope.post<{ Params: { railId: string }; Body: string }>('/webhooks/:railId', async (request, reply) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers[key.toLowerCase()] = value;
    }

    try {
      const outcome = await pay.handleWebhook(request.params.railId, {
        headers,
        body: typeof request.body === 'string' ? request.body : '',
      });
      // A duplicate is a 200. A rail that gets anything else will keep retrying
      // a delivery we have already handled, forever.
      return reply.code(200).send({ received: true, duplicate: outcome.duplicate });
    } catch (err) {
      if (err instanceof PayError && err.code === 'pay.webhook_invalid') {
        return reply.code(401).send({ error: 'invalid signature' });
      }
      if (err instanceof PayError && err.code === 'pay.webhook_unmatched') {
        // 202: the delivery is genuine but about something we do not know. Not
        // the rail's fault, and not something a retry will fix — an operator
        // signal, and the trace carries the detail.
        app.log.warn({ err: err.message, railId: request.params.railId }, 'verified webhook matched no payment');
        return reply.code(202).send({ received: true, matched: false });
      }
      throw err;
    }
  });
});

/**
 * The user-facing surface, reached only through svc-edge.
 *
 * The mount boundary decision records pay as "gateway only". That was written
 * before svc-edge existed and it meant NOT PUBLICLY EXPOSED — which is now
 * satisfied by the edge being the only public listener. It did not mean "does
 * not serve /trpc": the edge routes `/api/pay` here, so without this mount it
 * forwards to a service with nothing to forward to.
 */
await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<typeof appRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });

/**
 * The posture goes in the log on every start. In dev, where `assertRailPosture`
 * does not throw, THIS LINE IS THE CONTROL'S ONLY VISIBILITY — the same reason
 * `screeningStatus` returns a summary string rather than just a boolean.
 */
if (railStatus.sandbox.length > 0) {
  app.log.warn({ ...railStatus, chain: chain.description, appEnv: railPosture.appEnv }, railStatus.summary);
}
if (railPosture.sandboxOverride) {
  app.log.warn(
    { appEnv: railPosture.appEnv, sandboxRails: railStatus.sandbox },
    'PAY_ALLOW_SANDBOX_RAILS=true — sandbox rails may move value in a production-like environment. ' +
      'No user of this deployment is being told anything true about their money leaving the platform.',
  );
}

app.log.info(
  { port: env.HTTP_PORT, rails: rails.ids(), liveRails: railStatus.live, valueMovement: railStatus.policy, trpc: true },
  'svc-pay ready',
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      // Draining, not dropping: an in-flight capture finishes before the
      // process exits, because the alternative is a payment captured at a rail
      // that this service never got to book.
      await app.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
