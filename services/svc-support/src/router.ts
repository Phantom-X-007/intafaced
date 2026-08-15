import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  createTicketInputSchema,
  escalateTicketInputSchema,
  publicProcedure,
  router,
  scopedProcedure,
  supportAccountGroundingSchema,
  supportCaseFileSchema,
  supportCommentSchema,
  supportKbArticleSchema,
  supportTicketEventSchema,
  supportTicketSchema,
  supportTicketStatusSchema,
} from '@intafaced/contracts';
import { SupportError, SupportService, requireSupportOps } from './support-service.js';

const queueEntrySchema = z.object({
  ticketId: z.string().uuid(),
  userId: z.string().uuid(),
  category: z.string().min(1),
  status: supportTicketStatusSchema,
  subject: z.string().min(1),
  score: z.number().finite(),
  ageMs: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  timingKind: z.literal('score_not_promise'),
  sla: z.literal(false),
});

const queueResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), entries: z.array(queueEntrySchema) }),
  z.object({ status: z.literal('empty') }),
]);

function mapError(err: unknown): never {
  if (err instanceof SupportError) {
    if (err.code === 'support.not_found' || err.code === 'support.claim.not_found') {
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
    }
    if (err.code === 'support.claim.already_claimed') {
      throw new TRPCError({ code: 'CONFLICT', message: err.message });
    }
    if (
      err.code === 'support.claim.not_queueable' ||
      err.code === 'support.claim.invalid_operator' ||
      // A lifecycle move that is not available from where the ticket is now,
      // and an escalation that cites nothing, are both "the state you are
      // asking from does not permit this" rather than a malformed request.
      err.code === 'support.transition_illegal' ||
      err.code === 'support.transition_same_status' ||
      err.code === 'support.case_file.ungrounded' ||
      err.code === 'support.case_file.empty_summary' ||
      // Closed is terminal — same family as illegal lifecycle moves.
      err.code === 'support.escalation.terminal' ||
      err.code === 'support.comment.terminal'
    ) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message });
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  throw err;
}

