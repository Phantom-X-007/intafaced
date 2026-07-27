import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import {
  blueprintExportSchema,
  blueprintSchema,
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

    mentors: scopedProcedure('blueprint:read', { module: 'blueprint' })
      .output(z.array(mentorMatchSchema))
      .query(async ({ ctx }) => (await blueprint.export({ userId: ctx.principal.userId })).mentorMatches),

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
