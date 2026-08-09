import { randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import type {
  SupportAccountGrounding,
  SupportCaseFile,
  SupportCitation,
  SupportComment,
  SupportTicket,
  SupportTicketEvent,
  SupportTicketEventKind,
  SupportTicketStatus,
} from '@intafaced/contracts';
import { checkTransition } from './lifecycle.js';
import { claimTicket, type ClaimResult } from './operator-queue.js';

/**
 * Ticket persistence — interface + memory + postgres.
 *
 * Tests use MemorySupportStore. Production boots PostgresSupportStore so two
 * replicas behind the edge share one ticket set and claims are exclusive.
 *
 * EVERY STATE CHANGE WRITES ITS OWN AUDIT ROW, IN THE SAME TRANSACTION.
 *
 * There is no `appendEvent` the mutators call afterwards and no
 * `recordAudit(...)` a caller can forget, because the version of this code that
 * had one would eventually grow a path that changed a ticket without recording
 * it — and that path is the only one that matters, since it is the one somebody
 * uses when they would rather there were no record. `create`, `setStatus` and
 * `claimTicket` each write ticket and trail together or write neither.
 *
 * `appendEvent` exists only for the two kinds that are NOT state changes —
 * `grounding_read` and `escalated` — where there is nothing to be atomic with.
 */

export type CreateTicketRow = {
  userId: string;
  category: SupportTicket['category'];
  subject: string;
  body: string;
};

export type AddCommentInput = {
  ticketId: string;
  authorId: string;
  authorRole: 'user' | 'operator';
  body: string;
};

export type AppendEventInput = {
  ticketId: string;
  kind: Extract<SupportTicketEventKind, 'grounding_read' | 'escalated'>;
  actorId: string;
  actorRole: 'user' | 'operator';
  note?: string | null;
};

/**
 * The result of a lifecycle move. A discriminated union rather than
 * `SupportTicket | null`, because the old signature had exactly one failure
 * shape for three different failures — no such ticket, illegal transition, and
 * "it is already that status" — and the caller could only report the first.
 */
export type SetStatusResult =
  | { readonly status: 'ok'; readonly ticket: SupportTicket }
  | { readonly status: 'refuse'; readonly reason: 'not_found' | 'illegal_transition' | 'same_status' };

export type SetStatusInput = {
  ticketId: string;
  status: SupportTicketStatus;
  operatorId: string;
  note?: string | null;
};

export interface SupportStore {
  createTicket(input: CreateTicketRow): Promise<SupportTicket>;
  listByUser(userId: string): Promise<SupportTicket[]>;
  listAll(): Promise<SupportTicket[]>;
  findById(ticketId: string): Promise<SupportTicket | null>;
  addComment(input: AddCommentInput): Promise<SupportComment>;
  listComments(ticketId: string): Promise<SupportComment[]>;
  /** Lifecycle move + its audit row, atomically. Refuses illegal transitions. */
  setStatus(input: SetStatusInput): Promise<SetStatusResult>;
  /**
   * Exclusive operator claim — must be multi-replica safe.
   * Memory: read-modify-write under single process.
   * Postgres: single UPDATE … WHERE assignee free (or self re-claim).
   * Writes an `assigned` audit row in the same transaction as a winning claim.
   */
  claimTicket(input: { ticketId: string; operatorId: string }): Promise<ClaimResult>;
  /** Non-state-change trail rows: `grounding_read`, `escalated`. */
  appendEvent(input: AppendEventInput): Promise<SupportTicketEvent>;
  /** The trail, oldest first. */
  listEvents(ticketId: string): Promise<SupportTicketEvent[]>;
  /** Write a case file. Immutable once written (trigger, migration 0001). */
  putCaseFile(caseFile: SupportCaseFile): Promise<SupportCaseFile>;
  /** The most recent case file for a ticket, or null if never escalated. */
  latestCaseFile(ticketId: string): Promise<SupportCaseFile | null>;
}

function toIso(d: Date | string): string {
  if (typeof d === 'string') return d;
  return d.toISOString();
}

type PgTicket = {
  id: string;
  user_id: string;
  category: SupportTicket['category'];
  subject: string;
  body: string;
  status: SupportTicketStatus;
  assignee_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type PgComment = {
  id: string;
  ticket_id: string;
  author_id: string;
  author_role: 'user' | 'operator';
  body: string;
  created_at: Date;
};

function ticketFromPg(row: PgTicket): SupportTicket {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    subject: row.subject,
    body: row.body,
    status: row.status,
    assigneeId: row.assignee_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function commentFromPg(row: PgComment): SupportComment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    authorRole: row.author_role,
    body: row.body,
    createdAt: toIso(row.created_at),
  };
}

type PgEvent = {
  id: string;
  ticket_id: string;
  sequence: number;
  kind: SupportTicketEventKind;
  actor_id: string;
  actor_role: 'user' | 'operator';
  from_status: SupportTicketStatus | null;
  to_status: SupportTicketStatus | null;
  note: string | null;
  occurred_at: Date;
};

function eventFromPg(row: PgEvent): SupportTicketEvent {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    sequence: Number(row.sequence),
    kind: row.kind,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    occurredAt: toIso(row.occurred_at),
  };
}

