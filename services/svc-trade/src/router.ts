import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { AuthError } from '@intafaced/auth';
import { formatAmount, parseAmount, InsufficientFundsError, LedgerError } from '@intafaced/ledger-client';
import { orderSideSchema, timeInForceSchema } from '@intafaced/exchange-contract';
import { TradeError, type FillRecord, type Market, type OrderRecord } from './spot/types.js';
import type { TradeService } from './spot/trade-service.js';

/**
 * svc-trade's API (§5.2).
 *
 * Every amount on this boundary is a DECIMAL STRING, in and out. `Amount` is a
 * scaled bigint and bigint does not survive JSON; a JS number would round the
 * 18th decimal place away silently, which is the place the ledger reconciles
 * at. The conversion happens here and nowhere else.
 *
 * Authorisation is declared on the procedure — `scopedProcedure('trade:write',
 * { module: 'trade' })` checks the scope, the verification tier and the
 * jurisdiction matrix in one middleware, so nothing can accidentally skip the
 * matrix. `TradeService` repeats the scope check internally, because a service
 * whose only gate lives in one transport gains a hole the day it gains a second
 * transport.
 *
 * `trade:withdraw` appears nowhere here, deliberately: it is an
 * INTERACTIVE_ONLY scope that no API key may hold, which is what protects a
 * leaked bot key from moving value off the platform.
 */

/** Unsigned decimal string. Reuses the exchange contract's rule rather than inventing a second one. */
const decimal = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are unsigned decimal strings with at most 18 decimal places');

const marketOutput = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  base: z.string(),
  quote: z.string(),
  kind: z.enum(['spot', 'futures', 'options']),
  status: z.enum(['pending', 'active', 'halted', 'delisted']),
  tickSize: decimal,
  lotSize: decimal,
  minQty: decimal,
  maxQty: decimal.nullable(),
  minNotional: decimal,
  makerBps: z.number().int(),
  takerBps: z.number().int(),
  listedAt: z.string().nullable(),
});

const orderOutput = z.object({
  id: z.string().uuid(),
  clientOrderId: z.string().nullable(),
  marketId: z.string().uuid(),
  side: orderSideSchema,
  type: z.enum(['market', 'limit']),
  price: decimal.nullable(),
  qty: decimal,
  filled: decimal,
  remaining: decimal,
  status: z.enum(['pending', 'open', 'filled', 'cancelled', 'rejected', 'expired']),
  timeInForce: timeInForceSchema,
  /** What is locked in the ledger for this order — the asset and the amount posted. */
  holdAsset: z.string(),
  holdAmount: decimal,
  feeDiscountBps: z.number().int(),
  rejectCode: z.string().nullable(),
  timestamp: z.number().int(),
});

const fillOutput = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  marketId: z.string().uuid(),
  side: orderSideSchema,
  takerOrMaker: z.enum(['maker', 'taker']),
  price: decimal,
  amount: decimal,
  cost: decimal,
  fee: z.object({ cost: decimal, currency: z.string(), rateBps: z.number().int() }),
  timestamp: z.number().int(),
});

function presentMarket(market: Market) {
  return {
    id: market.id,
    symbol: market.symbol,
    base: market.baseAsset,
    quote: market.quoteAsset,
    kind: market.kind,
    status: market.status,
    tickSize: formatAmount(market.tickSize),
    lotSize: formatAmount(market.lotSize),
    minQty: formatAmount(market.minQty),
    maxQty: market.maxQty === null ? null : formatAmount(market.maxQty),
    minNotional: formatAmount(market.minNotional),
    makerBps: market.makerBps,
    takerBps: market.takerBps,
    listedAt: market.listedAt?.toISOString() ?? null,
  };
}

function presentOrder(order: OrderRecord) {
  return {
    id: order.id,
    clientOrderId: order.clientOrderId,
    marketId: order.marketId,
    side: order.side,
    type: order.type,
    price: order.price === null ? null : formatAmount(order.price),
    qty: formatAmount(order.qty),
    filled: formatAmount(order.filledQty),
    remaining: formatAmount(order.qty - order.filledQty),
    status: order.status,
    timeInForce: order.tif,
    holdAsset: order.holdAsset,
    holdAmount: formatAmount(order.holdAmount),
    feeDiscountBps: order.feeDiscountBps,
    rejectCode: order.rejectCode,
    timestamp: order.createdAt.getTime(),
  };
}

function presentFill(fill: FillRecord) {
  return {
    id: fill.id,
    orderId: fill.orderId,
    marketId: fill.marketId,
    side: fill.side,
    takerOrMaker: fill.liquidity,
    price: formatAmount(fill.price),
    amount: formatAmount(fill.qty),
    cost: formatAmount(fill.quoteAmount),
    fee: { cost: formatAmount(fill.feeAmount), currency: fill.feeAsset, rateBps: fill.feeBps },
    timestamp: fill.ts.getTime(),
  };
}

