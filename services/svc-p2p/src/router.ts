import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { enabledFiat } from '@intafaced/config';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import {
  MAX_EVIDENCE_PER_CALL,
  P2pError,
  PricingError,
  TradeStateError,
  evidenceVisibleTo,
  type DisputeRecord,
  type P2pService,
} from './p2p-service.js';
import { InstrumentError } from './instruments.js';
import type { InstrumentService } from './instrument-service.js';

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

/**
 * ONE PIECE OF EVIDENCE, ON THE WIRE.
 *
 * `item` is `z.unknown()` because it is whatever the party submitted and this
 * service has no business asserting a shape for a screenshot reference or a
 * bank narrative. What it does assert is the envelope: who, when, and in what
 * order — the part a moderator has to be able to trust.
 */
const evidenceOutput = z.object({
  seq: z.number().int(),
  submittedBy: z.string().nullable(),
  submittedAt: z.string().nullable(),
  item: z.unknown(),
});

/**
 * A DISPUTE, ON THE WIRE — the same shape for `.get` and `.list`.
 *
 * `evidence` was the missing field. It was accepted by `disputes.open`, stored
 * in `p2p_disputes.evidence`, carried on `DisputeRecord`, and then never
 * serialised by anything: write-only, so a moderator could not read what they
 * were ruling on. It is here on both reads now.
 */