type PgCaseFile = {
  ticket_id: string;
  escalated_by: string;
  reason: SupportCaseFile['reason'];
  citations: unknown;
  grounding: unknown;
  summary: string;
  created_at: Date;
};

function caseFileFromPg(row: PgCaseFile): SupportCaseFile {
  return {
    ticketId: row.ticket_id,
    escalatedBy: row.escalated_by,
    reason: row.reason,
    citations: row.citations as SupportCitation[],
    grounding: row.grounding as SupportAccountGrounding,
    summary: row.summary,
    createdAt: toIso(row.created_at),
  };
}

/**
 * Append one trail row, taking the next dense sequence for this ticket.
 *
 * The `SELECT COALESCE(MAX(sequence),0)+1` is a read-then-write and therefore
 * racy — and the unique index `ticket_events_ticket_sequence_idx` is what makes
 * that safe rather than what makes it a bug. Two concurrent writers pick the
 * same number and the second INSERT violates the index, aborting its
 * transaction and rolling back the state change it was recording. The failure
 * mode is a refused operation, never a ticket that moved without a trail row or
 * a trail whose ordering was silently invented.
 *
 * Takes the transaction handle rather than `this.sql` so a caller physically
 * cannot write the audit row outside the transaction it belongs to.
 */
async function insertEvent(
  tx: TransactionSql,
  input: {
    ticketId: string;
    kind: SupportTicketEventKind;
    actorId: string;
    actorRole: 'user' | 'operator';
    fromStatus?: SupportTicketStatus | null;
    toStatus?: SupportTicketStatus | null;
    note?: string | null;
  },
): Promise<SupportTicketEvent> {
  const rows = await tx<PgEvent[]>`
    INSERT INTO support.ticket_events (ticket_id, sequence, kind, actor_id, actor_role, from_status, to_status, note)
    SELECT
      ${input.ticketId},
      COALESCE(MAX(sequence), 0) + 1,
      ${input.kind},
      ${input.actorId},
      ${input.actorRole},
      ${input.fromStatus ?? null},
      ${input.toStatus ?? null},
      ${input.note ?? null}
    FROM support.ticket_events
    WHERE ticket_id = ${input.ticketId}
    RETURNING id, ticket_id, sequence, kind, actor_id, actor_role, from_status, to_status, note, occurred_at
  `;
  return eventFromPg(rows[0]!);
}

/**
 * In-memory store for unit tests — same claim/list semantics as Postgres
 * for a single process. Not multi-replica safe (that is why production uses PG).
 */
export class MemorySupportStore implements SupportStore {
  private readonly tickets = new Map<string, SupportTicket>();
  private readonly comments = new Map<string, SupportComment[]>();
  private readonly events = new Map<string, SupportTicketEvent[]>();
  private readonly cases = new Map<string, SupportCaseFile[]>();

  /** Dense per ticket — the array length IS the sequence, single process. */
  private record(input: {
    ticketId: string;
    kind: SupportTicketEventKind;
    actorId: string;
    actorRole: 'user' | 'operator';
    fromStatus?: SupportTicketStatus | null;
    toStatus?: SupportTicketStatus | null;
    note?: string | null;
    at?: string;
  }): SupportTicketEvent {
    const trail = this.events.get(input.ticketId) ?? [];
    const event: SupportTicketEvent = {
      id: randomUUID(),
      ticketId: input.ticketId,
      sequence: trail.length + 1,
      kind: input.kind,
      actorId: input.actorId,
      actorRole: input.actorRole,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
      occurredAt: input.at ?? new Date().toISOString(),
    };
    trail.push(event);
    this.events.set(input.ticketId, trail);
    return event;
  }

  async createTicket(input: CreateTicketRow): Promise<SupportTicket> {
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
    this.events.set(ticket.id, []);
    this.record({ ticketId: ticket.id, kind: 'opened', actorId: input.userId, actorRole: 'user', at: now });
    return ticket;
  }

