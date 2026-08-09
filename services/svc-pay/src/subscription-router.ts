import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { assertMerchantAreaAccess, type MerchantAreaFence } from './merchant-ownership.js';
import { PayError, type PayService } from './payment-service.js';
import type { SubscriptionService } from './subscriptions/subscription-service.js';
import type { Cadence } from './subscriptions/schedule.js';

/**
 * Merchant subscription surface — mandate + subscription create/get/cancel.
 *
 * Invoice runner and capture-watch stay internal (jobs / payment events).
 * This router does not pull on-chain and does not invent dunning.
 * Money paths that open invoices still go through PayService + rails.
 */

const amountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/, 'amount must be an unsigned decimal string')
  .refine((s) => !s.includes('e') && !s.includes('E'), 'scientific notation refused');

const mandateView = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  customerId: z.string(),
  assetId: z.string(),
  amount: amountSchema,
  ceiling: amountSchema.nullable(),
  cadence: z.enum(['daily', 'weekly', 'monthly']),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable(),
  railAdapter: z.string().nullable(),
  railMandateRef: z.string().nullable(),
  status: z.enum(['active', 'cancelled', 'expired']),
  cancelledAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

const subscriptionView = z.object({
  id: z.string().uuid(),
  mandateId: z.string().uuid(),
  merchantId: z.string().uuid(),
  customerId: z.string(),
  nextRunAt: z.string().datetime({ offset: true }),
  status: z.enum(['active', 'paused', 'cancelled', 'completed']),
  cancelledAt: z.string().datetime({ offset: true }).nullable(),
  path: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});

function toMandateOut(m: Awaited<ReturnType<SubscriptionService['getMandate']>>) {
  return {
    id: m.id,
    merchantId: m.merchantId,
    customerId: m.customerId,
    assetId: m.assetId,
    amount: formatAmount(m.amount),
    ceiling: m.ceiling === null ? null : formatAmount(m.ceiling),
    cadence: m.cadence,
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt === null ? null : m.endsAt.toISOString(),
    railAdapter: m.railAdapter,
    railMandateRef: m.railMandateRef,
    status: m.status,
    cancelledAt: m.cancelledAt === null ? null : m.cancelledAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
  };
}

function toSubOut(s: Awaited<ReturnType<SubscriptionService['getSubscription']>>) {
  return {
    id: s.id,
    mandateId: s.mandateId,
    merchantId: s.merchantId,
    customerId: s.customerId,
    nextRunAt: s.nextRunAt.toISOString(),
    status: s.status,
    cancelledAt: s.cancelledAt === null ? null : s.cancelledAt.toISOString(),
    path: s.path,
    createdAt: s.createdAt.toISOString(),
  };
}

function toTrpcError(err: unknown): unknown {
  if (!(err instanceof PayError)) return err;
  const code = (() => {
    switch (err.code) {
      case 'pay.merchant_not_found':
      case 'pay.mandate_not_found':
      case 'pay.subscription_not_found':
        return 'NOT_FOUND' as const;
      case 'pay.merchant_forbidden':
      case 'pay.submerchant_permission_denied':
      case 'pay.merchant_inactive':
        return 'FORBIDDEN' as const;
      case 'pay.mandate_inactive':
      case 'pay.subscription_inactive':
      case 'pay.subscription_reconsent_required':
        return 'CONFLICT' as const;
      default:
        return 'BAD_REQUEST' as const;
    }
  })();
  return new TRPCError({ code, message: `${err.code}: ${err.message}`, cause: err });
}

