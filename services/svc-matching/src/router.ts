import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { orderSideSchema, timeInForceSchema } from '@intafaced/exchange-contract';
import {
  DEFAULT_SERVICE_BODY_BIND_MODE,
  rawBodyOf,
  retainRawBody,
  verifyServiceHeaders,
  type ServiceBodyBindMode,
} from '@intafaced/contracts';
import type { MatchingEngine } from './engine/engine.js';
import type { CancelledRef, EngineOrder, Fill, RestingRef, SubmitResult } from './engine/types.js';
import { reconcile } from './reconcile.js';

/**
 * HTTP surface.
 *
 * §5.1 specifies gRPC for this service. It is HTTP+JSON here, deliberately and
 * temporarily:
 *
 * SOCKET §13 — gRPC transport. The engine's callable surface is exactly
 * `submit` and `cancel`, both already narrow and both already speaking decimal
 * strings. A `.proto` in `packages/contracts` and a thin server in front of the
 * same `MatchingEngine` is the whole change; nothing in `engine/` moves. That
 * proto is a contracts PR (§15.2) and therefore cannot ship in this one.
 */

/** Decimal string. Reusing the exchange contract's rule rather than inventing a second one. */
const decimal = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are positive decimal strings with at most 18 decimal places');

/** §5.1 order types. `take_profit` is mapped down by svc-trade before it reaches here. */
const engineOrderTypeSchema = z.enum(['market', 'limit', 'stop', 'stop_limit']);

const submitBodySchema = z.object({
  orderId: z.string().uuid(),
  /** §5.1: account ids only. This service never learns whose account it is. */
  accountId: z.string().min(1).max(128),
  type: engineOrderTypeSchema,
  side: orderSideSchema,
  qty: decimal,
  price: decimal.nullish(),
  stopPrice: decimal.nullish(),
  tif: timeInForceSchema,
});

/**
 * The caller's view of its own orders, for `POST /reconcile`.
 *
 * `state` is three values on purpose. svc-trade's status enum has six, and the
 * mapping from `filled | cancelled | rejected | expired` to `terminal` belongs
 * to svc-trade — putting it here would teach the engine another service's enum
 * for no gain, and would have to be edited every time that enum grows.
 *
 * Capped at 10k orders per call so an operator sweep pages rather than handing
 * the engine an unbounded body to hold in memory while it is matching.
 */
const counterpartOrderSchema = z.object({
  orderId: z.string().min(1).max(128),
  marketId: z.string().min(1).max(128),
  state: z.enum(['pending', 'open', 'terminal']),
  remaining: decimal,
  /** Does the caller hold value against this order? The engine relays it; it never computes it. */
  funded: z.boolean(),
  /** Echoed into a refusal so an operator sees the caller's side without a second query. */
  detail: z.string().max(256).optional(),
});

const reconcileBodySchema = z.object({
  orders: z.array(counterpartOrderSchema).max(10_000),
});

function toEngineOrder(body: z.infer<typeof submitBodySchema>): EngineOrder {
  return {
    orderId: body.orderId,
    accountId: body.accountId,
    type: body.type,
    side: body.side,
    qty: parseAmount(body.qty),
    price: body.price == null ? null : parseAmount(body.price),
    stopPrice: body.stopPrice == null ? null : parseAmount(body.stopPrice),
    tif: body.tif,
  };
}

const presentFill = (fill: Fill) => ({
  sequence: fill.sequence,
  makerOrderId: fill.makerOrderId,
  makerAccountId: fill.makerAccountId,
  takerOrderId: fill.takerOrderId,
  takerAccountId: fill.takerAccountId,
  takerSide: fill.takerSide,
  price: formatAmount(fill.price),
  qty: formatAmount(fill.qty),
});

const presentResting = (resting: RestingRef | null) =>
  resting === null
    ? null
    : {
        kind: resting.kind,
        orderId: resting.orderId,
        accountId: resting.accountId,
        side: resting.side,
        price: formatAmount(resting.price),
        remaining: formatAmount(resting.remaining),
        sequence: resting.sequence,
      };

