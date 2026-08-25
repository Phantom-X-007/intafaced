import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { marketLifecycleAdmissionProofSchema, orderSideSchema, timeInForceSchema } from '@intafaced/exchange-contract';
import { rawBodyOf, retainRawBody, verifyServiceHeaders, type ServiceBodyBindMode } from '@intafaced/contracts';
import type { MatchingEngine } from './engine/engine.js';
import type { AmendResult, CancelledRef, EngineAmend, EngineOrder, Fill, RestingRef, SubmitResult } from './engine/types.js';
import { bindPostOnlyTif, postOnlyCannotRest } from './engine/post-only.js';
import { reconcile } from './reconcile.js';
import { userCopy } from './user-copy.js';

/**
 * HTTP surface.
 *
 * §5.1 specifies gRPC for this service. It is HTTP+JSON here, deliberately and
 * temporarily:
 *
 * SOCKET §13 — gRPC transport. The engine's callable surface is `submit`,
 * `cancel`, and native `amend` — already narrow, already decimal strings. A
 * `.proto` in `packages/contracts` and a thin server in front of the same
 * `MatchingEngine` is the whole change; nothing in `engine/` moves. That proto
 * is a contracts PR (§15.2) and therefore cannot ship in this one.
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
  /** Caller stop trigger. Same money as stopPrice. The engine does not invent one. */
  stopPx: decimal.nullish(),
  tif: timeInForceSchema,
  /** Linked TP+SL sibling. First fill cancels the other; refuse if that sibling is already terminal. */
  ocoSiblingId: z.string().uuid().optional(),
  /** Caller expire instant for GTD/GTT. The engine does not invent one. */
  expireAt: z.string().min(1).optional(),
  /** Rest only if it shrinks this account's position. The engine does not invent a mark. */
  reduceOnly: z.boolean().optional(),
  /** Rest only if it would not take. The engine does not invent a price. */
  postOnly: z.boolean().optional(),
  iceberg: z.boolean().optional(),
  displayQty: decimal.optional(),
  /** Trail distance. Required to rest a trailing stop. The engine does not invent a distance. */
  trail: decimal.nullish(),
  /** Injected mark the trail walks with. The engine does not invent a mark. */
  mark: decimal.nullish(),
  /** Minimum fill qty. Missing or zero is not set. The engine does not invent a default. */
  minQty: decimal.nullish(),
  /** All-or-none. Missing or false is a normal order. The engine does not invent a fill. */
  aon: z.boolean().optional(),
  /** PX-S01 evidence is mandatory at this private risk-increasing boundary. */
  lifecycleProof: marketLifecycleAdmissionProofSchema,
});

const closePositionBodySchema = z.object({
  orderId: z.string().uuid(),
  accountId: z.string().min(1).max(128),
  /** Same PLACE / market-lifecycle proof as a market submit. */
  lifecycleProof: marketLifecycleAdmissionProofSchema,
});

const amendBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    qty: decimal.optional(),
    price: decimal.optional(),
    stopPrice: decimal.optional(),
    tif: timeInForceSchema.optional(),
    lifecycleProof: marketLifecycleAdmissionProofSchema,
  })
  .superRefine((body, ctx) => {
    if (body.qty === undefined && body.price === undefined && body.stopPrice === undefined && body.tif === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'amend must change qty, price, stopPrice, or tif' });
    }
  });

const counterpartOrderSchema = z.object({
  orderId: z.string().min(1).max(128),
  marketId: z.string().min(1).max(128),
  state: z.enum(['pending', 'open', 'terminal']),
  remaining: decimal,
  funded: z.boolean(),
  detail: z.string().max(256).optional(),
});

const reconcileBodySchema = z.object({
  orders: z.array(counterpartOrderSchema).max(10_000),
});

function toEngineOrder(body: z.infer<typeof submitBodySchema>): EngineOrder {
  const stopPx = body.stopPx ?? body.stopPrice;
  return {
    orderId: body.orderId,
    accountId: body.accountId,
    type: body.type,
    side: body.side,
    qty: parseAmount(body.qty),
    price: body.price == null ? null : parseAmount(body.price),
    stopPrice: stopPx == null ? null : parseAmount(stopPx),
    tif: bindPostOnlyTif(body.tif, body.postOnly),
    ...(body.ocoSiblingId ? { ocoSiblingId: body.ocoSiblingId } : {}),
    ...(body.expireAt ? { expireAt: body.expireAt } : {}),
    ...(body.reduceOnly === true ? { reduceOnly: true } : {}),
    ...(body.iceberg === true || body.displayQty != null
      ? { iceberg: true, displayQty: body.displayQty == null ? null : parseAmount(body.displayQty) }
      : {}),
    ...(body.trail !== undefined ? { trail: body.trail == null ? null : parseAmount(body.trail) } : {}),
    ...(body.mark !== undefined ? { mark: body.mark == null ? null : parseAmount(body.mark) } : {}),
    ...(body.minQty !== undefined ? { minQty: body.minQty == null ? null : parseAmount(body.minQty) } : {}),
    ...(body.aon !== undefined ? { aon: body.aon === true } : {}),
  };
}

