import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { enabledFiat } from '@intafaced/config';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { P2pError, PricingError, TradeStateError, type P2pService } from './p2p-service.js';

/**
 * svc-p2p's API (§6.2).
 *
 * Money crosses this boundary as **decimal strings**, in and out. `parseAmount`
 * at the edge, `formatAmount` on the way back, `Amount` (scaled bigint) in
 * between. A JS number never touches a P2P amount — including the fiat leg,
 * where a rounding error is a payment the counterparty can refuse.
 *
 * Every mutating procedure is `scopedProcedure('p2p:write', { module: 'p2p' })`,
 * which checks the scope AND runs the jurisdiction matrix (§7). P2P is
 * custodial on the Fiat Plane — the platform holds the escrowed asset — so §22
 * puts it behind tiered verification, and that follows from `module: 'p2p'`
 * rather than from a check written here.
 */

/** Decimal string on the wire. Rejects anything a float could have mangled. */
const amountString = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are unsigned decimal strings with at most 18dp');

const offerOutput = z.object({
  id: z.string().uuid(),
  makerId: z.string(),
  side: z.enum(['buy', 'sell']),
  asset: z.string(),
  fiatCurrency: z.string(),
  priceType: z.enum(['fixed', 'float']),
  price: amountString,
  minAmount: amountString,
  maxAmount: amountString,
  remainingAmount: amountString,
  methods: z.array(z.unknown()),
  terms: z.string(),
  status: z.enum(['active', 'paused', 'closed']),
  createdAt: z.string(),
});

const tradeOutput = z.object({
  id: z.string().uuid(),
  offerId: z.string().uuid(),
  sellerId: z.string(),
  buyerId: z.string(),
  asset: z.string(),
  amount: amountString,
  fiatCurrency: z.string(),
  fiatAmount: amountString,
  price: amountString,
  method: z.string(),
  status: z.enum(['created', 'escrowed', 'fiat_sent', 'released', 'cancelled', 'disputed']),
  resolution: z.enum(['released', 'refunded', 'voided']).nullable(),
  deadlineAt: z.string().nullable(),
  createdAt: z.string(),
  escrowedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  settledAt: z.string().nullable(),
});

const reputationOutput = z.object({
  tradesTotal: z.number().int(),
  completed: z.number().int(),
  cancelled: z.number().int(),
  disputed: z.number().int(),
  disputesLost: z.number().int(),
  completionRate: z.number(),
  avgReleaseSecs: z.number().int(),
  badges: z.array(z.string()),
});

type OfferOut = z.infer<typeof offerOutput>;
type TradeOut = z.infer<typeof tradeOutput>;

/**
 * Map a service error onto a tRPC code.
 *
 * `p2p.trade_terminal` is deliberately CONFLICT and not BAD_REQUEST: a second
 * release attempt is not a malformed request, it is a request that arrived
 * after the escrow already reached a terminal state, and a client retrying a
 * timed-out call needs to be able to tell those apart.
 */
