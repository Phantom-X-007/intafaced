import { randomUUID } from 'node:crypto';
import { AuthError, requireScope, type Principal } from '@intafaced/auth';
import type {
  CreateTicketInput,
  SupportComment,
  SupportContract,
  SupportKbArticle,
  SupportTicket,
  SupportTicketStatus,
} from '@intafaced/contracts';
import { listPlatformKb } from './kb-catalog.js';
import { withSupportSpan } from './tracing.js';

export class SupportError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SupportError';
  }
}

/**
 * In-memory support desk (Stage-1).
 * Zero money: no ledger client, no balance fields on tickets.
 */
export class SupportService implements SupportContract {
  private readonly tickets = new Map<string, SupportTicket>();
  private readonly comments = new Map<string, SupportComment[]>();

  async createTicket(input: { userId: string } & CreateTicketInput): Promise<SupportTicket> {
    return withSupportSpan('support.createTicket', { op: 'createTicket' }, async (span) => {
      const now = new Date().toISOString();
      const ticket: SupportTicket = {
        id: randomUUID(),
        userId: input.userId,
        category: input.category,
        subject: input.subject,
        body: input.body,
        status: 'open',
        assigneeId: null,
        createdAt: now,
        updatedAt: now,
      };
      this.tickets.set(ticket.id, ticket);
      this.comments.set(ticket.id, []);
      span.setAttribute('intafaced.support.ticket_id', ticket.id);
      return ticket;
    });
  }

  async listMyTickets(input: { userId: string }): Promise<SupportTicket[]> {
    return withSupportSpan('support.listMyTickets', { op: 'listMyTickets' }, async () =>
      [...this.tickets.values()].filter((t) => t.userId === input.userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async listAllTickets(): Promise<SupportTicket[]> {
    return withSupportSpan('support.listAllTickets', { op: 'listAllTickets' }, async () =>
      [...this.tickets.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async getTicket(input: { userId: string; ticketId: string; asOperator?: boolean }): Promise<SupportTicket> {
    const ticket = this.tickets.get(input.ticketId);
    if (!ticket) throw new SupportError(`ticket ${input.ticketId} not found`, 'support.not_found');
    if (!input.asOperator && ticket.userId !== input.userId) {
      throw new SupportError('ticket not found', 'support.not_found');
    }
    return ticket;
  }

  async comment(input: { userId: string; ticketId: string; body: string; asOperator?: boolean }): Promise<SupportComment> {
    const ticket = await this.getTicket({
      userId: input.userId,
      ticketId: input.ticketId,
      asOperator: input.asOperator,
    });
    const comment: SupportComment = {
      id: randomUUID(),
      ticketId: ticket.id,
      authorId: input.userId,
      authorRole: input.asOperator ? 'operator' : 'user',
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    const list = this.comments.get(ticket.id) ?? [];
    list.push(comment);
    this.comments.set(ticket.id, list);
    const updated = { ...ticket, updatedAt: comment.createdAt };
    this.tickets.set(ticket.id, updated);
    return comment;
  }

  async setStatus(input: { operatorId: string; ticketId: string; status: SupportTicketStatus }): Promise<SupportTicket> {
    const ticket = this.tickets.get(input.ticketId);
    if (!ticket) throw new SupportError(`ticket ${input.ticketId} not found`, 'support.not_found');
    const updated: SupportTicket = {
      ...ticket,
      status: input.status,
      updatedAt: new Date().toISOString(),
    };
    this.tickets.set(ticket.id, updated);
    return updated;
  }

  async listKb(): Promise<SupportKbArticle[]> {
    // Stage-2: platform i18n-keyed spine (TRK-ops.support). No vendor names, no money fields.
    return [...listPlatformKb()];
  }

  listComments(ticketId: string): SupportComment[] {
    return this.comments.get(ticketId) ?? [];
  }
}

export function requireSupportWrite(principal: Principal): void {
  requireScope(principal, 'support:write');
}

export function requireSupportOps(principal: Principal): void {
  try {
    requireScope(principal, 'support:ops');
  } catch {
    throw new AuthError('support:ops required for operator actions', 'scope.denied');
  }
}
