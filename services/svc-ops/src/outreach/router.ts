import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  router,
  publicProcedure,
  scopedProcedure,
  outreachCaptureInputSchema,
  outreachCaptureReceiptSchema,
  outreachContinuationInputSchema,
  outreachDraftSchema,
  outreachQuestionnaireInputSchema,
  crmListInputSchema,
  crmOpportunitySchema,
  crmOpportunityPageSchema,
  crmAssignmentInputSchema,
  crmStageChangeInputSchema,
  crmNoteInputSchema,
  crmActivitySchema,
  type Context,
} from '@intafaced/contracts';
import type { OutreachCrm } from './crm.js';
import { OutreachError } from './config.js';
import type { FounderAuthority } from './authority.js';

function abuseKey(ctx: Context): string {
  const key = (ctx as Context & { outreachAbuseKey?: string }).outreachAbuseKey;
  if (!key) throw new OutreachError('ops.crm.abuse_context_unavailable');
  return key;
}
async function mapped<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof OutreachError)
      throw new TRPCError({
        code:
          error.code === 'ops.crm.operator_forbidden'
            ? 'FORBIDDEN'
            : error.code === 'ops.crm.rate_limited'
              ? 'TOO_MANY_REQUESTS'
              : 'PRECONDITION_FAILED',
        message: error.code,
        cause: error,
      });
    throw error;
  }
}
export function createOutreachRouter(crm: OutreachCrm, authority: FounderAuthority) {
  const staffRead = scopedProcedure('ops:read').use(async ({ ctx, next }) =>
    mapped(async () => {
      await authority(ctx);
      return next({ ctx });
    }),
  );
  const staffWrite = scopedProcedure('ops:write').use(async ({ ctx, next }) =>
    mapped(async () => {
      await authority(ctx);
      return next({ ctx });
    }),
  );
  return router({
    capture: publicProcedure
      .input(outreachCaptureInputSchema)
      .output(outreachCaptureReceiptSchema)
      .mutation(({ input, ctx }) => mapped(() => crm.capture(input, abuseKey(ctx)))),
    resume: publicProcedure
      .input(outreachContinuationInputSchema)
      .output(outreachDraftSchema)
      .mutation(({ input, ctx }) => mapped(() => crm.resume(input, abuseKey(ctx)))),
    answer: publicProcedure
      .input(outreachQuestionnaireInputSchema)
      .output(outreachDraftSchema)
      .mutation(({ input, ctx }) => mapped(() => crm.answer(input, abuseKey(ctx)))),
    listOpportunities: staffRead
      .input(crmListInputSchema)
      .output(crmOpportunityPageSchema)
      .query(({ input }) => mapped(() => crm.listOpportunities(input))),
    getOpportunity: staffRead
      .input(z.object({ opportunityId: z.string().uuid() }).strict())
      .query(({ input }) => mapped(() => crm.getOpportunity(input))),
    assign: staffWrite
      .input(crmAssignmentInputSchema)
      .output(crmOpportunitySchema)
      .mutation(({ input, ctx }) => mapped(() => crm.assign(input, ctx.principal!.userId))),
    changeStage: staffWrite
      .input(crmStageChangeInputSchema)
      .output(crmOpportunitySchema)
      .mutation(({ input, ctx }) => mapped(() => crm.changeStage(input, ctx.principal!.userId))),
    addNote: staffWrite
      .input(crmNoteInputSchema)
      .output(crmActivitySchema)
      .mutation(({ input, ctx }) => mapped(() => crm.addNote(input, ctx.principal!.userId))),
    owners: staffRead
      .output(z.object({ ownerUserIds: z.array(z.string().uuid()).length(2), initialOwnerUserId: z.string().uuid() }).strict())
      .query(() => mapped(async () => crm.owners())),
    engagement: staffRead
      .output(z.object({ status: z.literal('disabled'), reason: z.literal('api_access_unavailable') }))
      .query(() => ({ status: 'disabled' as const, reason: 'api_access_unavailable' as const })),
  });
}
