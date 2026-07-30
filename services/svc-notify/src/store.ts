import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';

/**
 * Notification persistence — interface + memory + postgres.
 *
 * Tests run against `MemoryNotifyStore` so the suite does not require Postgres.
 * Production boots with `PostgresNotifyStore` against the notify schema.
 */

export type Severity = 'info' | 'action' | 'critical';

export interface Notification {
  id: string;
  userId: string;
  kind: string;
  titleKey: string;
  bodyKey: string;
  params: Record<string, unknown>;
  href: string | null;
  severity: Severity;
  readAt: Date | null;
  sourceSubject: string;
  sourceIdempotencyKey: string;
  createdAt: Date;
}

export interface InsertNotificationInput {
  userId: string;
  kind: string;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, unknown>;
  href?: string | null;
  severity?: Severity;
  sourceSubject: string;
  sourceIdempotencyKey: string;
}

export interface ListQuery {
  userId: string;
  cursor?: string | null;
  limit: number;
  unreadOnly: boolean;
}

export interface ListResult {
  items: Notification[];
  nextCursor: string | null;
}

export interface NotifyStore {
  insert(input: InsertNotificationInput): Promise<{ inserted: boolean; notification: Notification | null }>;
  list(query: ListQuery): Promise<ListResult>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, ids: readonly string[]): Promise<number>;
  markAllRead(userId: string): Promise<number>;
}

function dedupeKey(userId: string, sourceSubject: string, sourceIdempotencyKey: string): string {
  return `${userId}\0${sourceSubject}\0${sourceIdempotencyKey}`;
}

/** In-memory store for unit tests — same dedupe / self-only semantics as Postgres. */
export class MemoryNotifyStore implements NotifyStore {
  private readonly byId = new Map<string, Notification>();
  private readonly byDedupe = new Map<string, string>();

  async insert(input: InsertNotificationInput): Promise<{ inserted: boolean; notification: Notification | null }> {
    const key = dedupeKey(input.userId, input.sourceSubject, input.sourceIdempotencyKey);
    if (this.byDedupe.has(key)) {
      return { inserted: false, notification: null };
    }
    const row: Notification = {
      id: randomUUID(),
      userId: input.userId,
      kind: input.kind,
      titleKey: input.titleKey,
      bodyKey: input.bodyKey,
      params: input.params ?? {},
      href: input.href ?? null,
      severity: input.severity ?? 'info',
      readAt: null,
      sourceSubject: input.sourceSubject,
      sourceIdempotencyKey: input.sourceIdempotencyKey,
      createdAt: new Date(),
    };
    this.byId.set(row.id, row);
    this.byDedupe.set(key, row.id);
    return { inserted: true, notification: row };
  }

  async list(query: ListQuery): Promise<ListResult> {
    let rows = [...this.byId.values()].filter((r) => r.userId === query.userId);
    if (query.unreadOnly) rows = rows.filter((r) => r.readAt === null);
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

    if (query.cursor) {
      const cursor = this.byId.get(query.cursor);
      if (cursor) {
        rows = rows.filter(
          (r) =>
            r.createdAt.getTime() < cursor.createdAt.getTime() ||
            (r.createdAt.getTime() === cursor.createdAt.getTime() && r.id < cursor.id),
        );
      }
    }

    const page = rows.slice(0, query.limit);
    const nextCursor = rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null;
    return { items: page, nextCursor };
  }

  async unreadCount(userId: string): Promise<number> {
    return [...this.byId.values()].filter((r) => r.userId === userId && r.readAt === null).length;
  }

  async markRead(userId: string, ids: readonly string[]): Promise<number> {
    let n = 0;
    const now = new Date();
    for (const id of ids) {
      const row = this.byId.get(id);
      if (!row || row.userId !== userId) continue;
      if (row.readAt === null) {
        row.readAt = now;
        n += 1;
      }
    }
    return n;
  }

  async markAllRead(userId: string): Promise<number> {
    let n = 0;
    const now = new Date();
    for (const row of this.byId.values()) {
      if (row.userId !== userId || row.readAt !== null) continue;
      row.readAt = now;
      n += 1;
    }
    return n;
  }
}

type PgRow = {
  id: string;
  user_id: string;
  kind: string;
  title_key: string;
  body_key: string;
  params: Record<string, unknown>;
  href: string | null;
  severity: Severity;
  read_at: Date | null;
  source_subject: string;
  source_idempotency_key: string;
  created_at: Date;
};

