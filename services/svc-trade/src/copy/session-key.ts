/**
 * Copy auto-mirror session-key — hashed at rest, grant once, kill revokes.
 *
 * Envelope `expiresAt` is not this key. Follow may remain after kill.
 * Schema has no session-key columns → sidecar map keyed followId (SQL overlay).
 * Memory follows store the same fields on the object.
 */
import { createHash, randomBytes } from 'node:crypto';
import { CopyError } from './errors.js';
import type { CopyFollow } from './follows.js';

export const COPY_SESSION_KEY_MISSING_RESIDUAL =
  'copy.placeMirror needs a granted unrevoked auto-mirror session-key — hashed at rest; never invent a key';

export const COPY_SESSION_KEY_REVOKED_RESIDUAL = 'copy auto-mirror session-key is revoked — place refuses; follow may remain';

export type StoredCopySessionKey = {
  readonly id: string;
  readonly hash: string;
  readonly prefix: string;
  readonly revoked: boolean;
};

/** Sidecar for SQL (no column) and Memory overlay. Keyed followId. */
const copySessionKeyByFollow = new Map<string, StoredCopySessionKey>();

export function hashCopySessionKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateCopySessionKey(): { key: string; hash: string; prefix: string; id: string } {
  const key = `cpy_${randomBytes(24).toString('base64url')}`;
  const prefix = key.slice(0, 12);
  return { key, hash: hashCopySessionKey(key), prefix, id: prefix };
}

export function persistFollowSessionKey(follow: CopyFollow): void {
  if (!follow.sessionKeyHash) return;
  copySessionKeyByFollow.set(follow.followId, {
    id: follow.sessionKeyPrefix ?? follow.sessionKeyHash.slice(0, 12),
    hash: follow.sessionKeyHash,
    prefix: follow.sessionKeyPrefix ?? follow.sessionKeyHash.slice(0, 12),
    revoked: follow.sessionKeyRevoked === true,
  });
}

export function overlayFollowSessionKey(follow: CopyFollow): CopyFollow {
  const rec = copySessionKeyByFollow.get(follow.followId);
  const hash = follow.sessionKeyHash ?? rec?.hash ?? null;
  const prefix = follow.sessionKeyPrefix ?? rec?.prefix ?? null;
  const revoked = follow.sessionKeyRevoked ?? rec?.revoked ?? false;
  if (!hash && !prefix && !revoked) return follow;
  return { ...follow, sessionKeyHash: hash, sessionKeyPrefix: prefix, sessionKeyRevoked: revoked };
}

export function dropFollowSessionKey(followId: string): void {
  copySessionKeyByFollow.delete(followId);
}

export function peekFollowSessionKey(followId: string): StoredCopySessionKey | undefined {
  return copySessionKeyByFollow.get(followId);
}

/** Place gate: follow must carry an unrevoked hashed grant. Raw is never re-read. */
export function requireUnrevokedCopySessionKey(follow: CopyFollow): void {
  const rec = overlayFollowSessionKey(follow);
  if (!rec.sessionKeyHash) {
    throw new CopyError(
      'copy.placeMirror requires a granted unrevoked auto-mirror session-key',
      'trade.copy_session_key_missing',
      COPY_SESSION_KEY_MISSING_RESIDUAL,
    );
  }
  if (rec.sessionKeyRevoked === true) {
    throw new CopyError('copy auto-mirror session-key is revoked', 'trade.copy_session_key_revoked', COPY_SESSION_KEY_REVOKED_RESIDUAL);
  }
}