const disputeOutput = z.object({
  id: z.string().uuid(),
  tradeId: z.string().uuid(),
  openedBy: z.string(),
  reason: z.string(),
  status: z.enum(['open', 'resolved']),
  moderatorId: z.string().nullable(),
  resolution: z.enum(['release', 'refund']).nullable(),
  deadlineAt: z.string(),
  openedAt: z.string(),
  resolvedAt: z.string().nullable(),
  evidence: z.array(evidenceOutput),
  /** True when the SLA has passed. The queue's whole reason to exist. */
  overdue: z.boolean(),
  escalatedAt: z.string().nullable(),
  escalations: z.number().int(),
  /** Null until a moderator has actually been served this row. */
  lastSeenByModeratorAt: z.string().nullable(),
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
  if (err instanceof InstrumentError) {
    switch (err.code) {
      case 'p2p.instrument_not_found':
        // EVERY refusal to disclose lands here, whatever the real reason.
        // "This exists but is not yours" tells a stranger that a trade with
        // that id exists and that its seller has an account on file, which is
        // the first half of the thing they were trying to learn.
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'p2p.instrument_slot_taken':
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
      case 'p2p.take_refused':
        // ONE code, ONE message, for every reason a take could not name a
        // payment destination. `BAD_REQUEST` and not `NOT_FOUND`, because the
        // caller genuinely can fix it — by taking with a method the offer can
        // complete — and because the response must be identical whichever of
        // the reasons applied. See `TAKE_REFUSED_MESSAGE`.
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
      default:
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
  }

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
      case 'p2p.dispute_evidence_rejected':
        // `offer_method_unsupported` is no longer reachable from `trades.take`
        // — that refusal goes through `refuseTake` so it is indistinguishable
        // from "the seller holds no destination". The case stays mapped rather
        // than deleted so a future caller that raises it does not fall through
        // to INTERNAL_SERVER_ERROR.
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

/**
 * A method's field requirements, as the "add a payment method" screen needs
 * them. About METHODS, never about people — the one instrument-adjacent surface
 * a browsing user may read.
 */
const fieldSpecOutput = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  pattern: z.string().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
  /** A hint for the input control. Not an access-control decision. */
  sensitive: z.boolean().optional(),
  help: z.string().optional(),
});

const methodSchemaOutput = z.object({
  methodId: z.string(),
  country: z.string(),
  label: z.string(),
  fields: z.array(fieldSpecOutput),
  enabled: z.boolean(),
});

/**
 * AN INSTRUMENT WITHOUT ITS VALUES. The only shape any list returns.
 *
 * There is deliberately no masked hint, no last-four, no partial anything. A
 * mask is still the data, it rides a path that is not access-logged, and it is
 * one helpful refactor away from being the whole value. The owner tells two
 * destinations apart by the label they chose.
 *
 * `fingerprint` is deliberately absent too: it is a hash of the account
 * details, and a hash handed to a caller is an oracle against which a guessed
 * account number can be checked. It stays server-side, where the audit trail
 * needs it and nobody can query it.
 */
const instrumentHeaderOutput = z.object({
  id: z.string().uuid(),
  methodId: z.string(),
  country: z.string(),
  fiatCurrency: z.string(),
  label: z.string(),
  status: z.enum(['active', 'removed']),
  createdAt: z.string(),
  updatedAt: z.string(),
  removedAt: z.string().nullable(),
});

/** The values. Only ever produced by a call that wrote an access-log row. */
const instrumentDetailsOutput = z.record(z.string(), z.string());

export function createP2pRouter(p2p: P2pService, instruments: InstrumentService) {
  /**
   * The owner's own instruments, mapped for the wire.
   *
   * A named function rather than an inline object literal at each call site,
   * because "which fields does a list return" is exactly the decision that
   * decays when it is written out four times.
   */
  const toHeaderOut = (i: Awaited<ReturnType<InstrumentService['createInstrument']>>) => ({
    id: i.id,
    methodId: i.methodId,
    country: i.country,
    fiatCurrency: i.fiatCurrency,
    label: i.label,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    removedAt: i.removedAt?.toISOString() ?? null,
  });

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
            /**
             * REQUIRED, and `min(1)`. An offer with no declared methods
             * accepts anything, so the only thing that can refuse a take on it
             * is the seller's instrument set — a clean per-method probe of the
             * maker. The service refuses it too; this is the message a client
             * can act on rather than a 400 from deeper down.
             */
            methods: z.array(z.unknown()).min(1),
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
        .query(async ({ ctx, input }) =>
          guard(async () => {
            const trade = await p2p.getTrade(input.tradeId);
            // L2-7: any p2p:read holder could previously read any trade by id.
            if (trade.buyerId !== ctx.principal.userId && trade.sellerId !== ctx.principal.userId) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Trade not found' });
            }
            return toTradeOut(trade);
          }),
        ),

      list: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
        .output(z.array(tradeOutput))
        .query(async ({ ctx, input }) => guard(async () => (await p2p.listTrades(ctx.principal.userId, input?.limit)).map(toTradeOut))),

      /**
       * WHERE TO SEND THE MONEY. The only path to a seller's account details.
       *
       * Deliberately its own procedure rather than a field on `trades.get`.
       * Three things follow from that, and each one is a bug that cannot now
       * happen:
       *
       *   · `trades.get` and `trades.list` cannot leak an instrument, because
       *     they never load one. A routine trade read is not a disclosure.
       *   · every disclosure is an explicit call, so the access log has one
       *     row per intent rather than one row per screen refresh.
       *   · the authorisation for reading account details is written in one
       *     place instead of being a clause inside a trade serialiser.
       *
       * `p2p:read` and not `p2p:write`, because a moderator adjudicating a
       * dispute holds `admin:compliance` + `p2p:read` and never `p2p:write` —
       * the same pairing `disputes.get` above already relies on. The scope is
       * not what protects this; being a party to a live trade is.
       */
      paymentInstrument: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ tradeId: z.string().uuid() }))
        .output(
          z.object({
            tradeId: z.string().uuid(),
            methodId: z.string(),
            country: z.string(),
            fiatCurrency: z.string(),
            label: z.string(),
            details: instrumentDetailsOutput,
            attachedAt: z.string(),
          }),
        )
        .query(async ({ ctx, input }) =>
          guard(async () => {
            const view = await instruments.revealForTrade({
              tradeId: input.tradeId,
              viewerId: ctx.principal.userId,
              isModerator: ctx.principal.scopes.includes('admin:compliance'),
            });
            return {
              tradeId: view.tradeId,
              methodId: view.methodId,
              country: view.country,
              fiatCurrency: view.fiatCurrency,
              label: view.label,
              details: { ...view.details },
              attachedAt: view.attachedAt.toISOString(),
            };
          }),
        ),
    }),

    /**
     * PAYMENT INSTRUMENTS (§6.2 "any payment method").
     *
     * Who can see a seller's account details, stated once:
     *
     *   nobody, except the owner and the counterparty of a trade whose escrow
     *   is currently HELD — plus a moderator, and only while a dispute on that
     *   trade is open. Never on an offer, never to a browsing user, never after
     *   the trade closes. Every one of those reads is logged, including the
     *   owner's own and including the refusals.
     *
     * Nothing in this branch returns a field value except `reveal`, and
     * `reveal` cannot return one without having written an access-log row in
     * the same SQL statement (see `instrument-service.ts`).
     */
    instruments: router({
      methods: router({
        /**
         * The registry — what each method needs, per country.
         *
         * Ships empty. What a payer needs in order to send money differs by
         * method and by country, and it is not this repo's knowledge to invent;
         * an operator registers what a market actually requires and until they
         * do, that market refuses instruments. A seeded guess would be a wrong
         * answer that looks like a right one.
         */
        list: scopedProcedure('p2p:read', { module: 'p2p' })
          .input(z.object({ country: z.string().length(2).optional(), methodId: z.string().max(64).optional() }).optional())
          .output(z.array(methodSchemaOutput))
          .query(async ({ input }) =>
            guard(async () =>
              (
                await instruments.listMethodSchemas({
                  ...(input?.country ? { country: input.country } : {}),
                  ...(input?.methodId ? { methodId: input.methodId } : {}),
                })
              ).map((s) => ({ ...s, fields: [...s.fields] })),
            ),
          ),

        /**
         * OPERATOR ONLY. `admin:compliance`, not `admin:write`.
         *
         * What a market's payment rails require is the same class of content as
         * a sanctions list: it is researched, it is jurisdictional, and getting
         * it wrong produces instruments that look complete and cannot be paid.
         */
        register: scopedProcedure('admin:compliance', { module: 'p2p' })
          .input(
            z.object({
              methodId: z.string().min(1).max(64),
              /** ISO 3166-1 alpha-2, or `*` for "the same everywhere". */
              country: z.string().min(1).max(2),
              label: z.string().min(1).max(120),
              fields: z.array(z.unknown()).min(1),
              enabled: z.boolean().optional(),
            }),
          )
          .output(methodSchemaOutput)
          .mutation(async ({ input }) =>
            guard(async () => {
              const schema = await instruments.registerMethodSchema({
                methodId: input.methodId,
                country: input.country,
                label: input.label,
                fields: input.fields,
                ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
              });
              return { ...schema, fields: [...schema.fields] };
            }),
          ),

        setEnabled: scopedProcedure('admin:compliance', { module: 'p2p' })
          .input(z.object({ methodId: z.string().min(1).max(64), country: z.string().min(1).max(2), enabled: z.boolean() }))
          .output(methodSchemaOutput)
          .mutation(async ({ input }) =>
            guard(async () => {
              const schema = await instruments.setMethodSchemaEnabled(input.methodId, input.country, input.enabled);
              return { ...schema, fields: [...schema.fields] };
            }),
          ),
      }),

      create: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(
          z.object({
            methodId: z.string().min(1).max(64),
            country: z.string().length(2),
            fiatCurrency: z.string().length(3),
            label: z.string().max(120).optional(),
            /** Exactly the fields the method schema declared. An extra key is refused. */
            details: z.record(z.string(), z.string()),
          }),
        )
        .output(instrumentHeaderOutput)
        .mutation(async ({ ctx, input }) =>
          guard(async () =>
            toHeaderOut(
              await instruments.createInstrument({
                ownerId: ctx.principal.userId,
                methodId: input.methodId,
                country: input.country,
                fiatCurrency: input.fiatCurrency,
                ...(input.label === undefined ? {} : { label: input.label }),
                details: input.details,
              }),
            ),
          ),
        ),

      /**
       * Edit. Does NOT reach any trade already holding a snapshot — that is the
       * point of the snapshot, not a limitation of this call.
       */
      update: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(
          z.object({
            instrumentId: z.string().uuid(),
            label: z.string().max(120).optional(),
            details: z.record(z.string(), z.string()).optional(),
          }),
        )
        .output(instrumentHeaderOutput)
        .mutation(async ({ ctx, input }) =>
          guard(async () =>
            toHeaderOut(
              await instruments.updateInstrument({
                instrumentId: input.instrumentId,
                ownerId: ctx.principal.userId,
                ...(input.label === undefined ? {} : { label: input.label }),
                ...(input.details === undefined ? {} : { details: input.details }),
              }),
            ),
          ),
        ),

      /** Removal is a state change. An in-flight trade keeps working. */
      remove: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(z.object({ instrumentId: z.string().uuid() }))
        .output(instrumentHeaderOutput)
        .mutation(async ({ ctx, input }) =>
          guard(async () =>
            toHeaderOut(await instruments.removeInstrument({ instrumentId: input.instrumentId, ownerId: ctx.principal.userId })),
          ),
        ),

      /** The caller's own instruments. Headers only — no field values, ever. */
      list: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ includeRemoved: z.boolean().optional() }).optional())
        .output(z.array(instrumentHeaderOutput))
        .query(async ({ ctx, input }) =>
          guard(async () => (await instruments.listInstruments(ctx.principal.userId, input?.includeRemoved === true)).map(toHeaderOut)),
        ),

      /**
       * The owner reads their own account details — and it is logged like
       * anyone else's read.
       *
       * The owner is not exempt because an account takeover reads exactly like
       * an owner: it holds the session. A log with a hole shaped like "the
       * owner" says nothing about the one attack it most needs to describe.
       *
       * `p2p:write` rather than `p2p:read`: this is the only procedure whose
       * scope IS the whole gate, so making it the stronger one costs nothing
       * and stops a read-only API key dumping a user's stored bank details.
       */
      reveal: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(z.object({ instrumentId: z.string().uuid() }))
        .output(instrumentHeaderOutput.extend({ details: instrumentDetailsOutput }))
        .mutation(async ({ ctx, input }) =>
          guard(async () => {
            const revealed = await instruments.revealOwn({ instrumentId: input.instrumentId, viewerId: ctx.principal.userId });
            return { ...toHeaderOut(revealed), details: { ...revealed.details } };
          }),
        ),

      /**
       * "Who has looked at my account details, and when."
       *
       * Exposed to the owner on purpose. A log only compliance can read is a
       * log the person whose data it is cannot use — and they are the one who
       * knows whether a look was expected.
       */
      accessLog: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional())
        .output(
          z.array(
            z.object({
              id: z.string().uuid(),
              instrumentId: z.string().uuid().nullable(),
              viewerId: z.string(),
              viewerRole: z.enum(['owner', 'counterparty', 'moderator', 'other']),
              tradeId: z.string().uuid().nullable(),
              outcome: z.enum(['revealed', 'denied']),
              denyReason: z.string().nullable(),
              at: z.string(),
            }),
          ),
        )
        .query(async ({ ctx, input }) =>
          guard(async () =>
            (await instruments.accessLogFor(ctx.principal.userId, input?.limit)).map((e) => ({
              id: e.id,
              instrumentId: e.instrumentId,
              viewerId: e.viewerId,
              viewerRole: e.viewerRole,
              tradeId: e.tradeId,
              outcome: e.outcome,
              denyReason: e.denyReason,
              at: e.at.toISOString(),
            })),
          ),
        ),
    }),

    disputes: router({
      open: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(
          z.object({
            tradeId: z.string().uuid(),
            reason: z.string().min(1).max(2000),
            evidence: z.array(z.unknown()).max(MAX_EVIDENCE_PER_CALL).optional(),
          }),
        )
        .output(
          z.object({
            disputeId: z.string().uuid(),
            tradeId: z.string().uuid(),
            deadlineAt: z.string(),
            /**
             * THE DISPOSITION, DISCLOSED BEFORE IT CAN HAPPEN.
             *
             * The ADR asks that a party entering a dispute be told what happens
             * if nobody rules. The honest answer is now short, and it is this
             * literal rather than a configurable string because there is no
             * configuration that could make it say anything else.
             */
            ifNobodyRules: z.literal('escalated_and_held'),
          }),
        )
        .mutation(async ({ ctx, input }) =>
          guard(async () => {
            const dispute = await p2p.openDispute({
              tradeId: input.tradeId,
              openedBy: ctx.principal.userId,
              reason: input.reason,
              ...(input.evidence ? { evidence: input.evidence } : {}),
            });
            return {
              disputeId: dispute.id,
              tradeId: dispute.tradeId,
              deadlineAt: dispute.deadlineAt.toISOString(),
              ifNobodyRules: 'escalated_and_held' as const,
            };
          }),
        ),

      /**
       * ADD EVIDENCE TO AN OPEN DISPUTE. A party, and append-only.
       *
       * There is no edit and no remove, here or anywhere: not a missing feature
       * but the shape of the thing. A dispute record whose earlier entries can
       * change is a record whose last writer decides what was said.
       */
      appendEvidence: scopedProcedure('p2p:write', { module: 'p2p' })
        .input(
          z.object({
            tradeId: z.string().uuid(),
            evidence: z.array(z.unknown()).min(1).max(MAX_EVIDENCE_PER_CALL),
          }),
        )
        .output(z.object({ disputeId: z.string().uuid(), tradeId: z.string().uuid(), evidence: z.array(evidenceOutput) }))
        .mutation(async ({ ctx, input }) =>
          guard(async () => {
            const dispute = await p2p.appendDisputeEvidence({
              tradeId: input.tradeId,
              actorId: ctx.principal.userId,
              evidence: input.evidence,
            });
            // Their own back, so a client can confirm what landed — never the
            // counterparty's, for the reason in `evidenceVisibleTo`.
            return {
              disputeId: dispute.id,
              tradeId: dispute.tradeId,
              evidence: evidenceVisibleTo(dispute, ctx.principal.userId).map(toEvidenceOut),
            };
          }),
        ),

      get: scopedProcedure('p2p:read', { module: 'p2p' })
        .input(z.object({ tradeId: z.string().uuid() }))
        .output(disputeOutput)
        .query(async ({ ctx, input }) =>
          guard(async () => {
            const trade = await p2p.getTrade(input.tradeId);
            const isParty = trade.buyerId === ctx.principal.userId || trade.sellerId === ctx.principal.userId;
            const isModerator = ctx.principal.scopes.includes('admin:compliance');
            if (!isParty && !isModerator) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Dispute not found' });
            }

            // A moderator's read is STAMPED. That stamp is what makes "has a
            // human ever reached this dispute" a question the database can
            // answer; a party reading their own dispute is not evidence of
            // anything about moderation and must not be counted as if it were.
            const d = isModerator
              ? await p2p.getDisputeAsModerator(input.tradeId, ctx.principal.userId)
              : await p2p.getDispute(input.tradeId);

            return toDisputeOut(d, isModerator ? null : ctx.principal.userId);
          }),
        ),

      /**
       * THE MODERATOR QUEUE. Open disputes, most overdue first, paginated.
       *
       * Before this existed a moderator could only call `.get({ tradeId })` and
       * had to already know the id — which meant, in practice, that nobody
       * could reach a dispute at all, and a seven-day timer refunded every one
       * of them without a person ever seeing it.
       *
       * `admin:compliance`, exactly like `resolve`: this reads other people's
       * disputes, including the reasons and evidence they filed against each
       * other.
       */
      list: scopedProcedure('admin:compliance', { module: 'p2p' })
        .input(
          z
            .object({
              status: z.enum(['open', 'resolved']).optional(),
              limit: z.number().int().min(1).max(200).optional(),
              cursor: z.string().max(200).nullable().optional(),
            })
            .optional(),
        )
        .output(z.object({ disputes: z.array(disputeOutput), nextCursor: z.string().nullable() }))
        .query(async ({ ctx, input }) =>
          guard(async () => {
            const page = await p2p.listDisputes({
              moderatorId: ctx.principal.userId,
              ...(input?.status ? { status: input.status } : {}),
              ...(input?.limit ? { limit: input.limit } : {}),
              ...(input?.cursor ? { cursor: input.cursor } : {}),
            });
            // Evidence rides the queue, not just `.get`. A triage list that
            // cannot show what is being alleged sends the moderator on a second
            // round trip for every row, which is how a queue stops being used.
            return { disputes: page.disputes.map((d) => toDisputeOut(d, null)), nextCursor: page.nextCursor };
          }),
        ),

      /**
       * MODERATOR ONLY. Release to the buyer, or refund the seller. There is no
       * third option in the input schema, because there is no third option in
       * the escrow: §6.2's promise is that every dispute terminates.
       *
       * `admin:compliance`, not `p2p:write` — this moves someone else's escrow.
       *
       * It is also the ONLY way a disputed escrow terminates. The timeout sweep
       * escalates and re-arms; the database refuses a terminal write on a
       * disputed trade without an attributed human ruling behind it.
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

function toEvidenceOut(entry: DisputeRecord['evidence'][number]): z.infer<typeof evidenceOutput> {
  return {
    seq: entry.seq,
    submittedBy: entry.submittedBy,
    submittedAt: entry.submittedAt?.toISOString() ?? null,
    item: entry.item,
  };
}

/**
 * `viewerId === null` means a moderator is reading: the whole evidence set.
 *
 * Any other value is a party, and a party sees only what they filed. That is
 * not a serialisation convenience — it is the disclosure decision, made in one
 * place so it cannot be half-made in two. See `evidenceVisibleTo`.
 */
function toDisputeOut(d: DisputeRecord, viewerId: string | null): z.infer<typeof disputeOutput> {
  const evidence = viewerId === null ? d.evidence : evidenceVisibleTo(d, viewerId);
  return {
    id: d.id,
    tradeId: d.tradeId,
    openedBy: d.openedBy,
    reason: d.reason,
    status: d.status,
    moderatorId: d.moderatorId,
    resolution: d.resolution,
    deadlineAt: d.deadlineAt.toISOString(),
    openedAt: d.openedAt.toISOString(),
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
    evidence: evidence.map(toEvidenceOut),
    overdue: d.status === 'open' && d.deadlineAt.getTime() <= Date.now(),
    escalatedAt: d.escalatedAt?.toISOString() ?? null,
    escalations: d.escalations,
    lastSeenByModeratorAt: d.lastSeenByModeratorAt?.toISOString() ?? null,
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
