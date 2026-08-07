import { z } from 'zod';

/**
 * Support desk contracts (ops.support Stage-1 ticket spine).
 *
 * Tickets: create / list (mine + ops) / get / comment / status.
 * KB list shape lives here; catalog content may be empty or platform spine.
 * No money: refunds are requests only; never ledger.
 */

export const supportTicketStatusSchema = z.enum(['open', 'pending', 'resolved', 'closed']);
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;

export const supportTicketCategorySchema = z.enum(['account', 'trading', 'deposit_withdraw', 'other']);
export type SupportTicketCategory = z.infer<typeof supportTicketCategorySchema>;

export const supportTicketSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  category: supportTicketCategorySchema,
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
  status: supportTicketStatusSchema,
  assigneeId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SupportTicket = z.infer<typeof supportTicketSchema>;

export const supportCommentSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  authorId: z.string().uuid(),
  /** operator | user — operators use support:ops scope */
  authorRole: z.enum(['user', 'operator']),
  body: z.string().min(1).max(10_000),
  createdAt: z.string().datetime(),
});
export type SupportComment = z.infer<typeof supportCommentSchema>;

export const createTicketInputSchema = z.object({
  category: supportTicketCategorySchema,
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
});
export type CreateTicketInput = z.infer<typeof createTicketInputSchema>;

export const supportKbArticleSchema = z.object({
  id: z.string().min(1),
  /** i18n catalog key — never raw third-party product names */
  titleKey: z.string().min(1),
  bodyKey: z.string().min(1),
});
export type SupportKbArticle = z.infer<typeof supportKbArticleSchema>;

export interface SupportContract {
  createTicket(input: { userId: string } & CreateTicketInput): Promise<SupportTicket>;
  listMyTickets(input: { userId: string }): Promise<SupportTicket[]>;
  /** Operator desk queue — all tickets, newest first. */
  listAllTickets(): Promise<SupportTicket[]>;
  getTicket(input: { userId: string; ticketId: string; asOperator?: boolean }): Promise<SupportTicket>;
  comment(input: { userId: string; ticketId: string; body: string; asOperator?: boolean }): Promise<SupportComment>;
  listComments(input: { userId: string; ticketId: string; asOperator?: boolean }): Promise<SupportComment[]>;
  setStatus(input: { operatorId: string; ticketId: string; status: SupportTicketStatus }): Promise<SupportTicket>;
  listKb(): Promise<SupportKbArticle[]>;
}
