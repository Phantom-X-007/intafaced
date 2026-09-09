/**
 * Action-bound approval doors. Session proposes/approves; HMAC consumes.
 * A typed-in second name is not accepted on approve.
 */
import {
  actionApprovalApproveInputSchema,
  actionApprovalConsumeInputSchema,
  actionApprovalProposeInputSchema,
  actionApprovalSchema,
  protectedProcedure,
  router,
  serviceProcedure,
  TRPCError,
} from '@intafaced/contracts';
import { AuthError as GuardError, requireMfa } from '@intafaced/auth';
import { ActionApprovalError, type ActionApprovalService } from './auth/action-approval-service.js';

function toTrpc(err: unknown): never {
  if (err instanceof GuardError) {
    throw new TRPCError({
      code: err.code === 'mfa.required' ? 'UNAUTHORIZED' : 'FORBIDDEN',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof ActionApprovalError) {
    const code =
      err.code === 'action_approval.not_found'
        ? 'NOT_FOUND'
        : err.code === 'action_approval.not_requester' || err.code === 'action_approval.service_mismatch'
          ? 'FORBIDDEN'
          : 'PRECONDITION_FAILED';
    throw new TRPCError({ code, message: `${err.message} [${err.code}]`, cause: err });
  }
  throw err;
}

export function createActionApprovalRouter(svc: ActionApprovalService) {
  return router({
    actionApproval: router({
      propose: protectedProcedure
        .input(actionApprovalProposeInputSchema)
        .output(actionApprovalSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await svc.propose(ctx.principal.userId, input);
          } catch (err) {
            toTrpc(err);
          }
        }),

      approve: protectedProcedure
        .input(actionApprovalApproveInputSchema)
        .output(actionApprovalSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            return await svc.approve(ctx.principal.userId, input.approvalId);
          } catch (err) {
            toTrpc(err);
          }
        }),

      reject: protectedProcedure
        .input(actionApprovalApproveInputSchema)
        .output(actionApprovalSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            return await svc.reject(ctx.principal.userId, input.approvalId);
          } catch (err) {
            toTrpc(err);
          }
        }),

      revoke: protectedProcedure
        .input(actionApprovalApproveInputSchema)
        .output(actionApprovalSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await svc.revoke(ctx.principal.userId, input.approvalId);
          } catch (err) {
            toTrpc(err);
          }
        }),

      consume: serviceProcedure
        .input(actionApprovalConsumeInputSchema)
        .output(actionApprovalSchema)
        .mutation(async ({ ctx, input }) => {
          try {
            return await svc.consume(ctx.service as string, input);
          } catch (err) {
            toTrpc(err);
          }
        }),
    }),
  });
}