function fromPg(row: PgRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    titleKey: row.title_key,
    bodyKey: row.body_key,
    params: row.params ?? {},
    href: row.href,
    severity: row.severity,
    readAt: row.read_at,
    sourceSubject: row.source_subject,
    sourceIdempotencyKey: row.source_idempotency_key,
    createdAt: row.created_at,
  };
}

export class PostgresNotifyStore implements NotifyStore {
  constructor(private readonly sql: Sql) {}

  async insert(input: InsertNotificationInput): Promise<{ inserted: boolean; notification: Notification | null }> {
    const params = JSON.stringify(input.params ?? {});
    const severity = input.severity ?? 'info';
    const href = input.href ?? null;

    const rows = await this.sql<PgRow[]>`
      INSERT INTO notify.notifications (
        user_id, kind, title_key, body_key, params, href, severity,
        source_subject, source_idempotency_key
      ) VALUES (
        ${input.userId},
        ${input.kind},
        ${input.titleKey},
        ${input.bodyKey},
        ${params}::jsonb,
        ${href},
        ${severity},
        ${input.sourceSubject},
        ${input.sourceIdempotencyKey}
      )
      ON CONFLICT (user_id, source_subject, source_idempotency_key) DO NOTHING
      RETURNING
        id, user_id, kind, title_key, body_key, params, href, severity,
        read_at, source_subject, source_idempotency_key, created_at
    `;

    if (rows.length === 0) return { inserted: false, notification: null };
    return { inserted: true, notification: fromPg(rows[0]!) };
  }

  async list(query: ListQuery): Promise<ListResult> {
    const limit = query.limit;
    let rows: PgRow[];

    if (query.cursor) {
      const cursorRows = await this.sql<PgRow[]>`
        SELECT id, user_id, kind, title_key, body_key, params, href, severity,
               read_at, source_subject, source_idempotency_key, created_at
        FROM notify.notifications
        WHERE id = ${query.cursor} AND user_id = ${query.userId}
        LIMIT 1
      `;
      const cursor = cursorRows[0];
      if (!cursor) {
        return { items: [], nextCursor: null };
      }

      if (query.unreadOnly) {
        rows = await this.sql<PgRow[]>`
          SELECT id, user_id, kind, title_key, body_key, params, href, severity,
                 read_at, source_subject, source_idempotency_key, created_at
          FROM notify.notifications
          WHERE user_id = ${query.userId}
            AND read_at IS NULL
            AND (created_at, id) < (${cursor.created_at}, ${cursor.id})
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `;
      } else {
        rows = await this.sql<PgRow[]>`
          SELECT id, user_id, kind, title_key, body_key, params, href, severity,
                 read_at, source_subject, source_idempotency_key, created_at
          FROM notify.notifications
          WHERE user_id = ${query.userId}
            AND (created_at, id) < (${cursor.created_at}, ${cursor.id})
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `;
      }
    } else if (query.unreadOnly) {
      rows = await this.sql<PgRow[]>`
        SELECT id, user_id, kind, title_key, body_key, params, href, severity,
               read_at, source_subject, source_idempotency_key, created_at
        FROM notify.notifications
        WHERE user_id = ${query.userId}
          AND read_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    } else {
      rows = await this.sql<PgRow[]>`
        SELECT id, user_id, kind, title_key, body_key, params, href, severity,
               read_at, source_subject, source_idempotency_key, created_at
        FROM notify.notifications
        WHERE user_id = ${query.userId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    }

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).map(fromPg);
    return { items: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async unreadCount(userId: string): Promise<number> {
    const rows = await this.sql<Array<{ n: string }>>`
      SELECT count(*)::text AS n
      FROM notify.notifications
      WHERE user_id = ${userId} AND read_at IS NULL
    `;
    return Number(rows[0]?.n ?? 0);
  }

  async markRead(userId: string, ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    // Self-only: the WHERE binds user_id so another principal's ids are no-ops.
    const rows = await this.sql<Array<{ id: string }>>`
      UPDATE notify.notifications
      SET read_at = now()
      WHERE user_id = ${userId}
        AND id = ANY(${ids as unknown as string[]}::uuid[])
        AND read_at IS NULL
      RETURNING id
    `;
    return rows.length;
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = await this.sql<Array<{ id: string }>>`
      UPDATE notify.notifications
      SET read_at = now()
      WHERE user_id = ${userId}
        AND read_at IS NULL
      RETURNING id
    `;
    return rows.length;
  }
}
