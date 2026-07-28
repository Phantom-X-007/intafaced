import { z } from 'zod';
import { router, scopedProcedure, publicProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { PayError, type PayService } from './payment-service.js';
import type { RailRegistry } from './rails/registry.js';

/**
 * svc-pay's internal tRPC surface (§2 — cross-service calls go through
 * packages/contracts).
 *
 * MONEY CROSSES THIS BOUNDARY AS A DECIMAL STRING, always, in both directions.
 * `amountSchema` rejects anything else, including a JSON number, so a caller
 * that has been doing float arithmetic finds out here rather than 18 decimal
 * places later.
 *
 * Every procedure that moves value carries a scope AND the jurisdiction guard
 * (`{ module: 'pay' }`). §22: pay is a custodial Fiat Plane module — value
 * lands in a ledger account we control — so the matrix applies. Lane A
 * (permissionless merchant contracts, §24) is a different service on the
 * Protocol Plane and does not route through here.
 */

const amountSchema = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are unsigned decimal strings with at most 18 decimal places');

const assetIdSchema = z.string().min(1).max(16);

const paymentView = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  profileId: z.string().uuid().nullable(),
  amount: amountSchema,
  assetId: assetIdSchema,
  method: z.string(),
  railAdapter: z.string(),
  railRef: z.string().nullable(),
  status: z.enum(['created', 'authorized', 'captured', 'settled', 'refunded', 'disputed', 'failed']),
  capturedAmount: amountSchema,
  refundedAmount: amountSchema,
  createdAt: z.string().datetime({ offset: true }),
});

const settlementView = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  window: z.string(),
  assetId: assetIdSchema,
  gross: amountSchema,
  fees: amountSchema,
  net: amountSchema,
  payoutMethod: z.string().nullable(),
  payoutRef: z.string().nullable(),
  status: z.enum(['pending', 'posted', 'paid_out', 'failed']),
});

type PaymentViewOut = z.infer<typeof paymentView>;
type SettlementViewOut = z.infer<typeof settlementView>;

/**
 * A merchant may only read its OWN payments and settlements, whatever its
 * scopes say.
 *
 * HOW MERCHANTS RELATE TO USERS. `pay.merchants` carries `user_id` and inserts
 * `ON CONFLICT (user_id) DO NOTHING` (`payment-service.ts`), so today there is
 * exactly one merchant per user and ownership is a single comparison after one
 * lookup. Nothing on a `payments` or `settlements` row names the user, so the
 * lookup is unavoidable: id → merchantId → merchant.userId. When PayFac trees
 * or merchant teams land (§6.1), this function is the one place a membership
 * check replaces the equality.
 *
 * WHY FORBIDDEN AND NOT NOT_FOUND — same call, same reasoning, as svc-bank's
 * `assertSelf`, and deliberately the same across all five procedures fixed
 * together. NOT_FOUND leaks less because it never confirms the id exists, but
 * every id here is a v4 uuid the caller already holds, so the realistic caller
 * is a merchant integration with the wrong id and the realistic cost of lying
 * to them is an engineer's afternoon. The disclosure bought by the lie is one
 * bit about a uuid nobody can enumerate.
 */
async function assertMerchantOwner(pay: PayService, principalUserId: string | undefined, merchantId: string): Promise<void> {
  const merchant = await pay.getMerchant(merchantId);
  if (merchant.userId !== principalUserId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This merchant belongs to another user' });
  }
}

