import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import type { SupportComment, SupportTicket, SupportTicketStatus } from '@intafaced/contracts';
import { claimTicket, type ClaimResult } from './operator-queue.js';

/**
 * Ticket persistence — interface + memory + postgres.
 *
 * Tests use MemorySupportStore. Production boots PostgresSupportStore so two
 * replicas behind the edge share one ticket set and claims are exclusive.
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

export interface SupportStore {
  createTicket(input: CreateTicketRow): Promise<SupportTicket>;
  listByUser(userId: string): Promise<SupportTicket[]>;
  listAll(): Promise<SupportTicket[]>;
  findById(ticketId: string): Promise<SupportTicket | null>;
  addComment(input: AddCommentInput): Promise<SupportComment>;
  listComments(ticketId: string): Promise<SupportComment[]>;
  setStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket | null>;
  /**
   * Exclusive operator claim — must be multi-replica safe.
   * Memory: read-modify-write under single process.
   * Postgres: single UPDATE … WHERE assignee free (or self re-claim).
   */
  claimTicket(input: { ticketId: string; operatorId: string }): Promise<ClaimResult>;
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

/**
 * In-memory store for unit tests — same claim/list semantics as Postgres
 * for a single process. Not multi-replica safe (that is why production uses PG).
 */
export class MemorySupportStore implements SupportStore {
  private readonly tickets = new Map<string, SupportTicket>();
  private readonly comments = new Map<string, SupportComment[]>();

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

  async setStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket | null> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;
    const updated: SupportTicket = { ...ticket, status, updatedAt: new Date().toISOString() };
    this.tickets.set(ticketId, updated);
    return updated;
  }

  async claimTicket(input: { ticketId: string; operatorId: string }): Promise<ClaimResult> {
    const result = claimTicket({
      tickets: [...this.tickets.values()],
      ticketId: input.ticketId,
      operatorId: input.operatorId,
    });
    if (result.status === 'ok') {
      this.tickets.set(result.ticket.id, result.ticket);
    }
    return result;
  }
}

/**
 * Postgres store — shared across replicas. Claim is one UPDATE that only
 * succeeds when assignee is null or already self (idempotent re-claim).
 */
export class PostgresSupportStore implements SupportStore {
  constructor(private readonly sql: Sql) {}

  async createTicket(input: CreateTicketRow): Promise<SupportTicket> {
    const rows = await this.sql<PgTicket[]>`
      INSERT INTO support.tickets (user_id, category, subject, body, status)
      VALUES (${input.userId}, ${input.category}, ${input.subject}, ${input.body}, 'open')
      RETURNING id, user_id, category, subject, body, status, assignee_id, created_at, updated_at
    `;
    return ticketFromPg(rows[0]!);
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

  async setStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket | null> {
    const rows = await this.sql<PgTicket[]>`
      UPDATE support.tickets
      SET status = ${status}, updated_at = now()
      WHERE id = ${ticketId}
      RETURNING id, user_id, category, subject, body, status, assignee_id, created_at, updated_at
    `;
    return rows[0] ? ticketFromPg(rows[0]) : null;
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

    const rows = await this.sql<PgTicket[]>`
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
}