/**
 * Map a domain error to the wire.
 *
 * Integrators branch on these, so the mapping is part of the contract: a venue
 * that returns the wrong class breaks every bot's retry logic. In particular
 * `ledger.insufficient_funds` must NOT look retryable — retrying a rejected
 * hold just rejects it again — while an unreachable engine must, because the
 * order may not have been placed at all.
 */
function toTrpcError(err: unknown): TRPCError {
  if (err instanceof InsufficientFundsError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }

  if (err instanceof TradeError) {
    switch (err.code) {
      case 'trade.market_not_found':
      case 'trade.order_not_found':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'trade.not_owner':
        return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
      case 'trade.spot_disabled':
      case 'trade.market_not_tradable':
      case 'trade.market_kind_unsupported':
        return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
      case 'trade.perks_unavailable':
        return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
      case 'trade.dust_fill':
      case 'trade.hold_uncovered':
        // Neither is the caller's fault and neither is retryable by them. They
        // are operator alarms that happen to surface on a request.
        return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
      default:
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
  }

  if (err instanceof AuthError) {
    return new TRPCError({ code: err.code === 'mfa.required' ? 'UNAUTHORIZED' : 'FORBIDDEN', message: err.message, cause: err });
  }

  if (err instanceof LedgerError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }

  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Request failed', cause: err });
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toTrpcError(err);
  }
}

export function createTradeRouter(trade: TradeService) {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-trade') }))
      .query(() => ({ ok: true, service: 'svc-trade' as const })),

    markets: router({
      /** Public. Reading what is listed needs no authentication (§9). */
      list: publicProcedure.output(z.array(marketOutput)).query(async () => (await trade.markets()).map(presentMarket)),

      get: publicProcedure
        .input(z.object({ symbol: z.string().min(3) }))
        .output(marketOutput)
        .query(async ({ input }) => {
          const market = await trade.marketBySymbol(input.symbol);
          if (!market) throw new TRPCError({ code: 'NOT_FOUND', message: `market ${input.symbol} not found` });
          return presentMarket(market);
        }),
    }),

    orders: router({
      /**
       * THE MONEY PATH. `trade:write`, tier and jurisdiction, then the flow in
       * `TradeService.placeOrder`: risk → hold → engine → fill/release.
       */
      create: scopedProcedure('trade:write', { module: 'trade' })
        .input(
          z
            .object({
              symbol: z.string().min(3),
              side: orderSideSchema,
              type: z.enum(['market', 'limit']),
              qty: decimal,
              price: decimal.optional(),
              timeInForce: timeInForceSchema.optional(),
              /** Strongly recommended. Without one, a retry opens a second order. */
              clientOrderId: z.string().min(1).max(64).optional(),
              subAccountId: z.string().uuid().optional(),
            })
            .superRefine((order, ctx) => {
              // Rejected at the boundary rather than guessed at: a limit order
              // with no price is the single most common integration bug, and a
              // market order carrying one is a caller who thinks they placed a
              // limit.
              if (order.type === 'limit' && order.price === undefined) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['price'], message: 'a limit order requires a price' });
              }
              if (order.type === 'market' && order.price !== undefined) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['price'], message: 'a market order must not carry a price' });
              }
            }),
        )
        .output(orderOutput)
        .mutation(({ ctx, input }) =>
          guard(async () =>
            presentOrder(
              await trade.placeOrder(ctx.principal, {
                symbol: input.symbol,
                side: input.side,
                type: input.type,
                qty: parseAmount(input.qty),
                price: input.price === undefined ? null : parseAmount(input.price),
                tif: input.timeInForce,
                clientOrderId: input.clientOrderId,
                subAccountId: input.subAccountId,
              }),
            ),
          ),
        ),

      /**
       * Cancelling is `trade:write` but is NOT gated on the market being
       * tradable or on the kill-switch. An operator who has halted a market
       * must still let users out; a control that traps funds is not a safety
       * control.
       */
      cancel: scopedProcedure('trade:write', { module: 'trade' })
        .input(z.object({ orderId: z.string().uuid() }))
        .output(orderOutput)
        .mutation(({ ctx, input }) => guard(async () => presentOrder(await trade.cancelOrder(ctx.principal, input.orderId)))),

      get: scopedProcedure('trade:read')
        .input(z.object({ orderId: z.string().uuid() }))
        .output(orderOutput)
        .query(({ ctx, input }) => guard(async () => presentOrder(await trade.getOrder(ctx.principal, input.orderId)))),

      open: scopedProcedure('trade:read')
        .input(z.object({ marketId: z.string().uuid().optional() }).optional())
        .output(z.array(orderOutput))
        .query(({ ctx, input }) => guard(async () => (await trade.openOrders(ctx.principal, input?.marketId)).map(presentOrder))),
    }),

    fills: router({
      mine: scopedProcedure('trade:read')
        .input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional())
        .output(z.array(fillOutput))
        .query(({ ctx, input }) => guard(async () => (await trade.myFills(ctx.principal, input?.limit ?? 100)).map(presentFill))),
    }),
  });
}

export type TradeRouter = ReturnType<typeof createTradeRouter>;