export function createPayRouter(pay: PayService, rails: RailRegistry) {
  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw toTrpcError(err);
    }
  };

  return router({
    health: publicProcedure
      .output(z.object({ ok: z.literal(true), service: z.string(), rails: z.array(z.string()) }))
      .query(() => ({ ok: true as const, service: 'svc-pay', rails: rails.ids() })),

    /** What an operator dashboard renders, and what routing will read (§6.1). */
    railHealth: scopedProcedure('pay:read', { module: 'pay' })
      .output(
        z.array(
          z.object({
            id: z.string(),
            capabilities: z.array(z.enum(['authorize', 'capture', 'refund', 'payout', 'webhook'])),
            usable: z.boolean(),
            healthy: z.boolean(),
            latencyMs: z.number(),
            reason: z.string().optional(),
          }),
        ),
      )
      .query(() =>
        rails.health().map((h) => ({
          id: h.id,
          capabilities: [...h.capabilities],
          usable: h.usable,
          healthy: h.healthy,
          latencyMs: h.latencyMs,
          reason: h.reason,
        })),
      ),

    merchant: router({
      create: scopedProcedure('pay:write', { module: 'pay' })
        .input(
          z.object({
            userId: z.string().uuid(),
            mode: z.enum(['gateway', 'psp', 'payfac']).default('gateway'),
            pricing: z.object({ feeBps: z.number().int().min(0).max(10_000) }),
            settlementPrefs: z.record(z.unknown()).optional(),
          }),
        )
        .output(z.object({ id: z.string().uuid(), userId: z.string().uuid(), mode: z.string(), feeBps: z.number() }))
        .mutation(({ input }) =>
          wrap(async () => {
            const merchant = await pay.createMerchant(input);
            return { id: merchant.id, userId: merchant.userId, mode: merchant.mode, feeBps: merchant.pricing.feeBps ?? 0 };
          }),
        ),

      profile: scopedProcedure('pay:write', { module: 'pay' })
        .input(
          z.object({
            merchantId: z.string().uuid(),
            checkoutConfig: z.record(z.unknown()).optional(),
            feeRouting: z.record(z.unknown()).optional(),
            domains: z.array(z.string()).optional(),
          }),
        )
        .output(z.object({ id: z.string().uuid(), merchantId: z.string().uuid() }))
        .mutation(({ input }) => wrap(() => pay.createProfile(input))),

      /**
       * What we owe this merchant but have not settled, and what they can
       * already spend. Both read from the LEDGER, not from svc-pay's tables —
       * the two are independent on purpose, which is what makes reconciliation
       * meaningful (Doctrine §0.6).
       */
      balances: scopedProcedure('pay:read', { module: 'pay' })
        .input(z.object({ merchantId: z.string().uuid(), assetId: assetIdSchema }))
        .output(z.object({ clearing: amountSchema, available: amountSchema }))
        .query(({ input }) =>
          wrap(async () => ({
            clearing: formatAmount(await pay.clearingBalance(input.merchantId, input.assetId)),
            available: formatAmount(await pay.merchantBalance(input.merchantId, input.assetId)),
          })),
        ),
    }),

    payment: router({
      create: scopedProcedure('pay:write', { module: 'pay' })
        .input(
          z.object({
            merchantId: z.string().uuid(),
            profileId: z.string().uuid().nullish(),
            amount: amountSchema,
            assetId: assetIdSchema,
            method: z.string().min(1),
            railAdapter: z.string().min(1),
            instrument: z.object({ kind: z.string(), token: z.string().optional(), address: z.string().optional() }).optional(),
            customerRef: z.string().optional(),
            metadata: z.record(z.string()).optional(),
          }),
        )
        .output(paymentView)
        .mutation(({ input }) =>
          wrap(async () =>
            toPaymentOut(
              await pay.createPayment({
                ...input,
                profileId: input.profileId ?? null,
                amount: parseAmount(input.amount),
              }),
            ),
          ),
        ),

      authorize: scopedProcedure('pay:write', { module: 'pay' })
        .input(z.object({ paymentId: z.string().uuid() }))
        .output(paymentView)
        .mutation(({ input }) => wrap(async () => toPaymentOut(await pay.authorize(input.paymentId)))),

      capture: scopedProcedure('pay:write', { module: 'pay' })
        .input(z.object({ paymentId: z.string().uuid(), amount: amountSchema.optional() }))
        .output(paymentView)
        .mutation(({ input }) =>
          wrap(async () =>
            toPaymentOut(await pay.capture(input.paymentId, input.amount === undefined ? {} : { amount: parseAmount(input.amount) })),
          ),
        ),

      /** Its own scope. Refunding is not the same authority as taking payment. */
      refund: scopedProcedure('pay:refund', { module: 'pay' })
        .input(z.object({ paymentId: z.string().uuid(), amount: amountSchema, refundId: z.string().optional() }))
        .output(paymentView)
        .mutation(({ input }) =>
          wrap(async () =>
            toPaymentOut(await pay.refund(input.paymentId, parseAmount(input.amount), input.refundId ? { refundId: input.refundId } : {})),
          ),
        ),

      get: scopedProcedure('pay:read', { module: 'pay' })
        .input(z.object({ paymentId: z.string().uuid() }))
        .output(paymentView)
        .query(({ ctx, input }) =>
          wrap(async () => {
            // Fetched, then checked, then returned. The row has to be read to
            // learn which merchant it belongs to — so what the check protects
            // is the RESPONSE, and it must come before the return, not after
            // the caller has the object.
            const payment = await pay.getPayment(input.paymentId);
            await assertMerchantOwner(pay, ctx.principal.userId, payment.merchantId);
            return toPaymentOut(payment);
          }),
        ),

      /** The append-only state history (§6.1). Read-only, by construction. */
      history: scopedProcedure('pay:read', { module: 'pay' })
        .input(z.object({ paymentId: z.string().uuid() }))
        .output(
          z.array(
            z.object({
              id: z.string().uuid(),
              event: z.string(),
              payload: z.record(z.unknown()),
              railEventId: z.string().nullable(),
              ts: z.string().datetime({ offset: true }),
            }),
          ),
        )
        .query(({ ctx, input }) =>
          wrap(async () => {
            // The payment row is read first only to learn its merchant; the
            // event log is never touched for a caller who does not own it.
            // `payment_events` carries instrument metadata, customer refs and
            // rail references, so this is the more sensitive of the two reads.
            const payment = await pay.getPayment(input.paymentId);
            await assertMerchantOwner(pay, ctx.principal.userId, payment.merchantId);
            return (await pay.history(input.paymentId)).map((e) => ({
              id: e.id,
              event: e.event,
              payload: e.payload,
              railEventId: e.railEventId,
              ts: e.ts.toISOString(),
            }));
          }),
        ),
    }),

    settlement: router({
      run: scopedProcedure('pay:write', { module: 'pay' })
        .input(z.object({ merchantId: z.string().uuid(), window: z.string().min(1), assetId: assetIdSchema }))
        .output(settlementView)
        .mutation(({ input }) => wrap(async () => toSettlementOut(await pay.settleWindow(input)))),

      /** Value leaves the book here, so it carries its own scope. */
      payout: scopedProcedure('pay:payout', { module: 'pay' })
        .input(
          z.object({
            settlementId: z.string().uuid(),
            railId: z.string().min(1),
            destination: z.object({ kind: z.string().min(1), ref: z.string().min(1) }),
          }),
        )
        .output(settlementView)
        .mutation(({ input }) => wrap(async () => toSettlementOut(await pay.payoutSettlement(input)))),

      get: scopedProcedure('pay:read', { module: 'pay' })
        .input(z.object({ settlementId: z.string().uuid() }))
        .output(settlementView)
        .query(({ ctx, input }) =>
          wrap(async () => {
            // A settlement names gross, fees and net for a window — another
            // merchant's revenue and the rate we charge them.
            const settlement = await pay.getSettlement(input.settlementId);
            await assertMerchantOwner(pay, ctx.principal.userId, settlement.merchantId);
            return toSettlementOut(settlement);
          }),
        ),
    }),
  });
}

