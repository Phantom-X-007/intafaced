import { z } from 'zod';
import { AuthError, requireMfa } from '@intafaced/auth';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { DualControlError, readConfirmOperatorId, requireDualControl } from './dual-control.js';
import { MerchantStateError, MERCHANT_STATUSES, type MerchantStateService } from './merchant-state-service.js';

/**
 * THE ADMIN PATH FOR MERCHANT STATE (§6.1).
 *
 * ── WHY IT IS A SEPARATE ROUTER FILE ───────────────────────────────────────
 *
 * `router.ts` is held by open PR #346. This router is merged into the pay router
 * in `index.ts` with `mergeRouters`, which is a mechanism tRPC provides for
 * exactly this and which keeps one wire surface. When #346 lands, this can be
 * folded into `router.ts` beside `merchant` — or left here, which is arguably
 * better anyway: everything in this file is an OPERATOR surface and everything
 * in `router.ts` under `merchant` is a MERCHANT surface, and the two have
 * different readers and different scopes.
 *
 * ── THE SCOPE, AND THE THREE IT IS NOT ─────────────────────────────────────
 *
 * `admin:write` to change state, `admin:read` to read the history.
 *
 *   NOT `pay:write` — that is a MERCHANT'S scope. A merchant holding it could
 *   then reinstate themselves, which turns the one control that stops a bad
 *   merchant taking money into a control they operate.
 *
 *   NOT `admin:treasury` — that scope exists for moving VALUE (`user-money.credit`
 *   holds it). Suspending a merchant moves nothing; collapsing the two would make
 *   the treasury credential the only way to write an audit row. `admin:write`
 *   already implies `admin:read`, so an operator who can change state can always
 *   read what they changed.
 *
 *   MFA is still required here, locally. `admin:write` is not in
 *   `INTERACTIVE_ONLY_SCOPES` (whose membership test is "does this move value
 *   OFF the platform"), same as `kyc.approve` and edge kill-switch. A leaked
 *   operator session must not suspend or close a merchant on its own. Arguing
 *   the shared list should grow belongs in its own PR (§15.2).
 *
 *   Mutate is dual-control: the signed `admin:write` principal plus a distinct
 *   `confirmOperatorId`. Missing or same-as-operator confirm refuses
 *   (`missing_operator`) — one operator cannot change merchant state. Ledger
 *   freeze already requires the same pair. `history` stays single-operator
 *   (read is not mutate).
 *
 *   NOT `admin:compliance` — that is the KYC/KYB scope, and merchant status is
 *   not KYB status. A merchant can be fully verified and suspended (fraud), or
 *   unverified and active-pending (onboarding). Collapsing the two would make
 *   the compliance queue the only place a commercial suspension could be
 *   recorded.
 *
 * `{ module: 'pay' }` on both, like every other procedure in this service: §22
 * makes pay a custodial Fiat Plane module and the jurisdiction matrix applies to
 * anything that touches a merchant's ability to take money.
 */

const statusSchema = z.enum(MERCHANT_STATUSES as unknown as [string, ...string[]]);

const eventView = z.object({
  id: z.string().uuid(),
  /** A string, not a number — it is a `bigserial` ordering key, never arithmetic. */
  seq: z.string(),
  merchantId: z.string().uuid(),
  fromStatus: statusSchema,
  toStatus: statusSchema,
  reason: z.string(),
  actorId: z.string(),
  actorScope: z.string(),
  createdAt: z.string(),
});

function toTrpcError(err: unknown): unknown {
  if (err instanceof TRPCError) return err;
  if (err instanceof AuthError) {
    return new TRPCError({
      code: err.code === 'mfa.required' ? 'UNAUTHORIZED' : 'FORBIDDEN',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof DualControlError) {
    return new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
  }
  if (err instanceof MerchantStateError) {
    if (err.code === 'pay.merchant_not_found') {
      return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
    }
    if (err.code === 'pay.merchant_state_history_limit_unset') {
      return new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
    }
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  return err;
}

export function createMerchantStateRouter(state: MerchantStateService) {
  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw toTrpcError(err);
    }
  };

  return router({
    merchantState: router({
      /**
       * Set a merchant's status, with a reason that is recorded and required.
       *
       * ONE PROCEDURE, NOT `suspend` AND `reinstate`. Two named verbs would read
       * better and would be a policy: they would decide that suspension and
       * reinstatement are the two transitions that exist, which is a ruling
       * nobody has made about `pending` or `closed`. The target status is a
       * parameter for the same reason `merchant-state-service.ts` has no
       * transition map — recording who, when and why is not deciding when.
       *
       * `actorId` IS NOT AN INPUT. It comes from the authenticated principal, so
       * there is no field on the wire for a caller to record somebody else as
       * the operator. An audit row whose actor can be supplied by the caller is
       * not an audit row.
       *
       * `confirmOperatorId` is the second operator, not a substitute actor. It
       * is required and must be a distinct identity. Pay does not invent a
       * second caller.
       */
      set: scopedProcedure('admin:write', { module: 'pay' })
        .input(
          z.object({
            merchantId: z.string().uuid(),
            to: statusSchema,
            /**
             * Bounded, because this is stored and rendered, and unbounded
             * operator text is how a log becomes a place to paste a stack trace.
             * `min(3)` rather than `min(1)` — a single character satisfies "not
             * blank" and answers nothing.
             */
            reason: z.string().trim().min(3).max(500),
            /**
             * Distinct confirming operator. Dual-control is enforced after parse
             * (`requireDualControl`) so missing/blank/same all refuse
             * `missing_operator` rather than a generic schema dump.
             */
            confirmOperatorId: z.string().max(128).nullish(),
          }),
        )
        .output(
          z.object({
            changed: z.boolean(),
            status: statusSchema,
            event: eventView.nullable(),
            confirmOperatorId: z.string(),
          }),
        )
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            requireMfa(ctx.principal);
            const confirmOperatorId = requireDualControl(ctx.principal.userId, readConfirmOperatorId(input));
            const result = await state.setStatus({
              merchantId: input.merchantId,
              to: input.to as (typeof MERCHANT_STATUSES)[number],
              reason: input.reason,
              actorId: ctx.principal.userId,
              actorScope: 'admin:write',
            });

            return {
              changed: result.changed,
              // Read back rather than echoed. On a no-op there is no event to
              // read a status off, and an operator needs to be told what the
              // merchant actually is now — which on a no-op is what it already
              // was, and is exactly the thing worth confirming.
              status: await state.currentStatus(input.merchantId),
              event: result.event === null ? null : { ...result.event, createdAt: result.event.createdAt.toISOString() },
              confirmOperatorId,
            };
          }),
        ),

      /** Why is this merchant suspended. Newest first. */
      history: scopedProcedure('admin:read', { module: 'pay' })
        .input(
          z.object({
            merchantId: z.string().uuid(),
            /**
             * Page size. Optional so omit reaches `pay.merchant_state_history_limit_unset`.
             * Blank is not 50; pass 50 explicitly.
             */
            limit: z.number().int().min(1).max(200).optional(),
          }),
        )
        .output(z.array(eventView))
        .query(({ input }) =>
          wrap(async () =>
            (await state.history(input.merchantId, input.limit)).map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
          ),
        ),
    }),
  });
}

export type MerchantStateRouter = ReturnType<typeof createMerchantStateRouter>;
