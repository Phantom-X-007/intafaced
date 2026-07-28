import Fastify from 'fastify';
import postgres from 'postgres';
import { env } from './env.js';
import { PayError, PayService } from './payment-service.js';
import { UserMoneyService } from './user-money-service.js';
import { createLedgerClient } from './ledger-client.js';
import { CardSandboxAdapter } from './rails/card-sandbox.js';
import { CryptoNativeAdapter } from './rails/crypto-native.js';
import { MemoryChain } from './rails/chain-port.js';
import { RailRegistry } from './rails/registry.js';
import { createPayRouter } from './router.js';

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
 * Until it lands, dev runs against the in-memory reference chain, which models
 * confirmation depth and idempotent broadcast so the adapter's behaviour is the
 * same either way.
 */
const chain = new MemoryChain();

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

const pay = new PayService(sql, ledger, rails, {
  defaultFeeBps: env.PAY_DEFAULT_FEE_BPS,
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
});

// The router is constructed so the type is exported and the wiring is exercised
// at boot; mounting it is the API gateway's job (§9).
export const appRouter = createPayRouter(pay, rails, userMoney);
export type { PayRouter } from './router.js';

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({ ready: true, rails: rails.ids() }));

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
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  done(null, body);
});

app.post<{ Params: { railId: string }; Body: string }>('/webhooks/:railId', async (request, reply) => {
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

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, rails: rails.ids() }, 'svc-pay ready');

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
