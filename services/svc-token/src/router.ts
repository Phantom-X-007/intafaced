import { z } from 'zod';
import { router, publicProcedure, scopedProcedure } from '@intafaced/contracts';
import type { TokenService } from './token-service.js';

/**
 * svc-token API surface.
 *
 * Hot path for other services remains GET /internal/stake/:userId (index.ts).
 * This router mounts under /trpc for edge/principal-aware callers.
 */
export function createTokenRouter(token: TokenService) {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-token') }))
      .query(() => ({ ok: true, service: 'svc-token' as const })),

    stakeOf: scopedProcedure('token:read')
      .input(z.object({ userId: z.string().uuid() }))
      .output(z.object({ staked: z.string() }))
      .query(async ({ input }) => {
        const staked = await token.stakeOf(input.userId);
        return { staked: staked.toString() };
      }),

    accessOf: scopedProcedure('token:read')
      .input(z.object({ userId: z.string().uuid() }))
      .output(
        z.object({
          staked: z.string(),
          tier: z.string(),
          feeDiscountBps: z.number().int(),
        }),
      )
      .query(async ({ input }) => {
        const access = await token.accessOf(input.userId);
        return {
          staked: access.staked.toString(),
          tier: String(access.tier),
          feeDiscountBps: access.feeDiscountBps,
        };
      }),
  });
}

export type TokenRouter = ReturnType<typeof createTokenRouter>;
