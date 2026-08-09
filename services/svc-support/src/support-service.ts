import { AuthError, requireScope, type Principal } from '@intafaced/auth';
import type {
  CreateTicketInput,
  SupportComment,
  SupportContract,
  SupportKbArticle,
  SupportTicket,
  SupportTicketStatus,
} from '@intafaced/contracts';
import { getKbById, listPlatformKb, searchKb } from './kb-catalog.js';
import { assignNext, buildOperatorQueue, type QueueEntry, type QueueResult } from './operator-queue.js';
import { MemorySupportStore, type SupportStore } from './store.js';
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
 * The single refusal for "you may not see this ticket", whatever the reason.
 *
 * Carries NO ticket id. `mapError` puts `err.message` straight on the wire, so
 * an id echoed back is an id confirmed to exist — and the point of answering a
 * foreign ticket with `not_found` rather than a forbidden is that the caller
 * cannot tell the two apart. One construction site, so they cannot drift again.
 */
function ticketNotFound(): SupportError {
  return new SupportError('ticket not found', 'support.not_found');
}

/**
 * Support desk — tickets + KB + operator queue.
 * Zero money: no ledger client, no balance fields on tickets.
 *
 * Store defaults to memory for tests; production injects PostgresSupportStore
 * so multi-replica claims stay exclusive.
 */
export class SupportService implements SupportContract {
  constructor(private readonly store: SupportStore = new MemorySupportStore()) {}

  async createTicket(input: { userId: string } & CreateTicketInput): Promise<SupportTicket> {
    return withSupportSpan('support.createTicket', { op: 'createTicket' }, async (span) => {
      const ticket = await this.store.createTicket({
        userId: input.userId,
        category: input.category,
        subject: input.subject,
        body: input.body,
      });
      span.setAttribute('intafaced.support.ticket_id', ticket.id);
      return ticket;
    });
  }

  async listMyTickets(input: { userId: string }): Promise<SupportTicket[]> {
    return withSupportSpan('support.listMyTickets', { op: 'listMyTickets' }, async () => this.store.listByUser(input.userId));
  }

  async listAllTickets(): Promise<SupportTicket[]> {
    return withSupportSpan('support.listAllTickets', { op: 'listAllTickets' }, async () => this.store.listAll());
  }

  /**
   * A ticket, for its owner — or for an operator.
   *
   * SOMEBODY ELSE'S TICKET AND NO SUCH TICKET ARE THE SAME ANSWER.
   */
  async getTicket(input: { userId: string; ticketId: string; asOperator?: boolean }): Promise<SupportTicket> {
    const ticket = await this.store.findById(input.ticketId);
    const visible = ticket !== null && (input.asOperator === true || ticket.userId === input.userId);
    if (!visible) throw ticketNotFound();
    return ticket;
  }

  async comment(input: { userId: string; ticketId: string; body: string; asOperator?: boolean }): Promise<SupportComment> {
    await this.getTicket({
      userId: input.userId,
      ticketId: input.ticketId,
      asOperator: input.asOperator,
    });
    return this.store.addComment({
      ticketId: input.ticketId,
      authorId: input.userId,
      authorRole: input.asOperator ? 'operator' : 'user',
      body: input.body,
    });
  }

  async listComments(input: { userId: string; ticketId: string; asOperator?: boolean }): Promise<SupportComment[]> {
    await this.getTicket({
      userId: input.userId,
      ticketId: input.ticketId,
      asOperator: input.asOperator,
    });
    return this.store.listComments(input.ticketId);
  }

  async setStatus(input: { operatorId: string; ticketId: string; status: SupportTicketStatus }): Promise<SupportTicket> {
    const updated = await this.store.setStatus(input.ticketId, input.status);
    if (!updated) throw ticketNotFound();
    return updated;
  }

  async listKb(): Promise<SupportKbArticle[]> {
    return [...listPlatformKb()];
  }

  /** Search platform KB by id/key fragment. Empty query → full spine. */
  async searchKb(query: string): Promise<SupportKbArticle[]> {
    return [...searchKb(query)];
  }

  async getKbArticle(id: string): Promise<SupportKbArticle | null> {
    return getKbById(id);
  }

  /** Stage-2 — prioritised open/pending queue for operators. No money. */
  async listOperatorQueue(options: { limit?: number } = {}): Promise<QueueResult> {
    return withSupportSpan('support.listOperatorQueue', { op: 'listOperatorQueue' }, async () => {
      const tickets = await this.store.listAll();
      return buildOperatorQueue(tickets, { limit: options.limit });
    });
  }

  /** Stage-2 — peek next queue ticket without claiming. */
  async peekNext(): Promise<QueueEntry | null> {
    return withSupportSpan('support.peekNext', { op: 'peekNext' }, async () => {
      const tickets = await this.store.listAll();
      return assignNext(tickets);
    });
  }

  /**
   * Stage-2 — exclusive operator claim via store (atomic on Postgres).
   * Refuse steal / closed tickets. Never invents refund money.
   */
  async claimForOperator(input: { operatorId: string; ticketId: string }): Promise<SupportTicket> {
    return withSupportSpan('support.claimForOperator', { op: 'claimForOperator' }, async (span) => {
      const result = await this.store.claimTicket({
        ticketId: input.ticketId,
        operatorId: input.operatorId,
      });
      if (result.status === 'refuse') {
        throw new SupportError(`claim refused: ${result.reason}`, `support.claim.${result.reason}`);
      }
      span.setAttribute('intafaced.support.ticket_id', result.ticket.id);
      span.setAttribute('intafaced.support.assignee_id', input.operatorId);
      return result.ticket;
    });
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