function toTrpcError(err: unknown): TRPCError {
  if (err instanceof TradeStateError) {
    return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
  }

  if (err instanceof PricingError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }

  if (err instanceof P2pError) {
    switch (err.code) {
      case 'p2p.offer_not_found':
      case 'p2p.trade_not_found':
      case 'p2p.dispute_not_found':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'p2p.not_a_party':
      case 'p2p.not_the_seller':
      case 'p2p.not_the_buyer':
      case 'p2p.self_trade':
      case 'p2p.trading_disabled':
        return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
      case 'p2p.dispute_already_open':
      case 'p2p.dispute_already_resolved':
      case 'p2p.trade_exists':
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
      case 'p2p.offer_not_active':
      case 'p2p.offer_method_unsupported':
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
      case 'p2p.escrow_missing':
        // Not a client error: the caller asked for something reasonable and the
        // trade was not in a state that could honour it.
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
    }
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

export function createP2pRouter(p2p: P2pService) {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-p2p') }))
      .query(() => ({ ok: true, service: 'svc-p2p' as const })),

    /**
     * §6.2: "100+ fiat currencies = config, not code."
     *
     * Served straight out of `packages/config` — svc-p2p has no currency table
     * and adding a currency touches no service.
     */
    fiat: router({
      list: publicProcedure
        .output(z.array(z.object({ code: z.string(), name: z.string(), symbol: z.string(), minorUnits: z.number().int() })))
        .query(() => enabledFiat().map((f) => ({ code: f.code, name: f.name, symbol: f.symbol, minorUnits: f.minorUnits }))),
    }),

    offers: router({
      create: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(
          z.object({
            side: z.enum(['buy', 'sell']),
            asset: z.string().min(1).max(16),
            fiatCurrency: z.string().length(3),
            priceType: z.enum(['fixed', 'float']),
            price: amountString,
            minAmount: amountString,
            maxAmount: amountString,
            totalAmount: amountString.optional(),
            methods: z.array(z.unknown()).optional(),
            terms: z.string().max(4000).optional(),
          }),
        )
        .output(offerOutput)
        .mutation(async ({ ctx, input }) =>
          guard(async () =>
            toOfferOut(
              await p2p.createOffer({
                makerId: ctx.principal.userId,
                side: input.side,
                asset: input.asset,
                fiatCurrency: input.fiatCurrency,
                priceType: input.priceType,
                price: parseAmount(input.price),
                minAmt: parseAmount(input.minAmount),
                maxAmt: parseAmount(input.maxAmount),
                ...(input.totalAmount ? { totalAmt: parseAmount(input.totalAmount) } : {}),
                ...(input.methods ? { methods: input.methods } : {}),
                ...(input.terms ? { terms: input.terms } : {}),
              }),
            ),
          ),
        ),

      list: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(
          z
            .object({
              asset: z.string().optional(),
              fiatCurrency: z.string().length(3).optional(),
              side: z.enum(['buy', 'sell']).optional(),
              limit: z.number().int().min(1).max(200).optional(),
            })
            .optional(),
        )
        .output(z.array(offerOutput))
        .query(async ({ input }) => guard(async () => (await p2p.listOffers(input ?? {})).map(toOfferOut))),

      get: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ offerId: z.string().uuid() }))
        .output(offerOutput)
        .query(async ({ input }) => guard(async () => toOfferOut(await p2p.getOffer(input.offerId)))),

      close: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(z.object({ offerId: z.string().uuid() }))
        .output(offerOutput)
        .mutation(async ({ ctx, input }) => guard(async () => toOfferOut(await p2p.closeOffer(input.offerId, ctx.principal.userId)))),
    }),

    trades: router({
      /** Take an offer → `escrowLock`. The first money path in this router. */
      take: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(
          z.object({
            offerId: z.string().uuid(),
            amount: amountString,
            method: z.string().min(1).max(64),
          }),
        )
        .output(tradeOutput)
        .mutation(async ({ ctx, input }) =>
          guard(async () =>
            toTradeOut(
              await p2p.takeOffer({
                offerId: input.offerId,
                takerId: ctx.principal.userId,
                amount: parseAmount(input.amount),
                method: input.method,
              }),
            ),
          ),
        ),

      markFiatSent: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(z.object({ tradeId: z.string().uuid() }))
        .output(tradeOutput)
        .mutation(async ({ ctx, input }) => guard(async () => toTradeOut(await p2p.markFiatSent(input.tradeId, ctx.principal.userId)))),

      /** Seller confirms the fiat landed → `escrowRelease`. */
      confirmReceived: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(z.object({ tradeId: z.string().uuid() }))
        .output(tradeOutput)
        .mutation(async ({ ctx, input }) =>
          guard(async () => toTradeOut(await p2p.confirmFiatReceived(input.tradeId, ctx.principal.userId))),
        ),

      /** Cancel → `escrowRefund`, in full, to the seller. */
      cancel: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(z.object({ tradeId: z.string().uuid(), reason: z.string().max(200).optional() }))
        .output(tradeOutput)
        .mutation(async ({ ctx, input }) =>
          guard(async () => toTradeOut(await p2p.cancelTrade(input.tradeId, ctx.principal.userId, input.reason ?? 'cancelled'))),
        ),

      get: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ tradeId: z.string().uuid() }))
        .output(tradeOutput)
        .query(async ({ input }) => guard(async () => toTradeOut(await p2p.getTrade(input.tradeId)))),

      list: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
        .output(z.array(tradeOutput))
        .query(async ({ ctx, input }) => guard(async () => (await p2p.listTrades(ctx.principal.userId, input?.limit)).map(toTradeOut))),
    }),

    disputes: router({
      open: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(
          z.object({
            tradeId: z.string().uuid(),
            reason: z.string().min(1).max(2000),
            evidence: z.array(z.unknown()).optional(),
          }),
        )
        .output(z.object({ disputeId: z.string().uuid(), tradeId: z.string().uuid(), deadlineAt: z.string() }))
        .mutation(async ({ ctx, input }) =>
          guard(async () => {
            const dispute = await p2p.openDispute({
              tradeId: input.tradeId,
              openedBy: ctx.principal.userId,
              reason: input.reason,
              ...(input.evidence ? { evidence: input.evidence } : {}),
            });
            return { disputeId: dispute.id, tradeId: dispute.tradeId, deadlineAt: dispute.deadlineAt.toISOString() };
          }),
        ),

      get: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ tradeId: z.string().uuid() }))
        .output(
          z.object({
            id: z.string().uuid(),
            tradeId: z.string().uuid(),
            openedBy: z.string(),
            reason: z.string(),
            status: z.enum(['open', 'resolved']),
            moderatorId: z.string().nullable(),
            resolution: z.enum(['release', 'refund']).nullable(),
            deadlineAt: z.string(),
            resolvedAt: z.string().nullable(),
          }),
        )
        .query(async ({ input }) =>
          guard(async () => {
            const d = await p2p.getDispute(input.tradeId);
            return {
              id: d.id,
              tradeId: d.tradeId,
              openedBy: d.openedBy,
              reason: d.reason,
              status: d.status,
              moderatorId: d.moderatorId,
              resolution: d.resolution,
              deadlineAt: d.deadlineAt.toISOString(),
              resolvedAt: d.resolvedAt?.toISOString() ?? null,
            };
          }),
        ),

      /**
       * MODERATOR ONLY. Release to the buyer, or refund the seller. There is no
       * third option in the input schema, because there is no third option in
       * the escrow: §6.2's promise is that every dispute terminates.
       *
       * `admin:compliance`, not `p2p:write` — this moves someone else's escrow.
       */
      resolve: scopedProcedure('admin:compliance', { module: 'p2p' })
        .input(
          z.object({
            tradeId: z.string().uuid(),
            resolution: z.enum(['release', 'refund']),
            notes: z.string().max(2000).optional(),
          }),
        )
        .output(tradeOutput)
        .mutation(async ({ ctx, input }) =>
          guard(async () =>
            toTradeOut(
              await p2p.resolveDispute({
                tradeId: input.tradeId,
                moderatorId: ctx.principal.userId,
                resolution: input.resolution,
                ...(input.notes ? { notes: input.notes } : {}),
              }),
            ),
          ),
        ),
    }),

    reputation: router({
      /**
       * §6.2 → §4.1. The numbers a counterparty sees before they trade with
       * you, and the same numbers that feed the XP graph raising limits
       * everywhere else.
       */
      get: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ userId: z.string().uuid() }))
        .output(reputationOutput)
        .query(async ({ input }) =>
          guard(async () => {
            const r = await p2p.reputationOf(input.userId);
            return {
              tradesTotal: r.tradesTotal,
              completed: r.completed,
              cancelled: r.cancelled,
              disputed: r.disputed,
              disputesLost: r.disputesLost,
              completionRate: r.completionRate,
              avgReleaseSecs: r.avgReleaseSecs,
              badges: [...r.badges],
            };
          }),
        ),
    }),
  });
}

