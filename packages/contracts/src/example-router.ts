import { z } from 'zod';
import { router, scopedProcedure, publicProcedure } from './trpc.js';
import { BASE_PERKS, getPerksInput, getRankInput, rankPerksSchema, rankStateSchema, principalSummarySchema } from './identity.js';

/**
 * REFERENCE ROUTER (§3 deliverable: "zod-first schema pattern established with
 * one example router").
 *
 * This is the shape svc-identity will implement in Phase 1. It runs today
 * against fixtures so the pattern — input schema, output schema, scope guard,
 * jurisdiction guard — is executable and testable before the service exists.
 *
 * Note what each procedure declares:
 *   .input()  — validated at the boundary, so handlers receive parsed data
 *   .output() — validated on the way out, so a service cannot silently drift
 *               from its published contract
 */
export const exampleIdentityRouter = router({
  health: publicProcedure.output(z.object({ ok: z.literal(true), service: z.string() })).query(() => ({
    ok: true as const,
    service: 'svc-identity',
  })),

  rank: router({
    get: scopedProcedure('identity:read')
      .input(getRankInput)
      .output(rankStateSchema)
      .query(({ input }) => ({
        userId: input.userId,
        rank: 0,
        xp: '0',
        seasonXp: '0',
        nextRankAt: '1000',
        updatedAt: new Date().toISOString(),
      })),

    perks: scopedProcedure('identity:read')
      .input(getPerksInput)
      .output(rankPerksSchema)
      .query(() => BASE_PERKS),
  }),

  me: scopedProcedure('identity:read', { module: 'identity' })
    .output(principalSummarySchema)
    .query(({ ctx }) => ({
      userId: ctx.principal.userId,
      handle: 'sovereign',
      tier: ctx.principal.tier,
      region: ctx.region.length === 2 ? ctx.region : null,
      rank: 0,
      modes: ['trader' as const],
      blueprintId: null,
    })),
});

export type ExampleIdentityRouter = typeof exampleIdentityRouter;
