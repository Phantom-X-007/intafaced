import type { Sql } from 'postgres';

/**
 * Pending TOTP enrolment port — put on start, take once on confirm, TTL.
 *
 * Production uses {@link SqlPendingTotpEnrolmentStore} so enrol-on-pod-A /
 * confirm-on-pod-B works. Pure unit tests may inject {@link MemoryPendingTotpEnrolmentStore}.
 *
 * Payload is secret_hash + recovery hashes only — never the base32 secret.
 * Confirm receives the secret from the client and seals it after a valid code.
 */

/** Default 15 minutes — human scans QR; longer than WebAuthn ceremony TTL. */
export const PENDING_TOTP_DEFAULT_TTL_MS = 15 * 60 * 1000;

export interface PendingTotpEntry {
  recoveryHashes: string[];
  expiresAt: number;
}

export interface PendingTotpEnrolmentStore {
  put(userId: string, secretHash: string, recoveryHashes: string[], ttlMs?: number): Promise<void>;
  /**
   * Single-use take only when secret_hash matches and row is unexpired.
   * Wrong secret leaves the row so a legitimate confirm still works.
   */
  takeIfSecretHash(userId: string, secretHash: string): Promise<PendingTotpEntry | null>;
}

/**
 * In-process pending store (single pod / pure unit tests).
 *
 * Multi-instance deploys must use {@link SqlPendingTotpEnrolmentStore}.
 */
export class MemoryPendingTotpEnrolmentStore implements PendingTotpEnrolmentStore {
  private readonly entries = new Map<string, { secretHash: string; recoveryHashes: string[]; expiresAt: number }>();

  constructor(private readonly ttlMs: number = PENDING_TOTP_DEFAULT_TTL_MS) {}

  async put(userId: string, secretHash: string, recoveryHashes: string[], ttlMs: number = this.ttlMs): Promise<void> {
    this.prune();
    this.entries.set(userId, {
      secretHash,
      recoveryHashes: [...recoveryHashes],
      expiresAt: Date.now() + ttlMs,
    });
  }

  async takeIfSecretHash(userId: string, secretHash: string): Promise<PendingTotpEntry | null> {
    this.prune();
    const entry = this.entries.get(userId);
    if (!entry) return null;
    if (entry.secretHash !== secretHash) return null;
    this.entries.delete(userId);
    if (entry.expiresAt < Date.now()) return null;
    return { recoveryHashes: entry.recoveryHashes, expiresAt: entry.expiresAt };
  }

  /** Test helper — current size after prune. */
  get size(): number {
    this.prune();
    return this.entries.size;
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.entries) {
      if (v.expiresAt < now) this.entries.delete(k);
    }
  }
}

/**
 * Postgres-backed pending TOTP enrolment — shared across identity pods.
 *
 * Table: identity.totp_pending_enrolments (migration 0012).
 * takeIfSecretHash is single-use (DELETE … WHERE secret_hash match).
 */
export class SqlPendingTotpEnrolmentStore implements PendingTotpEnrolmentStore {
  constructor(
    private readonly sql: Sql,
    private readonly ttlMs: number = PENDING_TOTP_DEFAULT_TTL_MS,
  ) {}

  async put(userId: string, secretHash: string, recoveryHashes: string[], ttlMs: number = this.ttlMs): Promise<void> {
    await this.prune();
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.sql`
      INSERT INTO totp_pending_enrolments (user_id, secret_hash, recovery_code_hashes, expires_at)
      VALUES (${userId}, ${secretHash}, ${this.sql.json(recoveryHashes as never)}, ${expiresAt})
      ON CONFLICT (user_id) DO UPDATE SET
        secret_hash = EXCLUDED.secret_hash,
        recovery_code_hashes = EXCLUDED.recovery_code_hashes,
        expires_at = EXCLUDED.expires_at,
        created_at = now()
    `;
  }

  async takeIfSecretHash(userId: string, secretHash: string): Promise<PendingTotpEntry | null> {
    await this.prune();
    const rows = await this.sql<Array<{ recovery_code_hashes: unknown; expires_at: Date }>>`
      DELETE FROM totp_pending_enrolments
       WHERE user_id = ${userId}
         AND secret_hash = ${secretHash}
         AND expires_at > now()
      RETURNING recovery_code_hashes, expires_at
    `;
    const row = rows[0];
    if (!row) return null;
    const expiresAt = row.expires_at instanceof Date ? row.expires_at.getTime() : new Date(row.expires_at).getTime();
    return {
      recoveryHashes: asStringList(row.recovery_code_hashes),
      expiresAt,
    };
  }

  private async prune(): Promise<void> {
    await this.sql`DELETE FROM totp_pending_enrolments WHERE expires_at < now()`;
  }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}
