import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router, scopedProcedure } from '@intafaced/contracts';
import { MARKET_OPS_SCOPE, MarketError, type VendorService } from './vendor-service.js';
import type { CommerceService } from './commerce/commerce-service.js';

/**
 * THE VENDOR LIFECYCLE ROUTER — Stage 3 (§8.7, `market.vendors`).
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
 *
 * ── AND WHY STAGE 3's TWO READS CARRY NEITHER ──────────────────────────────
 *
 * `profile` and `listed` are `publicProcedure`: no scope, no jurisdiction guard,
 * and genuinely reachable unauthenticated — svc-edge forwards a request with no
 * token, or with a refused one, as ANONYMOUS rather than rejecting it at the door
 * (`services/svc-edge/src/index.ts` "forwarding anonymous"), so these are the
 * marketplace a visitor sees before they have an account.
 *
 * No scope, because a shopfront nobody can look at is not a shopfront. No
 * `{ module: 'market' }` either: the matrix asks "may this USER apply/list here,
 * at their verification tier", and an anonymous reader is not a user — gating a
 * public page on a KYC tier would refuse everybody who has not signed up, which
 * is the entire audience. Halting the module is still possible and still lands
 * before this code: `/api/market` is in svc-edge `UPSTREAMS`, so the kill-switch
 * closes the door in an `onRequest` hook.
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

/**
 * The public shape. Four fields, and `vendor-service.ts` `PublicVendorProfile`
 * carries the full argument for each omission — no userId, no status, no tier,
 * no slot refs, and nothing whatsoever from the operator event log.
 */
const publicVendorOut = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  description: z.string(),
  createdAt: z.string().datetime(),
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
    if (err.code === 'market.commission_not_configured' || err.code === 'market.subscription_not_built') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
    }
    // Orphan listing / missing slot is a product precondition, not a bad payload.
    if (err.code === 'market.listing_slot_missing' || err.code === 'market.slot_required') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
    }
    if (err.code === 'market.listing_not_found') {
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
    }
    if (err.code === 'market.purchase_conflict' || err.code === 'market.purchase_self' || err.code === 'market.listing_not_owned') {
      throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
    }
    if (err.code === 'market.insufficient_funds') {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  throw err;
}

