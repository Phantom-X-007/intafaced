import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import type { Sql } from 'postgres';
import { disableUser, DisableUserError } from './auth/disable-user.js';
import { ACTION_APPROVAL_MISSING } from './auth/privileged-dual-control.js';
import type { ActionApprovalService } from './auth/action-approval-service.js';

/**
 * Top-level disable (not nested under apiKeys) so mergeRouters cannot
 * replace apiKeys.exchange. Operator names one user. identity:write is not
 * enough — freeze of a named account is admin:compliance.
 * Dual-control: actor is the signed principal; confirmActorId is a second distinct operator.
 */
export function createDisableUserRouter(sql: Sql, approvals: Pick<ActionApprovalService, 'consume'>) {
  return router({
    disableUser: scopedProcedure('admin:compliance')
      .input(
        z.object({
          userId: z.string().uuid(),
          confirmActorId: z.string().uuid().optional(),
          approvalId: z.string().max(128).nullish(),
          operationId: z.string().max(128).nullish(),
        }),
      )
      .output(
        z.object({
          userId: z.string().uuid(),
          status: z.literal('frozen'),
          keysRevoked: z.number().int(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await disableUser(
            sql,
            input.userId,
            {
              actorId: ctx.principal.userId,
              confirmActorId: input.confirmActorId,
              approvalId: input.approvalId,
              operationId: input.operationId,
              targetId: 'identity.disable_user',
            },
            approvals,
          );
        } catch (err) {
          if (err instanceof DisableUserError) {
            if (err.code === 'auth.not_found') {
              throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
            }
            if (err.code === ACTION_APPROVAL_MISSING) {
              throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
            }
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
          }
          throw err;
        }
      }),
  });
}