const presentCancellation = (cancellation: CancelledRef) => ({
  orderId: cancellation.orderId,
  accountId: cancellation.accountId,
  remainingQty: formatAmount(cancellation.remainingQty),
  sequence: cancellation.sequence,
  reason: cancellation.reason,
});

/** Every amount leaves as a decimal string. A JSON number would round the 18th place away silently. */
function presentSubmit(result: SubmitResult) {
  return {
    accepted: result.accepted,
    sequence: result.sequence,
    fills: result.fills.map(presentFill),
    resting: presentResting(result.resting),
    rejected: result.rejected ?? null,
    cancellations: result.cancellations.map(presentCancellation),
    triggered: result.triggered.map((t) => ({
      orderId: t.orderId,
      sequence: t.sequence,
      fills: t.fills.map(presentFill),
      resting: presentResting(t.resting),
      cancellations: t.cancellations.map(presentCancellation),
      rejected: t.rejected ?? null,
    })),
  };
}

/**
 * WRITES ARE SERVICE-ONLY (§2, §5.1).
 *
 * The engine's whole design rests on one property, stated in svc-trade:
 *
 *     "svc-matching is allowed to be pure precisely because it never sees an
 *      unfunded order."
 *
 * That holds only if svc-trade is the only thing that can submit. These routes
 * had no authentication at all, so anyone reaching the port could:
 *
 *   · **submit an order the ledger never held funds for** — the engine matches
 *     it, publishes a fill, and svc-trade is asked to settle a fill for an
 *     order it has no record of. The invariant the engine's purity depends on
 *     is broken from outside.
 *   · **cancel any resting order by id.** The engine publishes `orderCancelled`
 *     and svc-trade dutifully releases that user's hold. Cancel a whole book
 *     with a for-loop over ids.
 *
 * Reads stay open: depth and the market list are public market data, and a
 * price is not a secret. Writes are not.
 */
export class MatchingAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchingAuthError';
  }
}

export interface MatchingRouteOptions {
  /**
   * How strictly to enforce S2S body binding (L2-6). Defaults to `accept-both`,
   * the setting that cannot 401 a caller that has not been redeployed yet.
   *
   * An order submit is a money instruction: svc-trade has already placed the
   * ledger hold by the time it calls here, so a signature replayable against a
   * different body is a replayable order against someone else's funded hold.
   */
  bodyBind?: ServiceBodyBindMode;
}

