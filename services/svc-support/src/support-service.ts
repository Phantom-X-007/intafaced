import { AuthError, requireScope, type Principal } from '@intafaced/auth';
import type {
  CreateTicketInput,
  EscalateTicketInput,
  SupportAccountGrounding,
  SupportCaseFile,
  SupportCitation,
  SupportComment,
  SupportContract,
  SupportKbArticle,
  SupportTicket,
  SupportTicketEvent,
  SupportTicketStatus,
} from '@intafaced/contracts';
import { DarkAccountState, type AccountStateSource } from './account-state.js';
import { buildCaseFile, citeAccountState, citeComment, citeKbArticle, groundingFor } from './case-file.js';
import { getKbById, listPlatformKb, searchKb } from './kb-catalog.js';
import { isTerminal } from './lifecycle.js';
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
  constructor(
    private readonly store: SupportStore = new MemorySupportStore(),
    /**
     * Where account state is READ from. Defaults dark, so a service booted
     * without svc-identity reports "not read" rather than nothing at all.
     */
    private readonly accounts: AccountStateSource = new DarkAccountState(),
  ) {}

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
    return withSupportSpan('support.getTicket', { op: 'getTicket', ticketId: input.ticketId }, async () => {
      const ticket = await this.store.findById(input.ticketId);
      const visible = ticket !== null && (input.asOperator === true || ticket.userId === input.userId);
      if (!visible) throw ticketNotFound();
      return ticket;
    });
  }

  /**
   * Add a comment. Visibility is the same as `getTicket`.
   *
   * A USER reply on `resolved` reopens the same ticket (`resolved → open`) and
   * clears the assignee so the row returns to the shared queue — that is the
   * lifecycle edge already named "a user saying not fixed". An operator note
   * on `resolved` does not reopen (they are not the user).
   *
   * A user comment on `closed` is refused (`support.comment.terminal`). Closed
   * is finished; storing a reply nobody will queue is a ghost. Operators may
   * still annotate a closed ticket.
   */
  async comment(input: { userId: string; ticketId: string; body: string; asOperator?: boolean }): Promise<SupportComment> {
    return withSupportSpan('support.comment', { op: 'comment', ticketId: input.ticketId }, async () => {
      await this.getTicket({
        userId: input.userId,
        ticketId: input.ticketId,
        asOperator: input.asOperator,
      });
      const result = await this.store.addComment({
        ticketId: input.ticketId,
        authorId: input.userId,
        authorRole: input.asOperator ? 'operator' : 'user',
        body: input.body,
      });
      if (result.status === 'refuse') {
        if (result.reason === 'not_found') throw ticketNotFound();
        throw new SupportError('comment refused: ticket is terminal', 'support.comment.terminal');
      }
      return result.comment;
    });
  }

  async listComments(input: { userId: string; ticketId: string; asOperator?: boolean }): Promise<SupportComment[]> {
    return withSupportSpan('support.listComments', { op: 'listComments', ticketId: input.ticketId }, async () => {
      await this.getTicket({
        userId: input.userId,
        ticketId: input.ticketId,
        asOperator: input.asOperator,
      });
      return this.store.listComments(input.ticketId);
    });
  }

  /**
   * Move a ticket through its lifecycle, recording who moved it and from what.
   *
   * Three refusals where there used to be one:
   *
   *   · `support.not_found` — no such ticket. Unchanged.
   *   · `support.transition_illegal` — `closed` is terminal, so a finished
   *     complaint cannot be silently re-opened. `resolved → open` IS legal;
   *     that is the reopen path and it is recorded like anything else.
   *   · `support.transition_same_status` — resolving an already-resolved ticket
   *     is refused rather than writing a trail row that records no change. A
   *     history of `open → open` is a history nobody reads.
   */
  async setStatus(input: { operatorId: string; ticketId: string; status: SupportTicketStatus; note?: string }): Promise<SupportTicket> {
    return withSupportSpan('support.setStatus', { op: 'setStatus', ticketId: input.ticketId }, async (span) => {
      const result = await this.store.setStatus({
        ticketId: input.ticketId,
        status: input.status,
        operatorId: input.operatorId,
        note: input.note ?? null,
      });
      if (result.status === 'refuse') {
        if (result.reason === 'not_found') throw ticketNotFound();
        throw new SupportError(
          `status change refused: ${result.reason}`,
          `support.transition_${result.reason === 'same_status' ? 'same_status' : 'illegal'}`,
        );
      }
      span.setAttribute('intafaced.support.ticket_id', result.ticket.id);
      span.setAttribute('intafaced.support.to_status', result.ticket.status);
      return result.ticket;
    });
  }

  /** The audit trail. Owner sees their own ticket's; operators see any. */
  async listTicketEvents(input: { userId: string; ticketId: string; asOperator?: boolean }): Promise<SupportTicketEvent[]> {
    return withSupportSpan('support.listTicketEvents', { op: 'listTicketEvents', ticketId: input.ticketId }, async () => {
      // Visibility is decided by getTicket, which answers "somebody else's" and
      // "no such thing" identically — so the trail cannot be used to probe for
      // ticket ids the caller may not see.
      await this.getTicket(input);
      return this.store.listEvents(input.ticketId);
    });
  }

  /**
   * READ THE TICKET OWNER'S ACCOUNT STATE — and record that it was read.
   *
   * Note what this method does NOT take: a `userId`. An operator reads the
   * account state OF A TICKET they are working, and the user id comes off the
   * ticket row rather than off the request. That closes the surface that would
   * otherwise exist — `support:ops` plus a user id is an account-lookup API for
   * the whole platform, which is an authority the scope was never granted and
   * which no ticket needs. It is the same bound svc-agents' support agent
   * already refuses on (`account_owner_mismatch`).
   *
   * A dark or unreachable identity plane returns `{ status: 'unread' }`, never
   * an invented `active`.
   */
  async readAccountState(input: { operatorId: string; ticketId: string }): Promise<SupportAccountGrounding> {
    return withSupportSpan('support.readAccountState', { op: 'readAccountState' }, async (span) => {
      const ticket = await this.store.findById(input.ticketId);
      if (!ticket) throw ticketNotFound();

      const state = await this.accounts.stateOf(ticket.userId);
      const grounding = groundingFor(state, new Date().toISOString());

      span.setAttribute('intafaced.support.ticket_id', ticket.id);
      span.setAttribute('intafaced.support.grounding', grounding.status);

      // The read is itself an auditable act: "who looked at whose account, and
      // when" is the question `svc-p2p.instrument_access_log` exists to answer,
      // and a support desk needs it for the same reason.
      await this.store.appendEvent({
        ticketId: ticket.id,
        kind: 'grounding_read',
        actorId: input.operatorId,
        actorRole: 'operator',
        note: grounding.status === 'read' ? `account_state:${grounding.state.status}` : `unread:${grounding.reason}`,
      });

      return grounding;
    });
  }

  /**
   * ESCALATE WITH A CASE FILE.
   *
   * The case file is assembled HERE, from what the desk can actually verify,
   * rather than from anything the operator types. The operator supplies a
   * summary, a reason and the ids of KB articles they relied on; this method
   * resolves those ids against the real catalog, reads the account state, reads
   * the ticket's comments, and digests each one. An article id that does not
   * exist contributes no citation — so an escalation cannot be made to look
   * grounded by citing something that was never there.
   *
   * MOVES NO VALUE. `reason: 'money_request'` records that a user asked for one;
   * there is no amount to attach and no ledger client in this service to attach
   * it to. The request leaves the desk as a named reason and the pay/ledger
   * recipe that owns the money is reached through its own path (§0.6).
   */
  async escalate(input: { operatorId: string } & EscalateTicketInput): Promise<SupportCaseFile> {
    return withSupportSpan('support.escalate', { op: 'escalate' }, async (span) => {
      const ticket = await this.store.findById(input.ticketId);
      if (!ticket) throw ticketNotFound();
      // Closed is terminal (lifecycle). An escalation after close is a second
      // desk inventing work on a finished complaint — refuse by code, no case
      // file, no trail noise. resolved → escalate stays legal (user not fixed).
      if (isTerminal(ticket.status)) {
        throw new SupportError('escalation refused: ticket is terminal', 'support.escalation.terminal');
      }

      const readAt = new Date().toISOString();
      const citations: SupportCitation[] = [];

      const state = await this.accounts.stateOf(ticket.userId);
      const grounding = groundingFor(state, readAt);
      if (grounding.status === 'read') citations.push(citeAccountState(grounding.state, readAt));

      for (const id of input.citedArticleIds ?? []) {
        const article = getKbById(id);
        // Silently skipped, deliberately: refusing the whole escalation over a
        // stale article id would strand the user, and counting a missing
        // article as a citation would be the fabrication this guards against.
        if (article) citations.push(citeKbArticle(article, readAt));
      }

      for (const comment of await this.store.listComments(ticket.id)) {
        citations.push(citeComment(comment, readAt));
      }

      const built = buildCaseFile({
        ticketId: ticket.id,
        escalatedBy: input.operatorId,
        reason: input.reason,
        summary: input.summary,
        citations,
        grounding,
      });

      if (built.status === 'refuse') {
        throw new SupportError(`escalation refused: ${built.reason}`, `support.case_file.${built.reason}`);
      }

      // Case file + escalated trail row commit together. A crash between the
      // two writes used to leave a case file with no trail — desk incomplete.
      const stored = await this.store.putCaseFileWithEscalated({
        caseFile: built.caseFile,
        actorId: input.operatorId,
        note: `reason:${input.reason} citations:${built.caseFile.citations.length}`,
      });

      span.setAttribute('intafaced.support.ticket_id', ticket.id);
      span.setAttribute('intafaced.support.escalation_reason', input.reason);
      span.setAttribute('intafaced.support.citation_count', stored.citations.length);

      return stored;
    });
  }

  /**
   * The case file an escalation was made against — so the escalation does not
   * arrive as a bare status with a story that has to be reconstructed.
   * `null` when the ticket was never escalated; never a fabricated empty file.
   */
  async getCaseFile(input: { operatorId: string; ticketId: string }): Promise<SupportCaseFile | null> {
    const ticket = await this.store.findById(input.ticketId);
    if (!ticket) throw ticketNotFound();
    return this.store.latestCaseFile(ticket.id);
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
