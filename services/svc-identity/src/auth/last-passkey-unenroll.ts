/**
 * Unenroll the last remaining passkey. That move revokes its API keys and live sessions.
 * Reuses unenrollOneOfTwo. No invented challenge. No invented session/key ids.
 */
import type { Sql } from 'postgres';
import { unenrollOneOfTwo } from './unenroll-one-of-two.js';

export async function unenrollLastRemainingPasskey(
  sql: Sql,
  userId: string,
  credentialId: string | null | undefined,
): Promise<{ credentialId: string; remaining: number; sessionsRevoked: number; keysRevoked: number }> {
  return unenrollOneOfTwo(sql, userId, credentialId);
}