export function createSupportRouter(support: SupportService) {
  return router({
    create: scopedProcedure('support:write')
      .input(createTicketInputSchema)
      .output(supportTicketSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await support.createTicket({ userId: ctx.principal!.userId, ...input });
        } catch (err) {
          mapError(err);
        }
      }),

    listMine: scopedProcedure('support:read')
      .output(z.array(supportTicketSchema))
      .query(async ({ ctx }) => {
        return support.listMyTickets({ userId: ctx.principal!.userId });
      }),

    /** Operator list — Stage-1 desk spine (no UI required). */
    listAll: scopedProcedure('support:ops')
      .output(z.array(supportTicketSchema))
      .query(async ({ ctx }) => {
        requireSupportOps(ctx.principal!);
        return support.listAllTickets();
      }),

    get: scopedProcedure('support:read')
      .input(z.object({ ticketId: z.string().uuid() }))
      .output(supportTicketSchema)
      .query(async ({ ctx, input }) => {
        try {
          const asOperator = ctx.principal!.scopes.includes('support:ops');
          return await support.getTicket({
            userId: ctx.principal!.userId,
            ticketId: input.ticketId,
            asOperator,
          });
        } catch (err) {
          mapError(err);
        }
      }),

    comment: scopedProcedure('support:write')
      .input(z.object({ ticketId: z.string().uuid(), body: z.string().min(1).max(10_000) }))
      .output(supportCommentSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const asOperator = ctx.principal!.scopes.includes('support:ops');
          return await support.comment({
            userId: ctx.principal!.userId,
            ticketId: input.ticketId,
            body: input.body,
            asOperator,
          });
        } catch (err) {
          mapError(err);
        }
      }),

    listComments: scopedProcedure('support:read')
      .input(z.object({ ticketId: z.string().uuid() }))
      .output(z.array(supportCommentSchema))
      .query(async ({ ctx, input }) => {
        try {
          const asOperator = ctx.principal!.scopes.includes('support:ops');
          return await support.listComments({
            userId: ctx.principal!.userId,
            ticketId: input.ticketId,
            asOperator,
          });
        } catch (err) {
          mapError(err);
        }
      }),

    setStatus: scopedProcedure('support:ops')
      .input(
        z.object({
          ticketId: z.string().uuid(),
          status: supportTicketStatusSchema,
          /** Optional short reason, recorded on the trail row. Not required, so
           *  no existing caller breaks; recorded when supplied. */
          note: z.string().min(1).max(500).optional(),
        }),
      )
      .output(supportTicketSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          requireSupportOps(ctx.principal!);
          return await support.setStatus({
            operatorId: ctx.principal!.userId,
            ticketId: input.ticketId,
            status: input.status,
            note: input.note,
          });
        } catch (err) {
          mapError(err);
        }
      }),

    /**
     * The audit trail. `support:read` — the ticket's OWNER can see what
     * happened to their own complaint, which is the point of keeping it.
     * Visibility is decided by the same owner-or-operator rule as `get`.
     */
    events: scopedProcedure('support:read')
      .input(z.object({ ticketId: z.string().uuid() }))
      .output(z.array(supportTicketEventSchema))
      .query(async ({ ctx, input }) => {
        try {
          return await support.listTicketEvents({
            userId: ctx.principal!.userId,
            ticketId: input.ticketId,
            asOperator: ctx.principal!.scopes.includes('support:ops'),
          });
        } catch (err) {
          mapError(err);
        }
      }),

    /**
     * Account state for the ticket's owner, read from svc-identity.
     *
     * NO `userId` INPUT — the id comes off the ticket. `support:ops` plus a
     * free-text user id would be a platform-wide account lookup, which is an
     * authority the scope does not grant.
     */
    accountState: scopedProcedure('support:ops')
      // `.strict()`, unlike every other input on this router, and the reason is
      // this specific procedure. Zod's default is to STRIP unknown keys, so a
      // caller sending `{ ticketId, userId }` would have the userId silently
      // discarded and get the ticket owner's state back instead — the safe
      // answer, returned to a caller who asked a different question and is not
      // told so. Refusing says it out loud, and keeps "there is no way to ask
      // this service about an arbitrary account" a property rather than an
      // accident of zod's defaults.
      .input(z.object({ ticketId: z.string().uuid() }).strict())
      .output(supportAccountGroundingSchema)
      .query(async ({ ctx, input }) => {
        try {
          requireSupportOps(ctx.principal!);
          return await support.readAccountState({
            operatorId: ctx.principal!.userId,
            ticketId: input.ticketId,
          });
        } catch (err) {
          mapError(err);
        }
      }),

    /** Escalate with a case file. Refuses when nothing was read. No money. */
    escalate: scopedProcedure('support:ops')
      .input(escalateTicketInputSchema)
      .output(supportCaseFileSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          requireSupportOps(ctx.principal!);
          return await support.escalate({ operatorId: ctx.principal!.userId, ...input });
        } catch (err) {
          mapError(err);
        }
      }),

    /** The case file an escalation was made against. null = never escalated. */
    caseFile: scopedProcedure('support:ops')
      .input(z.object({ ticketId: z.string().uuid() }))
      .output(supportCaseFileSchema.nullable())
      .query(async ({ ctx, input }) => {
        try {
          requireSupportOps(ctx.principal!);
          return await support.getCaseFile({
            operatorId: ctx.principal!.userId,
            ticketId: input.ticketId,
          });
        } catch (err) {
          mapError(err);
        }
      }),

    listKb: publicProcedure.output(z.array(supportKbArticleSchema)).query(async () => {
      return support.listKb();
    }),

    /** Search platform KB spine (i18n keys). Empty q → full list. */
    searchKb: publicProcedure
      .input(z.object({ q: z.string().max(200).optional() }).optional())
      .output(z.array(supportKbArticleSchema))
      .query(async ({ input }) => {
        return support.searchKb(input?.q ?? '');
      }),

    /** Single KB article by id — null when missing (never invent). */
    getKb: publicProcedure
      .input(z.object({ id: z.string().min(1).max(200) }))
      .output(supportKbArticleSchema.nullable())
      .query(async ({ input }) => {
        return support.getKbArticle(input.id);
      }),

    /** Stage-2 — prioritised operator queue (open/pending only). */
    listQueue: scopedProcedure('support:ops')
      .input(z.object({ limit: z.number().int().positive().max(500).optional() }).optional())
      .output(queueResultSchema)
      .query(async ({ ctx, input }) => {
        requireSupportOps(ctx.principal!);
        const q = await support.listOperatorQueue({ limit: input?.limit });
        if (q.status === 'empty') return q;
        return { status: 'ok' as const, entries: [...q.entries] };
      }),

    /** Stage-2 — peek next queue ticket without claiming. */
    next: scopedProcedure('support:ops')
      .output(queueEntrySchema.nullable())
      .query(async ({ ctx }) => {
        requireSupportOps(ctx.principal!);
        return support.peekNext();
      }),

    /** Stage-2 — exclusive claim; refuse steal. No money. */
    claim: scopedProcedure('support:ops')
      .input(z.object({ ticketId: z.string().uuid() }))
      .output(supportTicketSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          requireSupportOps(ctx.principal!);
          return await support.claimForOperator({
            operatorId: ctx.principal!.userId,
            ticketId: input.ticketId,
          });
        } catch (err) {
          mapError(err);
        }
      }),
  });
}

export type SupportRouter = ReturnType<typeof createSupportRouter>;