const listingOut = z.object({
  id: z.string().uuid(),
  vendorId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  offerType: z.enum(['one_time', 'subscription']),
  assetId: z.string(),
  price: z.string(),
  status: z.enum(['active', 'archived']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const purchaseOut = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  buyerId: z.string().uuid(),
  vendorId: z.string().uuid(),
  vendorUserId: z.string().uuid(),
  assetId: z.string(),
  price: z.string(),
  commissionBps: z.number().int(),
  status: z.enum(['pending', 'settled', 'rejected']),
  ledgerTxId: z.string().uuid().nullable(),
  rejectionCode: z.string().nullable(),
  createdAt: z.string().datetime(),
  settledAt: z.string().datetime().nullable(),
});

export function createMarketRouter(vendors: VendorService, commerce?: CommerceService) {
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

    /**
     * One listed vendor's public profile (Stage 3).
     *
     * NOT_FOUND covers every "you cannot see this vendor" — unknown id, never
     * approved, suspended, holds no slot, or has unstaked below the tier that
     * paid for their slots. One answer for all five, so nobody can use this
     * endpoint to work out who was suspended. See `publicProfile`.
     *
     * `market.stake_unavailable` is deliberately NOT flattened into that: it
     * reaches `mapError` and becomes a 500. A 404 would tell a caller this vendor
     * does not exist, which is false, cacheable, and would still be being served
     * long after svc-token came back.
     */
    profile: publicProcedure
      .input(z.object({ vendorId: z.string().uuid() }))
      .output(publicVendorOut)
      .query(async ({ input }) => {
        let profile;
        try {
          profile = await vendors.publicProfile(input.vendorId);
        } catch (err) {
          mapError(err);
        }
        if (!profile) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No listed vendor with that id.' });
        }
        return profile;
      }),

    /**
     * The public directory of listed vendors, in registration order.
     *
     * Registration order and nothing else: ranking and featured placement are the
     * owner's (§8). A page can be shorter than `limit` when a vendor on it has
     * dropped below their tier, and an svc-token outage empties it — nobody
     * appears rather than everybody.
     */
    listed: publicProcedure
      .input(z.object({ limit: z.number().int().positive().max(50).optional() }).optional())
      .output(z.array(publicVendorOut))
      .query(async ({ input }) => {
        try {
          return await vendors.listedVendors({ limit: input?.limit });
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

    // ── market.commerce ──────────────────────────────────────────────────────

    /**
     * Whether this deployment has a house commission rate. Blank config is the
     * refuse-closed default — purchases will not invent a rate.
     */
    commerceProgramme: publicProcedure
      .output(z.object({ commissionBps: z.number().int().nullable(), commissionConfigured: z.boolean() }))
      .query(() => {
        if (!commerce) {
          return { commissionBps: null, commissionConfigured: false };
        }
        return commerce.programme();
      }),

    createListing: scopedProcedure('market:write', { module: 'market' })
      .input(
        z.object({
          title: z.string().min(1).max(120),
          description: z.string().min(1).max(4_000),
          offerType: z.enum(['one_time', 'subscription']),
          assetId: z.string().min(1).max(32),
          /** Decimal string — never a number. */
          price: z.string().min(1).max(64),
        }),
      )
      .output(listingOut)
      .mutation(async ({ ctx, input }) => {
        requireCommerce(commerce);
        try {
          return await commerce.createListing({ userId: ctx.principal!.userId, ...input });
        } catch (err) {
          mapError(err);
        }
      }),

    archiveListing: scopedProcedure('market:write', { module: 'market' })
      .input(z.object({ listingId: z.string().uuid() }))
      .output(listingOut)
      .mutation(async ({ ctx, input }) => {
        requireCommerce(commerce);
        try {
          return await commerce.archiveListing({ userId: ctx.principal!.userId, listingId: input.listingId });
        } catch (err) {
          mapError(err);
        }
      }),

    myListings: scopedProcedure('market:read', { module: 'market' })
      .output(z.array(listingOut))
      .query(async ({ ctx }) => {
        requireCommerce(commerce);
        return commerce.myListings(ctx.principal!.userId);
      }),

    /** Public catalogue — only listings whose vendor is currently listed. */
    listings: publicProcedure
      .input(z.object({ limit: z.number().int().positive().max(50).optional() }).optional())
      .output(z.array(listingOut))
      .query(async ({ input }) => {
        requireCommerce(commerce);
        try {
          return await commerce.publicListings({ limit: input?.limit });
        } catch (err) {
          mapError(err);
        }
      }),

    /**
     * One-time purchase. `purchaseId` is client-supplied so a retry is the same
     * purchase. Blank commission config refuses before any post.
     */
    purchase: scopedProcedure('market:write', { module: 'market' })
      .input(z.object({ listingId: z.string().uuid(), purchaseId: z.string().uuid() }))
      .output(purchaseOut)
      .mutation(async ({ ctx, input }) => {
        requireCommerce(commerce);
        try {
          return await commerce.purchase({
            buyerId: ctx.principal!.userId,
            listingId: input.listingId,
            purchaseId: input.purchaseId,
          });
        } catch (err) {
          mapError(err);
        }
      }),

    myPurchases: scopedProcedure('market:read', { module: 'market' })
      .output(z.array(purchaseOut))
      .query(async ({ ctx }) => {
        requireCommerce(commerce);
        return commerce.purchasesOf(ctx.principal!.userId);
      }),
  });
}

function requireCommerce(commerce: CommerceService | undefined): asserts commerce is CommerceService {
  if (!commerce) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'market.commerce is not wired in this process',
    });
  }
}

export type MarketRouter = ReturnType<typeof createMarketRouter>;
