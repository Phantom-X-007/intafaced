import type postgres from 'postgres';
import type { NavigatorSessionOk } from './navigator-session-routes.js';

export type NavigatorSessionProjection = NavigatorSessionOk['session'];

export type NavigatorSessionStore = {
  readSession(sessionId: string): Promise<NavigatorSessionProjection | null>;
  publishSession(session: NavigatorSessionProjection): Promise<void>;
  refreshFromAuthSessions(): Promise<number>;
};

type ProjectionRow = {
  session_id: string;
  user_id: string;
  status: 'open' | 'closed';
};

type AuthSessionRow = {
  id: string;
  user_id: string;
  revoked: boolean;
  expires_at: Date;
};

function rowToSession(row: ProjectionRow): NavigatorSessionProjection {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    status: row.status,
  };
}

/** Map durable auth session row — never invents an open session. */
export function mapAuthSessionRow(row: AuthSessionRow, now: Date = new Date()): NavigatorSessionProjection {
  const open = !row.revoked && row.expires_at.getTime() > now.getTime();
  return {
    sessionId: row.id,
    userId: row.user_id,
    status: open ? 'open' : 'closed',
  };
}

export function createNavigatorSessionStore(sql: postgres.Sql): NavigatorSessionStore {
  return {
    async readSession(sessionId) {
      const projected = await sql<ProjectionRow[]>`
        SELECT session_id, user_id, status
        FROM identity.navigator_session_projections
        WHERE session_id = ${sessionId}
        LIMIT 1
      `;
      const projection = projected[0];
      if (projection) return rowToSession(projection);

      try {
        const authRows = await sql<AuthSessionRow[]>`
          SELECT id, user_id, revoked, expires_at
          FROM identity.sessions
          WHERE id = ${sessionId}::uuid
          LIMIT 1
        `;
        const auth = authRows[0];
        return auth ? mapAuthSessionRow(auth) : null;
      } catch {
        return null;
      }
    },
    async publishSession(session) {
      await sql`
        INSERT INTO identity.navigator_session_projections (session_id, user_id, status)
        VALUES (${session.sessionId}, ${session.userId}, ${session.status})
        ON CONFLICT (session_id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          status = EXCLUDED.status,
          published_at = now()
      `;
    },
    async refreshFromAuthSessions() {
      const rows = await sql<AuthSessionRow[]>`
        SELECT id, user_id, revoked, expires_at
        FROM identity.sessions
      `;
      const now = new Date();
      for (const row of rows) {
        await this.publishSession(mapAuthSessionRow(row, now));
      }
      return rows.length;
    },
  };
}
