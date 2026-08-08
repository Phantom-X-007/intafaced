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
import { assignNext, buildOperatorQueue, claimTicket, type QueueEntry, type QueueResult } from './operator-queue.js';
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
 * In-memory support desk (Stage-1 spine + Stage-2 operator queue).
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

  /**
   * A ticket, for its owner — or for an operator.
   *
   * SOMEBODY ELSE'S TICKET AND NO SUCH TICKET ARE THE SAME ANSWER.
   *
   * A foreign ticket is refused as `support.not_found`, not as a forbidden, and
   * that choice is the whole point: a caller who can tell "not yours" apart
   * from "does not exist" can ask about any id and learn whether it is real.
   *
   * The two refusals now come from ONE construction site, because they used to
   * come from two and had drifted by exactly the thing that gives the game
   * away — the missing case interpolated the id (`ticket <uuid> not found`) and
   * the foreign case did not (`ticket not found`). `mapError` in router.ts puts
   * `err.message` straight on the wire, so a caller could diff the two and read
   * the existence of any ticket id off the difference. Same shape as
   * svc-bank's `gateDestination`, which resolves both cases "from one
   * construction site so the two cases cannot drift apart by a byte".
   */
  async getTicket(input: { userId: string; ticketId: string; asOperator?: boolean }): Promise<SupportTicket> {
    const ticket = this.tickets.get(input.ticketId);
    const visible = ticket !== undefined && (input.asOperator === true || ticket.userId === input.userId);
    if (!visible) throw ticketNotFound();
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

  async listComments(input: { userId: string; ticketId: string; asOperator?: boolean }): Promise<SupportComment[]> {
    await this.getTicket({
      userId: input.userId,
      ticketId: input.ticketId,
      asOperator: input.asOperator,
    });
    return [...(this.comments.get(input.ticketId) ?? [])];
  }

  async setStatus(input: { operatorId: string; ticketId: string; status: SupportTicketStatus }): Promise<SupportTicket> {
    const ticket = this.tickets.get(input.ticketId);
    if (!ticket) throw ticketNotFound();
    const updated: SupportTicket = {
      ...ticket,
      status: input.status,
      updatedAt: new Date().toISOString(),
    };
    this.tickets.set(ticket.id, updated);
    return updated;
  }

  async listKb(): Promise<SupportKbArticle[]> {
    // Platform i18n-keyed spine (TRK-ops.support). No vendor names, no money fields.
    return [...listPlatformKb()];
  }

  /** Stage-2 — prioritised open/pending queue for operators. No money. */
  async listOperatorQueue(options: { limit?: number } = {}): Promise<QueueResult> {
    return withSupportSpan('support.listOperatorQueue', { op: 'listOperatorQueue' }, async () =>
      buildOperatorQueue([...this.tickets.values()], { limit: options.limit }),
    );
  }

  /** Stage-2 — peek next queue ticket without claiming. */
  async peekNext(): Promise<QueueEntry | null> {
    return withSupportSpan('support.peekNext', { op: 'peekNext' }, async () => assignNext([...this.tickets.values()]));
  }

  /**
   * Stage-2 — exclusive operator claim. Refuse steal / closed tickets.
   * Persists assignee; never invents refund money.
   */
  async claimForOperator(input: { operatorId: string; ticketId: string }): Promise<SupportTicket> {
    return withSupportSpan('support.claimForOperator', { op: 'claimForOperator' }, async (span) => {
      const result = claimTicket({
        tickets: [...this.tickets.values()],
        ticketId: input.ticketId,
        operatorId: input.operatorId,
      });
      if (result.status === 'refuse') {
        throw new SupportError(`claim refused: ${result.reason}`, `support.claim.${result.reason}`);
      }
      this.tickets.set(result.ticket.id, result.ticket);
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
