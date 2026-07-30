import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import {
  blueprintExportSchema,
  blueprintSchema,
  cardInput,
  cardRenderSchema,
  eraseReceiptSchema,
  mentorMatchSchema,
  onboardInput,
  onboardOutput,
} from '@intafaced/contracts';
import { BlueprintError, type BlueprintService } from './blueprint-service.js';

/**
 * svc-blueprint's API (§7.1, §7.2).
 *
 * The contract shape lives in `packages/contracts` — this implements it.
 *
 * ── Authorisation, stated once ──────────────────────────────────────────────
 * Every procedure here operates on `ctx.principal.userId` and **never on a
 * userId from the input**. There is deliberately no "onboard this other person"
 * or "erase that account" path: a Blueprint is the most personal object in the
 * OS and an export endpoint that takes an arbitrary id is a data-exfiltration
 * endpoint with extra steps. Operator access, when it is specced, goes through
 * apps/admin with `admin:compliance` and an audit trail — not through here.
 *
 * `blueprint` is non-custodial and `minTier: 'none'` in the jurisdiction matrix
 * (packages/config), so the guard's job is scope and region, not verification.
 */

function toTrpcError(err: unknown): TRPCError {
  if (!(err instanceof BlueprintError)) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Request failed', cause: err });
  }

  switch (err.code) {
    case 'blueprint.engine_unavailable':
      // 503, not 500: the Neural Engine is a dependency that can be down, and
      // the client should retry rather than treat it as a bug in the request.
      return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'The Neural Engine is unavailable', cause: err });
    case 'blueprint.engine_protocol':
    case 'blueprint.invalid_profile':
      return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'The Neural Engine returned an unusable profile', cause: err });
    case 'blueprint.crew_full':
      return new TRPCError({ code: 'CONFLICT', message: 'That crew is full', cause: err });
    case 'blueprint.crew_not_found':
    case 'blueprint.not_found':
      return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
  }
}

export function createBlueprintRouter(blueprint: BlueprintService) {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-blueprint') }))
      .query(() => ({ ok: true, service: 'svc-blueprint' as const })),

    /**
     * Run the Blueprint session (§7.1).
     *
     * The input carries the session's answers and, optionally, birth data. Both
     * are forwarded to the Neural Engine and then dropped — nothing on this
     * path persists them (§10).
     */
    onboard: scopedProcedure('blueprint:write', { module: 'blueprint' })
      .input(onboardInput.omit({ userId: true }))
      .output(onboardOutput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await blueprint.onboard({ ...input, userId: ctx.principal.userId });
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /** The caller's own Blueprint. */
    me: scopedProcedure('blueprint:read', { module: 'blueprint' })
      .output(blueprintSchema.nullable())
      .query(({ ctx }) => blueprint.get({ userId: ctx.principal.userId })),

    /**
     * The share card (§7.1 "the acquisition artifact", §7.2 exit criterion).
     *
     * `blueprint:read`, and the caller's OWN card — the same rule as everything
     * else on this router. It is tempting to make this public, since the card
     * carries no personal data and exists to be shared: a public `card(userId)`
     * would let a page render anyone's unfurl with no session at all.
     *
     * It is not public, because *whose* card may be seen is what
     * `blueprints.visibility` decides, and that check does not exist yet. A
     * public endpoint shipped ahead of it would make every Blueprint's crew role
     * enumerable by user id — including the ones set to `private` — and walking
     * that back later breaks URLs other people have already embedded.
     * Authenticated and self-only is the reversible direction.
     */
    card: scopedProcedure('blueprint:read', { module: 'blueprint' })
      .input(cardInput)
      .output(cardRenderSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await blueprint.card({ userId: ctx.principal.userId, size: input.size });
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /**
     * The caller's mentor shortlist.
     *
     * Reads the shortlist directly. It used to pluck `mentorMatches` off
     * `export()`, which was merely wasteful until the card joined the export —
     * at which point a shortlist request would compose an SVG and call an
     * external rasterizer, and could stall behind that renderer's timeout.
     */
    mentors: scopedProcedure('blueprint:read', { module: 'blueprint' })
      .output(z.array(mentorMatchSchema))
      .query(({ ctx }) => blueprint.mentors({ userId: ctx.principal.userId })),

    /**
     * §7.2 ownership — portable. Everything this service holds about the
     * caller, as JSON, in one response.
     */
    export: scopedProcedure('blueprint:read', { module: 'blueprint' })
      .output(blueprintExportSchema)
      .query(({ ctx }) => blueprint.export({ userId: ctx.principal.userId })),

    /**
     * §7.2 ownership — deletable. A hard delete that cascades; see the method's
     * comment for what "cascades" is doing.
     *
     * `blueprint:write` and nothing more. It is tempting to gate erasure behind
     * 2FA, but that would mean an account whose second factor is lost can never
     * be erased — turning a user's right to delete into a support ticket.
     */
    erase: scopedProcedure('blueprint:write', { module: 'blueprint' })
      .output(eraseReceiptSchema)
      .mutation(async ({ ctx }) => {
        try {
          return await blueprint.erase({ userId: ctx.principal.userId });
        } catch (err) {
          throw toTrpcError(err);
        }
      }),
  });
}

export type BlueprintRouter = ReturnType<typeof createBlueprintRouter>;
