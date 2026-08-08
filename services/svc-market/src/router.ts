import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, scopedProcedure } from '@intafaced/contracts';
import { MARKET_OPS_SCOPE, MarketError, type VendorService } from './vendor-service.js';

/**
 * THE VENDOR LIFECYCLE ROUTER — Stage 1 (§8.7, `market.vendors`).
 *
 * ── WHY THE SCHEMAS LIVE HERE AND NOT IN `packages/contracts` ──────────────
 *
 * §15.2 requires a contracts PR first for CROSS-SERVICE work. Stage 1 is not
 * cross-service: nothing calls svc-market and svc-market calls nobody. The first
 * genuine cross-service need is Stage 2's read of `token.stakeOf`, and that is
 * what earns a contracts declaration. svc-academy sets the same precedent — a
 * whole service whose shapes are all local, with no `packages/contracts/src/
 * academy.ts` at all.
 *
 * ── WHICH PROCEDURES CARRY THE JURISDICTION GUARD, AND WHY NOT ALL OF THEM ──
 *
 * `applyAsVendor` and `mine` pass `{ module: 'market' }`, so the JURISDICTION_MATRIX is
 * live rather than decorative: `market` is `OPEN_BASIC`, so applying needs
 * verification tier `basic` and a region that is not blocked.
 *
 * The operator procedures deliberately do NOT. An operator is not the subject of
 * the rule — the matrix asks "may this USER trade/apply/list here, at their
 * verification tier", and gating a vetting queue on it would refuse a desk
 * operator whose own account is tier `none`, or one working from a region the
 * platform does not sell into. Their authority comes from `market:ops`, which is
 * never on a user session (packages/auth WITHHELD_FROM_SESSION).
 */

const vendorStatus = z.enum(['applied', 'approved', 'rejected', 'suspended']);

const vendorOut = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  description: z.string(),
  status: vendorStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const statusEventOut = z.object({
  id: z.string().uuid(),
  /** `bigserial` as a string — an ordering key, never arithmetic. */
  seq: z.string(),
  vendorId: z.string().uuid(),
  fromStatus: vendorStatus,
  toStatus: vendorStatus,
  reason: z.string(),
  actorId: z.string().uuid(),
  actorScope: z.string(),
  createdAt: z.string().datetime(),
});

function mapError(err: unknown): never {
  if (err instanceof MarketError) {
    if (err.code === 'market.vendor_not_found') throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
    if (err.code === 'market.vendor_already_applied') throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
    if (err.code === 'market.vet_operator_required') throw new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  throw err;
}

export function createMarketRouter(vendors: VendorService) {
  return router({
    /**
     * Apply to be a vendor. One application per account; status is not an input.
     *
     * Named `applyAsVendor` rather than `apply` because tRPC reserves `apply` as a
     * router key — a bare `apply` compiles and then throws at router construction.
     */
    applyAsVendor: scopedProcedure('market:write', { module: 'market' })
      .input(z.object({ displayName: z.string().min(1).max(80), description: z.string().min(1).max(2_000) }))
      .output(vendorOut)
      .mutation(async ({ ctx, input }) => {
        try {
          return await vendors.applyAsVendor({ userId: ctx.principal!.userId, ...input });
        } catch (err) {
          mapError(err);
        }
      }),

    /** The caller's own application. Null rather than a 404: "you have not applied" is an answer. */
    mine: scopedProcedure('market:read', { module: 'market' })
      .output(vendorOut.nullable())
      .query(async ({ ctx }) => {
        return vendors.myVendor(ctx.principal!.userId);
      }),

    /** The operator queue. Defaults to undecided applications, oldest first. */
    listApplications: scopedProcedure(MARKET_OPS_SCOPE)
      .input(z.object({ status: vendorStatus.optional(), limit: z.number().int().positive().max(200).optional() }).optional())
      .output(z.array(vendorOut))
      .query(async ({ input }) => {
        return vendors.listApplications({ status: input?.status ?? 'applied', limit: input?.limit });
      }),

    /**
     * Record an operator's decision and apply it.
     *
     * `decision` and `reason` come from the operator. `actorId` and `actorScope`
     * come from the verified principal and the guard above — never from the
     * request body, or the audit row records who the caller said they were.
     */
    vet: scopedProcedure(MARKET_OPS_SCOPE)
      .input(
        z.object({
          vendorId: z.string().uuid(),
          decision: z.enum(['approved', 'rejected', 'suspended']),
          reason: z.string().min(1).max(2_000),
        }),
      )
      .output(z.object({ changed: z.boolean(), vendor: vendorOut, event: statusEventOut.nullable() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await vendors.vet({ ...input, actorId: ctx.principal!.userId, actorScope: MARKET_OPS_SCOPE });
        } catch (err) {
          mapError(err);
        }
      }),

    /** The audit trail for one application, newest first. */
    history: scopedProcedure(MARKET_OPS_SCOPE)
      .input(z.object({ vendorId: z.string().uuid(), limit: z.number().int().positive().max(200).optional() }))
      .output(z.array(statusEventOut))
      .query(async ({ input }) => {
        return vendors.history(input.vendorId, input.limit);
      }),
  });
}

export type MarketRouter = ReturnType<typeof createMarketRouter>;
