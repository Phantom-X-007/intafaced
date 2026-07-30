import { z } from 'zod';
import { router, scopedProcedure, publicProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { PayError, type PayService } from './payment-service.js';
import type { UserMoneyService, WithdrawalRecord } from './user-money-service.js';
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

const depositView = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  assetId: assetIdSchema,
  amount: amountSchema,
  rail: z.string(),
  railRef: z.string(),
  status: z.enum(['pending', 'credited']),
  createdAt: z.string().datetime({ offset: true }),
});

const withdrawalView = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  assetId: assetIdSchema,
  amount: amountSchema,
  rail: z.string(),
  destination: z.object({ kind: z.string(), ref: z.string() }),
  clientRef: z.string(),
  railRef: z.string().nullable(),
  attempts: z.number().int(),
  failureCode: z.string().nullable(),
  status: z.enum(['pending', 'held', 'sent', 'failed']),
  createdAt: z.string().datetime({ offset: true }),
});

type PaymentViewOut = z.infer<typeof paymentView>;
type SettlementViewOut = z.infer<typeof settlementView>;
type WithdrawalViewOut = z.infer<typeof withdrawalView>;

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

export function createPayRouter(pay: PayService, rails: RailRegistry, userMoney: UserMoneyService) {
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

    /** Public payment-link resolve — checkout intent only, no merchant secrets. */
    resolveLink: publicProcedure
      .input(z.object({ token: z.string().min(8).max(200) }))
      .output(
        z.object({
          id: z.string().uuid(),
          merchantId: z.string().uuid(),
          profileId: z.string().uuid().nullable(),
          label: z.string(),
          amount: amountSchema.nullable(),
          currency: z.string().nullable(),
          checkoutConfig: z.record(z.unknown()),
        }),
      )
      .query(({ input }) => wrap(() => pay.resolvePaymentLink(input.token))),

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
      /**
       * Ownership: userId is always the authenticated principal. Body userId
       * was dropped so a caller with pay:write cannot create a merchant under
       * another account (full audit L2-1).
       */
      create: scopedProcedure('pay:write', { module: 'pay' })
        .input(
          z.object({
            mode: z.enum(['gateway', 'psp', 'payfac']).default('gateway'),
            pricing: z.object({ feeBps: z.number().int().min(0).max(10_000) }),
            settlementPrefs: z.record(z.unknown()).optional(),
          }),
        )
        .output(z.object({ id: z.string().uuid(), userId: z.string().uuid(), mode: z.string(), feeBps: z.number() }))
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            const userId = ctx.principal?.userId;
            if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });
            const merchant = await pay.createMerchant({ ...input, userId });
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
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            await assertMerchantOwner(pay, ctx.principal?.userId, input.merchantId);
            return pay.createProfile(input);
          }),
        ),

      /** Hosted checkout pointer — token returned once. */
      createLink: scopedProcedure('pay:write', { module: 'pay' })
        .input(
          z.object({
            merchantId: z.string().uuid(),
            label: z.string().min(1).max(120),
            profileId: z.string().uuid().nullish(),
            amount: amountSchema.optional(),
            currency: assetIdSchema.optional(),
            expiresAt: z.string().datetime({ offset: true }).optional(),
          }),
        )
        .output(
          z.object({
            id: z.string().uuid(),
            token: z.string(),
            prefix: z.string(),
            label: z.string(),
          }),
        )
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            await assertMerchantOwner(pay, ctx.principal?.userId, input.merchantId);
            return pay.createPaymentLink({
              merchantId: input.merchantId,
              label: input.label,
              profileId: input.profileId,
              amount: input.amount === undefined ? undefined : parseAmount(input.amount),
              currency: input.currency,
              expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            });
          }),
        ),

      /**
       * What we owe this merchant but have not settled, and what they can
       * already spend. Both read from the LEDGER, not from svc-pay's tables —
       * the two are independent on purpose, which is what makes reconciliation
       * meaningful (Doctrine §0.6).
       */
      balances: scopedProcedure('pay:read', { module: 'pay' })
        .input(z.object({ merchantId: z.string().uuid(), assetId: assetIdSchema }))
        .output(z.object({ clearing: amountSchema, available: amountSchema }))
        .query(({ ctx, input }) =>
          wrap(async () => {
            await assertMerchantOwner(pay, ctx.principal?.userId, input.merchantId);
            return {
              clearing: formatAmount(await pay.clearingBalance(input.merchantId, input.assetId)),
              available: formatAmount(await pay.merchantBalance(input.merchantId, input.assetId)),
            };
          }),
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
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            await assertMerchantOwner(pay, ctx.principal?.userId, input.merchantId);
            return toPaymentOut(
              await pay.createPayment({
                ...input,
                profileId: input.profileId ?? null,
                amount: parseAmount(input.amount),
              }),
            );
          }),
        ),

      authorize: scopedProcedure('pay:write', { module: 'pay' })
        .input(z.object({ paymentId: z.string().uuid() }))
        .output(paymentView)
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            const payment = await pay.getPayment(input.paymentId);
            await assertMerchantOwner(pay, ctx.principal?.userId, payment.merchantId);
            return toPaymentOut(await pay.authorize(input.paymentId));
          }),
        ),

      capture: scopedProcedure('pay:write', { module: 'pay' })
        .input(z.object({ paymentId: z.string().uuid(), amount: amountSchema.optional() }))
        .output(paymentView)
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            const payment = await pay.getPayment(input.paymentId);
            await assertMerchantOwner(pay, ctx.principal?.userId, payment.merchantId);
            return toPaymentOut(
              await pay.capture(input.paymentId, input.amount === undefined ? {} : { amount: parseAmount(input.amount) }),
            );
          }),
        ),

      /** Its own scope. Refunding is not the same authority as taking payment. */
      refund: scopedProcedure('pay:refund', { module: 'pay' })
        .input(z.object({ paymentId: z.string().uuid(), amount: amountSchema, refundId: z.string().optional() }))
        .output(paymentView)
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            const payment = await pay.getPayment(input.paymentId);
            await assertMerchantOwner(pay, ctx.principal?.userId, payment.merchantId);
            return toPaymentOut(
              await pay.refund(input.paymentId, parseAmount(input.amount), input.refundId ? { refundId: input.refundId } : {}),
            );
          }),
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
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            await assertMerchantOwner(pay, ctx.principal?.userId, input.merchantId);
            return toSettlementOut(await pay.settleWindow(input));
          }),
        ),

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
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            const settlement = await pay.getSettlement(input.settlementId);
            await assertMerchantOwner(pay, ctx.principal?.userId, settlement.merchantId);
            return toSettlementOut(await pay.payoutSettlement(input));
          }),
        ),

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

    /**
     * A USER'S OWN BALANCE ENTERING THE BOOK (§4.2 `deposit`).
     *
     * OPERATOR-CREDENTIALED, and that is the single most important thing about
     * this router. Everything else here is a merchant surface; this one credits
     * a user's spendable balance, and a user who can call it does not need to
     * deposit at all.
     */
    deposit: router({
      /**
       * `admin:treasury`. WHY THAT SCOPE AND NOT ANOTHER.
       *
       * The test in `INTERACTIVE_ONLY_SCOPES` is "does this move value across
       * the platform boundary", and crediting a user from a rail boundary is
       * exactly that — inbound instead of outbound, but the same seam and the
       * same account. `admin:treasury` is already on that list, so this endpoint
       * inherits both halves of the protection for free: a long-lived API key
       * may never hold it (`assertKeyScopesAllowed`), and a session without a
       * second factor may not exercise it (`requireScope`).
       *
       * The alternatives were all worse. `pay:write` is a MERCHANT scope that
       * ordinary integrations hold — it would let any merchant credit any user.
       * `admin:write` is broad, and not interactive-only, so a leaked operator
       * key could mint balances unattended. A new `ledger:credit` scope would be
       * a shared-package change (§15.2) to say something `admin:treasury`
       * already says.
       *
       * NO `{ module: 'pay' }` GUARD, deliberately. The jurisdiction matrix
       * judges THE USER BEING SERVED, and the principal here is an operator who
       * is not the beneficiary — running `checkAccess` against the operator's own
       * tier and region would be a check that measures the wrong person and
       * passes or fails for reasons that have nothing to do with the deposit.
       *
       * AND THE BENEFICIARY IS NOT TIER-GATED EITHER. Money that has already
       * arrived at a rail must always be bookable. Refusing to credit an
       * unverified user does not undo their payment; it strands it at the
       * boundary, which is the worst outcome in custody. The gate belongs on
       * what a balance can DO — `orders.create` needs `basic`, and the
       * withdrawal below is gated — not on being allowed to receive one.
       */
      credit: scopedProcedure('admin:treasury')
        .input(
          z.object({
            userId: z.string().uuid(),
            assetId: assetIdSchema,
            amount: amountSchema,
            railId: z.string().min(1),
            /** The rail's own reference. Half the business key, so it is required. */
            railRef: z.string().min(1).max(200),
          }),
        )
        .output(depositView)
        .mutation(({ ctx, input }) =>
          wrap(async () =>
            toDepositOut(
              await userMoney.credit({
                userId: input.userId,
                assetId: input.assetId,
                amount: parseAmount(input.amount),
                rail: input.railId,
                railRef: input.railRef,
                // Taken from the token, never from the body. An operator cannot
                // credit a balance and name somebody else as having done it.
                creditedBy: ctx.principal.userId,
              }),
            ),
          ),
        ),
    }),

    /**
     * A USER'S OWN BALANCE LEAVING THE BOOK (§4.2 `withdraw`).
     *
     * WHY THIS IS NOT IN svc-trade. `services/svc-trade/src/router.ts` says
     * `trade:withdraw` "appears nowhere here, deliberately: it is an
     * INTERACTIVE_ONLY scope that no API key may hold, which is what protects a
     * leaked bot key from moving value off the platform". That reasoning is
     * about the SURFACE, not the scope's home: svc-trade is the exchange API
     * that bots hit with long-lived keys, and putting an interactive-only action
     * on it invites exactly the confusion the comment guards against. It is
     * respected here rather than worked around — the withdrawal lives where the
     * rails live, and svc-trade stays a pure exchange API.
     */
    withdrawal: router({
      /**
       * `trade:withdraw`, which is in `INTERACTIVE_ONLY_SCOPES`. Two
       * consequences, both load-bearing and both tested: no API key may hold it,
       * and `requireScope` refuses a session that has not passed 2FA. A normal
       * session does not carry it at all — `auth.stepUp` in svc-identity is what
       * mints a five-minute token that does.
       *
       * `{ module: 'ledger' }`, not `{ module: 'pay' }`. The matrix rule that
       * governs a user moving their own custodial balance is the rule for the
       * module that HOLDS that balance, and the ledger holds it (`ledger` is
       * `custodial: true`, `OPEN_BASIC`). `pay`'s `full` tier governs merchant
       * acquiring — taking card money from third parties — which is a different
       * risk and a different subject. Gating a withdrawal above the tier that
       * admitted the value would build a one-way door: a user verified enough to
       * deposit and trade would not be verified enough to leave.
       */
      create: scopedProcedure('trade:withdraw', { module: 'ledger' })
        .input(
          z.object({
            assetId: assetIdSchema,
            amount: amountSchema,
            railId: z.string().min(1),
            destination: z.object({ kind: z.string().min(1), ref: z.string().min(1) }),
            /**
             * REQUIRED, not optional. A timed-out request that is retried
             * without one opens a second withdrawal, and a second withdrawal is
             * a second debit. `clientOrderId` is merely recommended on an order
             * because the worst case there is a duplicate order the user can
             * cancel; there is no cancelling a payout.
             */
            clientRef: z.string().min(1).max(64),
          }),
        )
        .output(withdrawalView)
        .mutation(({ ctx, input }) =>
          wrap(async () =>
            toWithdrawalOut(
              await userMoney.withdraw({
                // From the token. There is no `userId` input, so there is no way
                // to withdraw from an account that is not the caller's — an
                // input the caller cannot supply cannot be forged.
                userId: ctx.principal.userId,
                assetId: input.assetId,
                amount: parseAmount(input.amount),
                rail: input.railId,
                destination: input.destination,
                clientRef: input.clientRef,
              }),
            ),
          ),
        ),

      /**
       * `trade:read`, not `trade:withdraw`: checking whether a withdrawal landed
       * is something a user should be able to do from an ordinary session, long
       * after their five-minute elevation has expired.
       */
      get: scopedProcedure('trade:read')
        .input(z.object({ withdrawalId: z.string().uuid() }))
        .output(withdrawalView)
        .query(({ ctx, input }) =>
          wrap(async () => {
            // Fetched, then checked, then returned. The row has to be read to
            // learn whose it is, so what the check protects is the RESPONSE —
            // and a withdrawal names an amount and a destination account.
            const withdrawal = await userMoney.getWithdrawal(input.withdrawalId);
            if (withdrawal.userId !== ctx.principal.userId) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'This withdrawal belongs to another account' });
            }
            return toWithdrawalOut(withdrawal);
          }),
        ),

      mine: scopedProcedure('trade:read')
        .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
        .output(z.array(withdrawalView))
        .query(({ ctx, input }) =>
          wrap(async () => (await userMoney.listWithdrawals(ctx.principal.userId, input?.limit ?? 50)).map(toWithdrawalOut)),
        ),

      /**
       * What the caller can actually withdraw, read from the LEDGER.
       *
       * `ledger:read` because that is whose number it is. Not summed from
       * svc-pay's tables: the ledger is the balance (Doctrine §0.6), and a
       * second answer computed here would be the one users saw and the wrong one.
       */
      balance: scopedProcedure('ledger:read')
        .input(z.object({ assetId: assetIdSchema }))
        .output(z.object({ available: amountSchema }))
        .query(({ ctx, input }) =>
          wrap(async () => ({ available: formatAmount(await userMoney.availableBalance(ctx.principal.userId, input.assetId)) })),
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

function toDepositOut(row: Awaited<ReturnType<UserMoneyService['credit']>>) {
  return {
    id: row.id,
    userId: row.userId,
    assetId: row.assetId,
    amount: formatAmount(row.amount),
    rail: row.rail,
    railRef: row.railRef,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * `creditedBy` is absent from the wire shape on purpose: which operator credited
 * a balance is an internal audit fact, and naming them to the beneficiary serves
 * nobody. Same reasoning as `reviewedBy` on a KYC record.
 */
function toWithdrawalOut(row: WithdrawalRecord): WithdrawalViewOut {
  return {
    id: row.id,
    userId: row.userId,
    assetId: row.assetId,
    amount: formatAmount(row.amount),
    rail: row.rail,
    destination: row.destination,
    clientRef: row.clientRef,
    railRef: row.railRef,
    attempts: row.attempts,
    failureCode: row.failureCode,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
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
      case 'pay.link_not_found':
      case 'pay.settlement_not_found':
        return 'NOT_FOUND' as const;
      case 'pay.link_expired':
        return 'BAD_REQUEST' as const;
      case 'pay.invalid_transition':
      case 'pay.capture_exceeds_authorized':
      case 'pay.refund_exceeds_captured':
      case 'pay.refund_in_flight':
        return 'CONFLICT' as const;
      case 'pay.withdrawal_not_found':
        return 'NOT_FOUND' as const;
      case 'pay.deposit_conflict':
      case 'pay.withdrawal_conflict':
        // CONFLICT, never BAD_REQUEST. The caller reused a business key for
        // different numbers; retrying repeats it. Nothing they can resend fixes
        // this, and telling them to try again is how a deposit gets credited
        // under one reference and reported as another.
        return 'CONFLICT' as const;
      case 'pay.webhook_invalid':
        return 'UNAUTHORIZED' as const;
      case 'pay.merchant_inactive':
      case 'pay.rail_not_creditable':
        return 'FORBIDDEN' as const;
      default:
        return 'BAD_REQUEST' as const;
    }
  })();

  return new TRPCError({ code, message: `${err.code}: ${err.message}`, cause: err });
}
