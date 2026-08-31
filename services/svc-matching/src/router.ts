import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { marketLifecycleAdmissionProofSchema, orderSideSchema, timeInForceSchema } from '@intafaced/exchange-contract';
import { rawBodyOf, retainRawBody, verifyServiceHeaders, type ServiceBodyBindMode } from '@intafaced/contracts';
import type { MatchingEngine } from './engine/engine.js';
import type { AmendResult, CancelledRef, EngineAmend, EngineOrder, Fill, RestingRef, SubmitResult } from './engine/types.js';
import { massCancelSessionRefuse, readSessionId } from './engine/mass-cancel.js';
import { missingSessionRefuse } from './engine/session.js';
import { operatorRefuse, readOperatorId } from './engine/halt.js';
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
/** Offset may be negative. Still a decimal string — never a JSON number. */
const signedDecimal = z.string().regex(/^-?\d+(\.\d{1,18})?$/, 'offsets are signed decimal strings with at most 18 decimal places');

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
  /** Caller session for cancel-on-disconnect. Missing is untagged — the engine does not invent one. */
  sessionId: z.string().max(128).optional(),
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
  /** Strike. Required to rest an option. The engine does not invent a strike. */
  strike: decimal.nullish(),
  /** Expiry. Required to rest an option. The engine does not invent an expiry. */
  expiry: z.string().nullish(),
  /** Minimum fill qty. Missing or zero is not set. The engine does not invent a default. */
  minQty: decimal.nullish(),
  /** All-or-none. Missing or false is a normal order. The engine does not invent a fill. */
  aon: z.boolean().optional(),
  /** Pegged to caller reference + offset. Missing those refuses. The engine does not invent a mid. */
  peg: z.boolean().optional(),
  /** Midpoint. Unsupported — refuses. The engine does not invent a mid. */
  midpoint: z.boolean().optional(),
  /** Relative to caller reference + offset. Missing those refuses. The engine does not invent a mid. */
  relative: z.boolean().optional(),
  /** Caller reference for peg/relative. The engine does not invent a mid. */
  reference: decimal.nullish(),
  /** Caller offset for peg/relative. Added to reference. Missing refuses. */
  offset: signedDecimal.nullish(),
  /** Auction. Unsupported — refuses. The engine does not invent an auction price. */
  auction: z.boolean().optional(),
  /** Benchmark. Unsupported — refuses. The engine does not invent a benchmark price. */
  benchmark: z.boolean().optional(),
  /** Price collar. Missing or false is a normal order. */
  collar: z.boolean().optional(),
  /** Caller collar min. Required when collar is true. The engine does not invent last or mid. */
  min: decimal.nullish(),
  /** Caller collar max. Required when collar is true. The engine does not invent last or mid. */
  max: decimal.nullish(),
  /** Caller min notional. Missing notional when requested refuses. The engine does not invent last. */
  minNotional: decimal.nullish(),
  /** PX-S01 evidence is mandatory at this private risk-increasing boundary. */
  lifecycleProof: marketLifecycleAdmissionProofSchema,
});

const closePositionBodySchema = z.object({
  orderId: z.string().uuid(),
  accountId: z.string().min(1).max(128),
  /** Same PLACE / market-lifecycle proof as a market submit. */
  lifecycleProof: marketLifecycleAdmissionProofSchema,
});

const massCancelBodySchema = z.object({
  /** §5.1: account ids only. This service never learns whose account it is. */
  accountId: z.string().min(1).max(128),
  /** Not on the book. Present and non-empty refuses rather than inventing a session. */
  sessionId: z.string().max(128).nullish(),
  /** Present buy|sell is that side only (book + stops). Missing/null is both. */
  side: orderSideSchema.nullish(),
});

const marketHaltBodySchema = z.object({
  /** Operator identity. Missing/empty refuses — the engine does not invent a caller. */
  operatorId: z.string().min(1).max(128),
});

const sessionDeadBodySchema = z.object({
  /** Caller session. Missing/empty refuses — the engine does not invent a session. */
  sessionId: z.string().min(1).max(128),
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
    ...(body.sessionId ? { sessionId: body.sessionId } : {}),
    ...(body.reduceOnly === true ? { reduceOnly: true } : {}),
    ...(body.iceberg === true || body.displayQty != null
      ? { iceberg: true, displayQty: body.displayQty == null ? null : parseAmount(body.displayQty) }
      : {}),
    ...(body.trail !== undefined ? { trail: body.trail == null ? null : parseAmount(body.trail) } : {}),
    ...(body.mark !== undefined ? { mark: body.mark == null ? null : parseAmount(body.mark) } : {}),
    ...(body.strike !== undefined ? { strike: body.strike == null ? null : parseAmount(body.strike) } : {}),
    ...(body.expiry !== undefined ? { expiry: body.expiry == null ? null : body.expiry } : {}),
    ...(body.minQty !== undefined ? { minQty: body.minQty == null ? null : parseAmount(body.minQty) } : {}),
    ...(body.aon !== undefined ? { aon: body.aon === true } : {}),
    ...(body.peg !== undefined ? { peg: body.peg === true } : {}),
    ...(body.midpoint !== undefined ? { midpoint: body.midpoint === true } : {}),
    ...(body.relative !== undefined ? { relative: body.relative === true } : {}),
    ...(body.reference !== undefined ? { reference: body.reference == null ? null : parseAmount(body.reference) } : {}),
    ...(body.offset !== undefined ? { offset: body.offset == null ? null : parseAmount(body.offset) } : {}),
    ...(body.auction !== undefined ? { auction: body.auction === true } : {}),
    ...(body.benchmark !== undefined ? { benchmark: body.benchmark === true } : {}),
    ...(body.collar !== undefined ? { collar: body.collar === true } : {}),
    ...(body.min !== undefined ? { min: body.min == null ? null : parseAmount(body.min) } : {}),
    ...(body.max !== undefined ? { max: body.max == null ? null : parseAmount(body.max) } : {}),
    ...(body.minNotional !== undefined ? { minNotional: body.minNotional == null ? null : parseAmount(body.minNotional) } : {}),
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