export function registerRoutes(
  app: FastifyInstance,
  engine: MatchingEngine,
  internalSecret: string,
  options: MatchingRouteOptions = {},
): void {
  const mode = options.bodyBind ?? DEFAULT_SERVICE_BODY_BIND_MODE;

  /**
   * Keep the exact request bytes so the signed digest can be checked against
   * them (L2-6). Installed here rather than in `index.ts` so that mounting these
   * routes and being able to verify their bodies cannot come apart.
   */
  retainRawBody(app);

  const requireService = (req: FastifyRequest): void => {
    const { service, rejected, scheme } = verifyServiceHeaders(req.headers, internalSecret, { rawBody: rawBodyOf(req), mode });

    if (!service) {
      throw new MatchingAuthError(`Order writes are callable only by another INTAFACED service with valid credentials (§2): ${rejected}`);
    }

    // THE MIGRATION SIGNAL (L2-6). A v1 accept is an authenticated caller whose
    // signature is still replayable against any order body for 300 seconds. When
    // this has gone quiet for every caller, INTERNAL_SERVICE_BODY_BIND=require is
    // safe to set here.
    if (scheme === 'v1') {
      app.log.warn(
        { callingService: service, scheme, bodyBind: mode },
        's2s caller did not bind its order body (L2-6) — its signature is replayable; redeploy it before setting INTERNAL_SERVICE_BODY_BIND=require',
      );
    }
  };

  app.post('/markets/:marketId/orders', async (req, reply) => {
    // 401, not 403: the caller has not said who it is.
    try {
      requireService(req);
    } catch (err) {
      return reply.code(401).send({ code: 'Unauthenticated', message: (err as Error).message });
    }

    const { marketId } = req.params as { marketId: string };
    const parsed = submitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'BadRequest', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }

    const result = await engine.submit(marketId, toEngineOrder(parsed.data));
    // A rejection is a valid answer, not a server fault — 200 with `accepted:false`
    // keeps a bot's retry logic from treating "post-only would cross" as an outage.
    return reply.code(200).send(presentSubmit(result));
  });

  app.delete('/markets/:marketId/orders/:orderId', async (req, reply) => {
    try {
      requireService(req);
    } catch (err) {
      return reply.code(401).send({ code: 'Unauthenticated', message: (err as Error).message });
    }

    const { marketId, orderId } = req.params as { marketId: string; orderId: string };
    const result = await engine.cancel(marketId, orderId);
    if (!result.cancelled) return reply.code(404).send({ code: 'OrderNotFound', message: `${orderId} is not live in ${marketId}` });
    return reply.code(200).send({
      cancelled: true,
      orderId: result.orderId,
      sequence: result.sequence,
      cancellation: result.cancellation ? presentCancellation(result.cancellation) : null,
    });
  });

  app.get('/markets/:marketId/depth', async (req, reply) => {
    const { marketId } = req.params as { marketId: string };
    const limit = Number((req.query as { limit?: string }).limit ?? '50');
    const depth = engine.depth(marketId, Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50);

    // 404 for a market that has never traded. Previously this route allocated
    // and STORED a book for any string, so an unauthenticated caller could grow
    // the engine's memory without bound — and every one of those phantom books
    // then appeared to exist. Reading must not create.
    if (depth === null) {
      return reply.code(404).send({ code: 'MarketNotFound', message: `${marketId} is not a market on this engine` });
    }
    return reply.code(200).send({ marketId, ...depth });
  });

  /**
   * THE NON-DESTRUCTIVE LIVENESS READ.
   *
   * Service-only, and the reason is the same one that closed the write routes:
   * this response carries order ids and account ids, and an order id is all you
   * need to cancel someone's order. Depth is public because a price is not a
   * secret — a list of whose orders are resting where is not the same fact.
   *
   * 404 for a market with no book, matching `/depth`: "no such market" and "a
   * market with nothing resting" are different answers and a reconciler that
   * cannot tell them apart will report a whole book as missing.
   */
  app.get('/markets/:marketId/orders', async (req, reply) => {
    try {
      requireService(req);
    } catch (err) {
      return reply.code(401).send({ code: 'Unauthenticated', message: (err as Error).message });
    }

    const { marketId } = req.params as { marketId: string };
    if (!engine.hasMarket(marketId)) {
      return reply.code(404).send({ code: 'MarketNotFound', message: `${marketId} is not a market on this engine` });
    }

    return reply.code(200).send({ marketId, orders: engine.restingOrders(marketId) });
  });

  /**
   * RECONCILE — compare the engine against the caller's view of the world.
   *
   * Service-only for the same reason as the read above: the caller has to send
   * order ids to get order ids back.
   *
   * READ-ONLY, and that is the design, not a limitation. It cancels nothing and
   * moves no value; the response is a list of disagreements that names the order
   * and both states. Where a disagreement cannot be resolved without choosing
   * which side is wrong, it refuses and says so — see `reconcile.ts` for why
   * every one of those choices is unsafe from the two states alone.
   *
   * 200 with `ok:false` rather than a 4xx: a refusal is a successful, correct
   * answer to the question that was asked. A caller polling this should not have
   * to distinguish "the engine is unreachable" from "the engine found a problem".
   */
  app.post('/reconcile', async (req, reply) => {
    try {
      requireService(req);
    } catch (err) {
      return reply.code(401).send({ code: 'Unauthenticated', message: (err as Error).message });
    }

    const parsed = reconcileBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'BadRequest', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }

    // The whole engine, not one market: an order resting under a market the
    // caller did not expect is one `market_disagreement`, and a per-market view
    // would report it as two unrelated findings instead.
    const report = reconcile(engine.restingOrders(), parsed.data.orders);
    return reply.code(200).send(report);
  });

  app.get('/markets', async () => ({ markets: engine.markets }));
}
