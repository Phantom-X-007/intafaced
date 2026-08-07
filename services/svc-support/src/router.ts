import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  createTicketInputSchema,
  publicProcedure,
  router,
  scopedProcedure,
  supportCommentSchema,
  supportKbArticleSchema,
  supportTicketSchema,
  supportTicketStatusSchema,
} from '@intafaced/contracts';
import { SupportError, SupportService, requireSupportOps } from './support-service.js';

function mapError(err: unknown): never {
  if (err instanceof SupportError) {
    if (err.code === 'support.not_found') {
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
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
      .input(z.object({ ticketId: z.string().uuid(), status: supportTicketStatusSchema }))
      .output(supportTicketSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          requireSupportOps(ctx.principal!);
          return await support.setStatus({
            operatorId: ctx.principal!.userId,
            ticketId: input.ticketId,
            status: input.status,
          });
        } catch (err) {
          mapError(err);
        }
      }),

    listKb: publicProcedure.output(z.array(supportKbArticleSchema)).query(async () => {
      return support.listKb();
    }),
  });
}

export type SupportRouter = ReturnType<typeof createSupportRouter>;
