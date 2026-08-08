import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, scopedProcedure } from '@intafaced/contracts';
import { MARKET_OPS_SCOPE, MarketError, type VendorService } from './vendor-service.js';

/**
 * THE VENDOR LIFECYCLE ROUTER — Stage 2 (§8.7, `market.vendors`).
 *
 * ── WHY THE SCHEMAS STILL LIVE HERE AND NOT IN `packages/contracts` ────────
 *
 * §15.2 requires a contracts PR first for CROSS-SERVICE work, and Stage 1's
 * comment here predicted that Stage 2's stake read would earn one. On building
 * it, that turned out to be wrong, and the correction is worth writing down.
 *
 * The stake read is an outbound `fetch` to an HTTP endpoint svc-token ALREADY
 * publishes (`/internal/stake/:userId`), authenticated with the shared service
 * credential. It declares no new inter-service shape: nothing about svc-token
 * changes, and no other service needs to know svc-market calls it. The two
 * existing consumers of that exact endpoint — `svc-academy/src/stake-source.ts`
 * and `svc-trade/src/otc/stake-source.ts` — both do it the same way, and neither
 * has a contracts module. A contracts declaration is owed when a SHAPE crosses
 * the boundary and both sides must agree on it; a client for somebody else's
 * published endpoint is not that.
 *
 * Every shape below is still consumed only by svc-market's own clients through
 * the edge.
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

/** No amount, no capacity, no tier — a slot row records only that it was taken. */
const slotOut = z.object({
  id: z.string().uuid(),
  vendorId: z.string().uuid(),
  ref: z.string(),
  claimedAt: z.string().datetime(),
  releasedAt: z.string().datetime().nullable(),
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

/**
 * Error codes are preserved, not flattened.
 *
 * `market.stake_required` (stake at all) and `market.slots_exhausted` (release
 * one, or stake for a higher tier) are both "you cannot take a slot", and a
 * client that cannot tell them apart cannot tell the vendor what to do next.
 */
function mapError(err: unknown): never {
  if (err instanceof MarketError) {
    if (err.code === 'market.vendor_not_found') throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
    if (err.code === 'market.vendor_already_applied') throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
    if (err.code === 'market.vet_operator_required') throw new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    if (err.code === 'market.stake_required' || err.code === 'market.vendor_not_approved') {
      throw new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    }
    // CONFLICT rather than FORBIDDEN: the vendor IS entitled, the capacity is
    // simply taken. Retrying after a release is correct client behaviour and a
    // 403 would tell them not to.
    if (err.code === 'market.slots_exhausted') throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
    if (err.code === 'market.stake_unavailable') {
      // OUR infrastructure, not the caller's request, and the distinction
      // matters to a client: a 403 sends somebody off to go and stake, and
      // telling them that because svc-token was unreachable sends them to do
      // something they have already done. A 500 says "try again". Same mapping,
      // and the same reasoning, as `academy.stake_unavailable`.
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
    }
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

    /**
     * Take a listing slot, if the caller's stake tier has one free.
     *
     * `ref` names what the slot is for and makes a retry idempotent — a dropped
     * connection must not consume a second slot for the same listing. Stage 3
     * passes a listing id.
     *
     * The applicant is always the PRINCIPAL: there is no vendorId input, because
     * a slot claim that named its own vendor would let anyone spend somebody
     * else's capacity.
     */
    claimSlot: scopedProcedure('market:write', { module: 'market' })
      .input(z.object({ ref: z.string().min(1).max(200) }))
      .output(z.object({ claimed: z.boolean(), slot: slotOut }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await vendors.claimSlot({ userId: ctx.principal!.userId, ref: input.ref });
        } catch (err) {
          mapError(err);
        }
      }),

    /** Give a slot back. `released: false` when it was not held — not a 404. */
    releaseSlot: scopedProcedure('market:write', { module: 'market' })
      .input(z.object({ ref: z.string().min(1).max(200) }))
      .output(z.object({ released: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await vendors.releaseSlot({ userId: ctx.principal!.userId, ref: input.ref });
        } catch (err) {
          mapError(err);
        }
      }),

    /**
     * The caller's slot position, with capacity re-read from svc-token.
     *
     * `usable` rather than `held` is the number that answers "may this vendor
     * present as listed" — see `slot-access.ts`. A vendor who has unstaked reads
     * `usable: 0` here immediately, which is what makes DoD clause 5 hold
     * without svc-market subscribing to an unstake event that does not exist.
     */
    slots: scopedProcedure('market:read', { module: 'market' })
      .output(
        z.object({
          vendorId: z.string().uuid(),
          status: vendorStatus,
          tier: z.string(),
          capacity: z.number().int().nonnegative(),
          held: z.number().int().nonnegative(),
          usable: z.number().int().nonnegative(),
          slots: z.array(slotOut),
        }),
      )
      .query(async ({ ctx }) => {
        try {
          return await vendors.slotStatus(ctx.principal!.userId);
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