function toEngineAmend(orderId: string, body: z.infer<typeof amendBodySchema>): EngineAmend {
  return {
    orderId,
    expectedVersion: body.expectedVersion,
    ...(body.qty !== undefined ? { qty: parseAmount(body.qty) } : {}),
    ...(body.price !== undefined ? { price: parseAmount(body.price) } : {}),
    ...(body.stopPrice !== undefined ? { stopPrice: parseAmount(body.stopPrice) } : {}),
    ...(body.tif !== undefined ? { tif: body.tif } : {}),
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
        version: resting.version,
      };

const presentCancellation = (cancellation: CancelledRef) => ({
  orderId: cancellation.orderId,
  accountId: cancellation.accountId,
  remainingQty: formatAmount(cancellation.remainingQty),
  sequence: cancellation.sequence,
  reason: cancellation.reason,
});

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

function presentAmend(result: AmendResult) {
  return {
    accepted: result.accepted,
    orderId: result.orderId,
    sequence: result.sequence,
    version: result.version,
    priority: result.priority,
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

export class MatchingAuthError extends Error {
  readonly rejected: string;
  constructor(rejected: string) {
    super(userCopy('matching.unauthenticated'));
    this.name = 'MatchingAuthError';
    this.rejected = rejected;
  }
}

export class MatchingForbiddenError extends Error {
  constructor() {
    super(userCopy('error.forbidden'));
    this.name = 'MatchingForbiddenError';
  }
}

function unauthenticatedBody(err: unknown): { code: 'Unauthenticated'; message: string; rejected?: string } {
  const rejected = err instanceof MatchingAuthError ? err.rejected : undefined;
  return {
    code: 'Unauthenticated',
    message: userCopy('matching.unauthenticated'),
    ...(rejected ? { rejected } : {}),
  };
}

function forbiddenBody(): { code: 'Forbidden'; message: string } {
  return { code: 'Forbidden', message: userCopy('error.forbidden') };
}

export interface MatchingRouteOptions {
  bodyBind?: ServiceBodyBindMode;
}

export function registerRoutes(
  app: FastifyInstance,
  engine: MatchingEngine,
  internalSecret: string,
  options: MatchingRouteOptions = {},
): void {
  const mode: ServiceBodyBindMode = 'require';
  void options;
  retainRawBody(app);

  const requireTradingService = (req: FastifyRequest): void => {
    const verification = verifyServiceHeaders(req.headers, internalSecret, { rawBody: rawBodyOf(req), mode });

    if (verification.service) {
      if (verification.service !== 'svc-trade') throw new MatchingForbiddenError();
      return;
    }

    if (verification.rejected === 'missing-body-digest' || verification.rejected === 'body-unavailable') {
      const legacy = verifyServiceHeaders(req.headers, internalSecret, { rawBody: rawBodyOf(req), mode: 'accept-both' });
      if (legacy.service && legacy.service !== 'svc-trade') throw new MatchingForbiddenError();
    }

    throw new MatchingAuthError(verification.rejected ?? 'unauthenticated');
  };

  const authFailure = (err: unknown, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    if (err instanceof MatchingForbiddenError) return reply.code(403).send(forbiddenBody());
    return reply.code(401).send(unauthenticatedBody(err));
  };

  app.post('/markets/:marketId/orders', async (req, reply) => {
    try {
      requireTradingService(req);
    } catch (err) {
      return authFailure(err, reply);
    }

    const { marketId } = req.params as { marketId: string };
    const parsed = submitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'BadRequest', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }

    if (postOnlyCannotRest(parsed.data.tif, parsed.data.postOnly)) {
      return reply.code(400).send({
        code: 'BadRequest',
        issues: ['postOnly cannot rest an immediate time-in-force; the engine does not invent a price'],
      });
    }
    const expectedAction = parsed.data.tif === 'PO' || parsed.data.postOnly === true ? 'PLACE_POST_ONLY' : 'PLACE';
    const proofIssues: string[] = [];
    if (parsed.data.lifecycleProof.snapshot.marketId !== marketId) {
      proofIssues.push('lifecycleProof.snapshot.marketId: must match the route marketId');
    }
    if (parsed.data.lifecycleProof.action !== expectedAction) {
      proofIssues.push(`lifecycleProof.action: must be ${expectedAction} for this order`);
    }
    if (proofIssues.length > 0) return reply.code(400).send({ code: 'BadRequest', issues: proofIssues });

    const result = await engine.submit(marketId, toEngineOrder(parsed.data), parsed.data.lifecycleProof);
    return reply.code(200).send(presentSubmit(result));
  });

  app.post('/markets/:marketId/positions/close', async (req, reply) => {
    try {
      requireTradingService(req);
    } catch (err) {
      return authFailure(err, reply);
    }

    const { marketId } = req.params as { marketId: string };
    const parsed = closePositionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'BadRequest', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }

    const proofIssues: string[] = [];
    if (parsed.data.lifecycleProof.snapshot.marketId !== marketId) {
      proofIssues.push('lifecycleProof.snapshot.marketId: must match the route marketId');
    }
    if (parsed.data.lifecycleProof.action !== 'PLACE') {
      proofIssues.push('lifecycleProof.action: must be PLACE for this order');
    }
    if (proofIssues.length > 0) return reply.code(400).send({ code: 'BadRequest', issues: proofIssues });

    const result = await engine.closePosition(
      marketId,
      { orderId: parsed.data.orderId, accountId: parsed.data.accountId },
      parsed.data.lifecycleProof,
    );
    return reply.code(200).send(presentSubmit(result));
  });

  app.patch('/markets/:marketId/orders/:orderId', async (req, reply) => {
    try {
      requireTradingService(req);
    } catch (err) {
      return authFailure(err, reply);
    }

    const { marketId, orderId } = req.params as { marketId: string; orderId: string };
    const parsed = amendBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'BadRequest', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }

    const proofIssues: string[] = [];
    if (parsed.data.lifecycleProof.snapshot.marketId !== marketId) {
      proofIssues.push('lifecycleProof.snapshot.marketId: must match the route marketId');
    }
    if (parsed.data.lifecycleProof.action !== 'AMEND') {
      proofIssues.push('lifecycleProof.action: must be AMEND for this order');
    }
    if (proofIssues.length > 0) return reply.code(400).send({ code: 'BadRequest', issues: proofIssues });

    const result = await engine.amend(marketId, toEngineAmend(orderId, parsed.data), parsed.data.lifecycleProof);
    if (!result.accepted && result.rejected?.code === 'order_not_found') {
      return reply.code(404).send({ code: 'OrderNotFound', message: userCopy('matching.order_not_found') });
    }
    return reply.code(200).send(presentAmend(result));
  });

  app.delete('/markets/:marketId/orders/:orderId', async (req, reply) => {
    try {
      requireTradingService(req);
    } catch (err) {
      return authFailure(err, reply);
    }

    const { marketId, orderId } = req.params as { marketId: string; orderId: string };
    const result = await engine.cancel(marketId, orderId);
    if (!result.cancelled) return reply.code(404).send({ code: 'OrderNotFound', message: userCopy('matching.order_not_found') });
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

    if (depth === null) {
      return reply.code(404).send({ code: 'MarketNotFound', message: userCopy('matching.market_not_found') });
    }
    return reply.code(200).send({ marketId, ...depth });
  });

  app.get('/markets/:marketId/orders', async (req, reply) => {
    try {
      requireTradingService(req);
    } catch (err) {
      return authFailure(err, reply);
    }

    const { marketId } = req.params as { marketId: string };
    if (!engine.hasMarket(marketId)) {
      return reply.code(404).send({ code: 'MarketNotFound', message: userCopy('matching.market_not_found') });
    }

    return reply.code(200).send({ marketId, orders: engine.restingOrders(marketId) });
  });

  app.post('/reconcile', async (req, reply) => {
    try {
      requireTradingService(req);
    } catch (err) {
      return authFailure(err, reply);
    }

    const parsed = reconcileBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'BadRequest', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }

    const report = reconcile(engine.restingOrders(), parsed.data.orders);
    return reply.code(200).send(report);
  });

  app.get('/markets', async () => ({ markets: engine.markets }));
}
