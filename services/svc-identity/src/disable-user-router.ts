import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import type { Sql } from 'postgres';
import { disableUser, DisableUserError } from './auth/disable-user.js';
import { DUAL_CONTROL_MISSING } from './auth/four-eyes.js';

/**
 * Top-level disable (not nested under apiKeys) so mergeRouters cannot
 * replace apiKeys.exchange. Operator names one user. identity:write is not
 * enough — freeze of a named account is admin:compliance.
 * Dual-control: actor is the signed principal; confirmActorId is a second distinct operator.
 */
export function createDisableUserRouter(sql: Sql) {
  return router({
    disableUser: scopedProcedure('admin:compliance')
      .input(z.object({ userId: z.string().uuid(), confirmActorId: z.string().uuid() }))
      .output(
        z.object({
          userId: z.string().uuid(),
          status: z.literal('frozen'),
          keysRevoked: z.number().int(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await disableUser(sql, input.userId, {
            actorId: ctx.principal.userId,
            confirmActorId: input.confirmActorId,
          });
        } catch (err) {
          if (err instanceof DisableUserError) {
            if (err.code === 'auth.not_found') {
              throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
            }
            if (err.code === DUAL_CONTROL_MISSING) {
              throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
            }
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
          }
          throw err;
        }
      }),
  });
}