export function createSubscriptionRouter(subscriptions: SubscriptionService, pay: PayService, trees: MerchantAreaFence | null = null) {
  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw toTrpcError(err);
    }
  };

  const assertPaymentArea = (userId: string | undefined, merchantId: string) =>
    assertMerchantAreaAccess(pay, userId, merchantId, 'payment', trees);

  return router({
    mandate: router({
      /**
       * Store a recurring mandate. Does not charge. Card mandate rail still
       * refuses at fire time (`pay.mandate_rail_absent`); crypto is invoice-and-watch.
       */
      create: scopedProcedure('pay:write', { module: 'pay' })
        .input(
          z.object({
            merchantId: z.string().uuid(),
            customerId: z.string().min(1).max(128),
            assetId: z.string().min(1).max(16),
            amount: amountSchema,
            ceiling: amountSchema.optional(),
            cadence: z.enum(['daily', 'weekly', 'monthly']),
            startsAt: z.string().datetime({ offset: true }),
            endsAt: z.string().datetime({ offset: true }).optional(),
            railAdapter: z.string().min(1).max(64).optional(),
            railMandateRef: z.string().min(1).max(256).optional(),
          }),
        )
        .output(mandateView)
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            await assertPaymentArea(ctx.principal?.userId, input.merchantId);
            const mandate = await subscriptions.createMandate({
              merchantId: input.merchantId,
              customerId: input.customerId,
              assetId: input.assetId,
              amount: parseAmount(input.amount),
              ceiling: input.ceiling === undefined ? null : parseAmount(input.ceiling),
              cadence: input.cadence as Cadence,
              startsAt: new Date(input.startsAt),
              endsAt: input.endsAt === undefined ? null : new Date(input.endsAt),
              railAdapter: input.railAdapter ?? null,
              railMandateRef: input.railMandateRef ?? null,
            });
            return toMandateOut(mandate);
          }),
        ),

      get: scopedProcedure('pay:read', { module: 'pay' })
        .input(z.object({ mandateId: z.string().uuid() }))
        .output(mandateView)
        .query(({ ctx, input }) =>
          wrap(async () => {
            const mandate = await subscriptions.getMandate(input.mandateId);
            await assertPaymentArea(ctx.principal?.userId, mandate.merchantId);
            return toMandateOut(mandate);
          }),
        ),

      /**
       * Immediate mandate cancel (SPEC §4). Cascades to active subscriptions.
       * Does not reverse settled executions.
       */
      cancel: scopedProcedure('pay:write', { module: 'pay' })
        .input(z.object({ mandateId: z.string().uuid() }))
        .output(mandateView)
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            const existing = await subscriptions.getMandate(input.mandateId);
            await assertPaymentArea(ctx.principal?.userId, existing.merchantId);
            const mandate = await subscriptions.cancelMandate(input.mandateId);
            return toMandateOut(mandate);
          }),
        ),
    }),

    subscription: router({
      create: scopedProcedure('pay:write', { module: 'pay' })
        .input(
          z.object({
            mandateId: z.string().uuid(),
            /** Default crypto_invoice — never invents a pull path. */
            path: z.enum(['crypto_invoice', 'card_mandate']).optional(),
          }),
        )
        .output(subscriptionView)
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            const mandate = await subscriptions.getMandate(input.mandateId);
            await assertPaymentArea(ctx.principal?.userId, mandate.merchantId);
            const sub = await subscriptions.createSubscription({
              mandateId: input.mandateId,
              path: input.path,
            });
            return toSubOut(sub);
          }),
        ),

      get: scopedProcedure('pay:read', { module: 'pay' })
        .input(z.object({ subscriptionId: z.string().uuid() }))
        .output(subscriptionView)
        .query(({ ctx, input }) =>
          wrap(async () => {
            const sub = await subscriptions.getSubscription(input.subscriptionId);
            await assertPaymentArea(ctx.principal?.userId, sub.merchantId);
            return toSubOut(sub);
          }),
        ),

      /** Immediate cancel (SPEC §4). Does not reverse settled executions. */
      cancel: scopedProcedure('pay:write', { module: 'pay' })
        .input(z.object({ subscriptionId: z.string().uuid() }))
        .output(subscriptionView)
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            const existing = await subscriptions.getSubscription(input.subscriptionId);
            await assertPaymentArea(ctx.principal?.userId, existing.merchantId);
            const sub = await subscriptions.cancelSubscription(input.subscriptionId);
            return toSubOut(sub);
          }),
        ),
    }),
  });
}

export type SubscriptionRouter = ReturnType<typeof createSubscriptionRouter>;