export type P2pRouter = ReturnType<typeof createP2pRouter>;

function toOfferOut(offer: Awaited<ReturnType<P2pService['getOffer']>>): OfferOut {
  return {
    id: offer.id,
    makerId: offer.makerId,
    side: offer.side,
    asset: offer.asset,
    fiatCurrency: offer.fiatCurrency,
    priceType: offer.priceType,
    price: formatAmount(offer.price),
    minAmount: formatAmount(offer.minAmt),
    maxAmount: formatAmount(offer.maxAmt),
    remainingAmount: formatAmount(offer.remainingAmt),
    methods: offer.methods,
    terms: offer.terms,
    status: offer.status,
    createdAt: offer.createdAt.toISOString(),
  };
}

function toTradeOut(trade: Awaited<ReturnType<P2pService['getTrade']>>): TradeOut {
  return {
    id: trade.id,
    offerId: trade.offerId,
    sellerId: trade.sellerId,
    buyerId: trade.buyerId,
    asset: trade.asset,
    amount: formatAmount(trade.amount),
    fiatCurrency: trade.fiatCurrency,
    fiatAmount: formatAmount(trade.fiatAmount),
    price: formatAmount(trade.price),
    method: trade.method,
    status: trade.status,
    resolution: trade.resolution,
    deadlineAt: trade.deadlineAt?.toISOString() ?? null,
    createdAt: trade.createdAt.toISOString(),
    escrowedAt: trade.escrowedAt?.toISOString() ?? null,
    resolvedAt: trade.resolvedAt?.toISOString() ?? null,
    settledAt: trade.settledAt?.toISOString() ?? null,
  };
}
