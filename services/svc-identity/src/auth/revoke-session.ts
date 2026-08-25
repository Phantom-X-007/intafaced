/**
 * Revoke one session by id. Same UPDATE as AuthService refresh/logout-by-id.
 * Already-revoked stay revoked. Foreign user is a no-op.
 */
import type { Sql } from 'postgres';

export async function revokeSession(sql: Sql, userId: string, sessionId: string): Promise<boolean> {
  const rows = await sql<Array<{ id: string }>>`
    UPDATE sessions
    SET revoked = true
    WHERE id = ${sessionId} AND user_id = ${userId} AND revoked = false
    RETURNING id
  `;
  return rows.length > 0;
}
