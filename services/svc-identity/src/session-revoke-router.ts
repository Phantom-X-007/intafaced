import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import type { Sql } from 'postgres';
import { revokeNamedSession, RevokeSessionError } from './auth/revoke-session.js';

/**
 * Top-level one-seat revoke (not nested under auth) so mergeRouters cannot
 * replace auth.logout. identity:write. Named userId + sessionId required.
 * Own user only. Already-revoked stay revoked (idempotent false).
 */
export function createSessionRevokeRouter(sql: Sql) {
  return router({
    revokeSession: scopedProcedure('identity:write')
      .input(z.object({ userId: z.string().uuid(), sessionId: z.string().uuid() }))
      .output(
        z.object({
          userId: z.string().uuid(),
          sessionId: z.string().uuid(),
          revoked: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await revokeNamedSession(sql, ctx.principal.userId, input.userId, input.sessionId);
        } catch (err) {
          if (err instanceof RevokeSessionError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
          }
          throw err;
        }
      }),
  });
}