  async listByUser(userId: string): Promise<SupportTicket[]> {
    return [...this.tickets.values()].filter((t) => t.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listAll(): Promise<SupportTicket[]> {
    return [...this.tickets.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(ticketId: string): Promise<SupportTicket | null> {
    return this.tickets.get(ticketId) ?? null;
  }

  async addComment(input: AddCommentInput): Promise<SupportComment> {
    const ticket = this.tickets.get(input.ticketId);
    if (!ticket) throw new Error('ticket not found for comment');
    const comment: SupportComment = {
      id: randomUUID(),
      ticketId: input.ticketId,
      authorId: input.authorId,
      authorRole: input.authorRole,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    const list = this.comments.get(input.ticketId) ?? [];
    list.push(comment);
    this.comments.set(input.ticketId, list);
    this.tickets.set(ticket.id, { ...ticket, updatedAt: comment.createdAt });
    return comment;
  }

  async listComments(ticketId: string): Promise<SupportComment[]> {
    return [...(this.comments.get(ticketId) ?? [])];
  }

  async setStatus(input: SetStatusInput): Promise<SetStatusResult> {
    const ticket = this.tickets.get(input.ticketId);
    if (!ticket) return { status: 'refuse', reason: 'not_found' };

    const check = checkTransition(ticket.status, input.status);
    if (check.status === 'refuse') {
      return { status: 'refuse', reason: check.reason === 'same_status' ? 'same_status' : 'illegal_transition' };
    }

    const now = new Date().toISOString();
    const updated: SupportTicket = { ...ticket, status: input.status, updatedAt: now };
    this.tickets.set(input.ticketId, updated);
    this.record({
      ticketId: input.ticketId,
      kind: 'status_changed',
      actorId: input.operatorId,
      actorRole: 'operator',
      fromStatus: ticket.status,
      toStatus: input.status,
      note: input.note ?? null,
      at: now,
    });
    return { status: 'ok', ticket: updated };
  }

  async claimTicket(input: { ticketId: string; operatorId: string }): Promise<ClaimResult> {
    const before = this.tickets.get(input.ticketId);
    const result = claimTicket({
      tickets: [...this.tickets.values()],
      ticketId: input.ticketId,
      operatorId: input.operatorId,
    });
    if (result.status === 'ok') {
      const alreadyMine = before?.assigneeId === input.operatorId;
      this.tickets.set(result.ticket.id, result.ticket);
      // An idempotent self re-claim changed nothing, so it records nothing —
      // a trail that grows on every refresh of an operator's screen is noise
      // that hides the rows somebody will one day need to read.
      if (!alreadyMine) {
        this.record({
          ticketId: result.ticket.id,
          kind: 'assigned',
          actorId: input.operatorId,
          actorRole: 'operator',
          at: result.ticket.updatedAt,
        });
        if (before && before.status !== result.ticket.status) {
          this.record({
            ticketId: result.ticket.id,
            kind: 'status_changed',
            actorId: input.operatorId,
            actorRole: 'operator',
            fromStatus: before.status,
            toStatus: result.ticket.status,
            at: result.ticket.updatedAt,
          });
        }
      }
    }
    return result;
  }

  async appendEvent(input: AppendEventInput): Promise<SupportTicketEvent> {
    if (!this.tickets.has(input.ticketId)) throw new Error('ticket not found for event');
    return this.record({
      ticketId: input.ticketId,
      kind: input.kind,
      actorId: input.actorId,
      actorRole: input.actorRole,
      note: input.note ?? null,
    });
  }

  async listEvents(ticketId: string): Promise<SupportTicketEvent[]> {
    return [...(this.events.get(ticketId) ?? [])].sort((a, b) => a.sequence - b.sequence);
  }

  async putCaseFile(caseFile: SupportCaseFile): Promise<SupportCaseFile> {
    const list = this.cases.get(caseFile.ticketId) ?? [];
    list.push(caseFile);
    this.cases.set(caseFile.ticketId, list);
    return caseFile;
  }

  async latestCaseFile(ticketId: string): Promise<SupportCaseFile | null> {
    const list = this.cases.get(ticketId) ?? [];
    return list.length === 0 ? null : list[list.length - 1]!;
  }
}

/**
 * Postgres store — shared across replicas. Claim is one UPDATE that only
 * succeeds when assignee is null or already self (idempotent re-claim).
 */
export class PostgresSupportStore implements SupportStore {
  constructor(private readonly sql: Sql) {}

  /** Ticket + its first trail row, atomically. `opened` is sequence 1, always. */
  async createTicket(input: CreateTicketRow): Promise<SupportTicket> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<PgTicket[]>`
        INSERT INTO support.tickets (user_id, category, subject, body, status)
        VALUES (${input.userId}, ${input.category}, ${input.subject}, ${input.body}, 'open')
        RETURNING id, user_id, category, subject, body, status, assignee_id, created_at, updated_at
      `;
      const ticket = ticketFromPg(rows[0]!);
      await insertEvent(tx, { ticketId: ticket.id, kind: 'opened', actorId: input.userId, actorRole: 'user' });
      return ticket;
    });
  }

  async listByUser(userId: string): Promise<SupportTicket[]> {
    const rows = await this.sql<PgTicket[]>`
      SELECT id, user_id, category, subject, body, status, assignee_id, created_at, updated_at
      FROM support.tickets
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return rows.map(ticketFromPg);
  }

  async listAll(): Promise<SupportTicket[]> {
    const rows = await this.sql<PgTicket[]>`
      SELECT id, user_id, category, subject, body, status, assignee_id, created_at, updated_at
      FROM support.tickets
      ORDER BY created_at DESC
    `;
    return rows.map(ticketFromPg);
  }

  async findById(ticketId: string): Promise<SupportTicket | null> {
    const rows = await this.sql<PgTicket[]>`
      SELECT id, user_id, category, subject, body, status, assignee_id, created_at, updated_at
      FROM support.tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;
    return rows[0] ? ticketFromPg(rows[0]) : null;
  }

  async addComment(input: AddCommentInput): Promise<SupportComment> {
    const rows = await this.sql.begin(async (tx) => {
      const comments = await tx<PgComment[]>`
        INSERT INTO support.comments (ticket_id, author_id, author_role, body)
        VALUES (${input.ticketId}, ${input.authorId}, ${input.authorRole}, ${input.body})
        RETURNING id, ticket_id, author_id, author_role, body, created_at
      `;
      await tx`
        UPDATE support.tickets
        SET updated_at = now()
        WHERE id = ${input.ticketId}
      `;
      return comments;
    });
    return commentFromPg(rows[0]!);
  }

  async listComments(ticketId: string): Promise<SupportComment[]> {
    const rows = await this.sql<PgComment[]>`
      SELECT id, ticket_id, author_id, author_role, body, created_at
      FROM support.comments
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at ASC
    `;
    return rows.map(commentFromPg);
  }

  /**
   * Lifecycle move + audit row in ONE transaction.
   *
   * `SELECT … FOR UPDATE` and not a bare read: two operators resolving and
   * closing the same ticket at the same instant would otherwise both pass their
   * transition check against the same `open`, and the trail would claim two
   * first moves out of one state. The row lock makes the second wait and then
   * see what the first actually did — so it either refuses (`closed` is
   * terminal) or records `resolved → closed` truthfully.
   */
  async setStatus(input: SetStatusInput): Promise<SetStatusResult> {
    return this.sql.begin(async (tx): Promise<SetStatusResult> => {
      const current = await tx<{ status: SupportTicketStatus }[]>`
        SELECT status FROM support.tickets WHERE id = ${input.ticketId} FOR UPDATE
      `;
      const from = current[0]?.status;
      if (!from) return { status: 'refuse', reason: 'not_found' };

      const check = checkTransition(from, input.status);
      if (check.status === 'refuse') {
        return { status: 'refuse', reason: check.reason === 'same_status' ? 'same_status' : 'illegal_transition' };
      }

      const rows = await tx<PgTicket[]>`
        UPDATE support.tickets
        SET status = ${input.status}, updated_at = now()
        WHERE id = ${input.ticketId}
        RETURNING id, user_id, category, subject, body, status, assignee_id, created_at, updated_at
      `;
      if (!rows[0]) return { status: 'refuse', reason: 'not_found' };

      await insertEvent(tx, {
        ticketId: input.ticketId,
        kind: 'status_changed',
        actorId: input.operatorId,
        actorRole: 'operator',
        fromStatus: from,
        toStatus: input.status,
        note: input.note ?? null,
      });

      return { status: 'ok', ticket: ticketFromPg(rows[0]) };
    });
  }

  /**
   * Atomic claim: one statement, exclusive under Postgres row update.
   * Two operators racing → one UPDATE returns a row, the other gets zero.
   */
  async claimTicket(input: { ticketId: string; operatorId: string }): Promise<ClaimResult> {
    const operatorId = input.operatorId?.trim() ?? '';
    if (!operatorId) return { status: 'refuse', reason: 'invalid_operator' };

    const existing = await this.findById(input.ticketId);
    if (!existing) return { status: 'refuse', reason: 'not_found' };
    if (existing.status !== 'open' && existing.status !== 'pending') {
      return { status: 'refuse', reason: 'not_queueable' };
    }
    if (existing.assigneeId && existing.assigneeId !== operatorId) {
      return { status: 'refuse', reason: 'already_claimed' };
    }

    // Self re-claim: idempotent, no steal race possible for other operators.
    if (existing.assigneeId === operatorId) {
      return { status: 'ok', ticket: existing };
    }

    // The UPDATE stays ONE statement — that is what makes the claim exclusive,
    // and the transaction around it changes nothing about that. What the
    // transaction adds is that the winner's `assigned` trail row cannot be lost
    // if this process dies between the two writes: a ticket assigned to an
    // operator with no record of who assigned it is the exact gap the trail
    // exists to close.
    const rows = await this.sql.begin(async (tx) => {
      const claimed = await tx<PgTicket[]>`
        UPDATE support.tickets
        SET
          assignee_id = ${operatorId},
          status = CASE WHEN status = 'open' THEN 'pending' ELSE status END,
          updated_at = now()
        WHERE id = ${input.ticketId}
          AND status IN ('open', 'pending')
          AND (assignee_id IS NULL OR assignee_id = ${operatorId})
        RETURNING id, user_id, category, subject, body, status, assignee_id, created_at, updated_at
      `;
      if (claimed.length === 0) return claimed;

      await insertEvent(tx, { ticketId: input.ticketId, kind: 'assigned', actorId: operatorId, actorRole: 'operator' });
      if (existing.status !== claimed[0]!.status) {
        await insertEvent(tx, {
          ticketId: input.ticketId,
          kind: 'status_changed',
          actorId: operatorId,
          actorRole: 'operator',
          fromStatus: existing.status,
          toStatus: claimed[0]!.status,
        });
      }
      return claimed;
    });

    if (rows.length === 0) {
      // Lost race: another operator claimed between our read and update.
      const again = await this.findById(input.ticketId);
      if (!again) return { status: 'refuse', reason: 'not_found' };
      if (again.assigneeId && again.assigneeId !== operatorId) {
        return { status: 'refuse', reason: 'already_claimed' };
      }
      if (again.status !== 'open' && again.status !== 'pending') {
        return { status: 'refuse', reason: 'not_queueable' };
      }
      return { status: 'refuse', reason: 'already_claimed' };
    }

    return { status: 'ok', ticket: ticketFromPg(rows[0]!) };
  }

  /**
   * Trail rows that record a READ or a hand-off rather than a state change, so
   * there is nothing to be atomic with. Still goes through `insertEvent`, so it
   * takes the same dense sequence and hits the same unique index.
   */
  async appendEvent(input: AppendEventInput): Promise<SupportTicketEvent> {
    return this.sql.begin(async (tx) =>
      insertEvent(tx, {
        ticketId: input.ticketId,
        kind: input.kind,
        actorId: input.actorId,
        actorRole: input.actorRole,
        note: input.note ?? null,
      }),
    );
  }

  /** Ordered by `sequence`, not `occurred_at` — two rows can share a timestamp. */
  async listEvents(ticketId: string): Promise<SupportTicketEvent[]> {
    const rows = await this.sql<PgEvent[]>`
      SELECT id, ticket_id, sequence, kind, actor_id, actor_role, from_status, to_status, note, occurred_at
      FROM support.ticket_events
      WHERE ticket_id = ${ticketId}
      ORDER BY sequence ASC
    `;
    return rows.map(eventFromPg);
  }

  async putCaseFile(caseFile: SupportCaseFile): Promise<SupportCaseFile> {
    const rows = await this.sql<PgCaseFile[]>`
      INSERT INTO support.case_files (ticket_id, escalated_by, reason, citations, grounding, summary)
      VALUES (
        ${caseFile.ticketId},
        ${caseFile.escalatedBy},
        ${caseFile.reason},
        ${this.sql.json(caseFile.citations as never)},
        ${this.sql.json(caseFile.grounding as never)},
        ${caseFile.summary}
      )
      RETURNING ticket_id, escalated_by, reason, citations, grounding, summary, created_at
    `;
    return caseFileFromPg(rows[0]!);
  }

  async latestCaseFile(ticketId: string): Promise<SupportCaseFile | null> {
    const rows = await this.sql<PgCaseFile[]>`
      SELECT ticket_id, escalated_by, reason, citations, grounding, summary, created_at
      FROM support.case_files
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ? caseFileFromPg(rows[0]) : null;
  }
}