export type PayRouter = ReturnType<typeof createPayRouter>;

function toPaymentOut(view: Awaited<ReturnType<PayService['getPayment']>>): PaymentViewOut {
  return {
    id: view.id,
    merchantId: view.merchantId,
    profileId: view.profileId,
    amount: formatAmount(view.amount),
    assetId: view.assetId,
    method: view.method,
    railAdapter: view.railAdapter,
    railRef: view.railRef,
    status: view.status,
    capturedAmount: formatAmount(view.capturedAmount),
    refundedAmount: formatAmount(view.refundedAmount),
    createdAt: view.createdAt.toISOString(),
  };
}

function toSettlementOut(row: Awaited<ReturnType<PayService['getSettlement']>>): SettlementViewOut {
  return {
    id: row.id,
    merchantId: row.merchantId,
    window: row.window,
    assetId: row.assetId,
    gross: formatAmount(row.gross),
    fees: formatAmount(row.fees),
    net: formatAmount(row.net),
    payoutMethod: row.payoutMethod,
    payoutRef: row.payoutRef,
    status: row.status,
  };
}

/**
 * Map our codes onto tRPC's, so a client can branch on the code rather than
 * parse prose.
 *
 * The distinction that matters: a rail declining is a BAD_REQUEST the merchant
 * can act on, while an over-capture is a CONFLICT their integration has to fix.
 * Collapsing both into INTERNAL_SERVER_ERROR is how a merchant's engineer spends
 * a day guessing.
 */
function toTrpcError(err: unknown): unknown {
  if (!(err instanceof PayError)) return err;

  const code = (() => {
    switch (err.code) {
      case 'pay.merchant_not_found':
      case 'pay.payment_not_found':
      case 'pay.profile_not_found':
      case 'pay.settlement_not_found':
        return 'NOT_FOUND' as const;
      case 'pay.invalid_transition':
      case 'pay.capture_exceeds_authorized':
      case 'pay.refund_exceeds_captured':
      case 'pay.refund_in_flight':
        return 'CONFLICT' as const;
      case 'pay.webhook_invalid':
        return 'UNAUTHORIZED' as const;
      case 'pay.merchant_inactive':
        return 'FORBIDDEN' as const;
      default:
        return 'BAD_REQUEST' as const;
    }
  })();

  return new TRPCError({ code, message: `${err.code}: ${err.message}`, cause: err });
}
