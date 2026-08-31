import type { FastifyInstance, FastifyRequest } from 'fastify';
import { formatAmount } from '@intafaced/ledger-client/money';
import { rawBodyOf, retainRawBody, verifyServiceHeaders, type ServiceBodyBindMode } from '@intafaced/contracts';
import type { MatchingEngine } from './engine/engine.js';
import type { AmendResult, CancelledRef, Fill, RestingRef, SubmitResult } from './engine/types.js';
import { massCancelSessionRefuse, readSessionId } from './engine/mass-cancel.js';
import { missingSessionRefuse } from './engine/session.js';
import { operatorRefuse, readOperatorId } from './engine/halt.js';
import { postOnlyCannotRest } from './engine/post-only.js';
import { reconcile } from './reconcile.js';
import { userCopy } from './user-copy.js';
import {
  amendBodySchema,
  closePositionBodySchema,
  massCancelBodySchema,
  marketHaltBodySchema,
  reconcileBodySchema,
  sessionDeadBodySchema,
  submitBodySchema,
  toEngineAmend,
  toEngineOrder,
} from './router.js';

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
