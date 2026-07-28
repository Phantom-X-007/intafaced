import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { orderSideSchema, timeInForceSchema } from '@intafaced/exchange-contract';
import { verifyServiceHeaders } from '@intafaced/contracts';
import type { MatchingEngine } from './engine/engine.js';
import type { CancelledRef, EngineOrder, Fill, RestingRef, SubmitResult } from './engine/types.js';

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
function requireService(req: { headers: Record<string, string | string[] | undefined> }, secret: string): void {
  const { service } = verifyServiceHeaders(req.headers, secret);
  if (!service) {
    throw new MatchingAuthError('Order writes are callable only by another INTAFACED service with valid credentials (§2)');
  }
}

export class MatchingAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchingAuthError';
  }
}

export function registerRoutes(app: FastifyInstance, engine: MatchingEngine, internalSecret: string): void {
  app.post('/markets/:marketId/orders', async (req, reply) => {
    // 401, not 403: the caller has not said who it is.
    try {
      requireService(req, internalSecret);
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
      requireService(req, internalSecret);
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

  app.get('/markets', async () => ({ markets: engine.markets }));
}
