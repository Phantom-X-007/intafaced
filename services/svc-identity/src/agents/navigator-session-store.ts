import type postgres from 'postgres';
import type { NavigatorSessionOk } from './navigator-session-routes.js';

export type NavigatorSessionProjection = NavigatorSessionOk['session'];

export type NavigatorSessionStore = {
  readSession(sessionId: string): Promise<NavigatorSessionProjection | null>;
  publishSession(session: NavigatorSessionProjection): Promise<void>;
};

type SessionRow = {
  session_id: string;
  user_id: string;
  status: 'open' | 'closed';
};

function rowToSession(row: SessionRow): NavigatorSessionProjection {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    status: row.status,
  };
}

export function createNavigatorSessionStore(sql: postgres.Sql): NavigatorSessionStore {
  return {
    async readSession(sessionId) {
      const rows = await sql<SessionRow[]>`
        SELECT session_id, user_id, status
        FROM identity.navigator_session_projections
        WHERE session_id = ${sessionId}
        LIMIT 1
      `;
      const row = rows[0];
      return row ? rowToSession(row) : null;
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
  };
}
