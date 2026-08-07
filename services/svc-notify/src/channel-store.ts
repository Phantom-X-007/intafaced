import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import type { ChannelId, RefusalCode } from './channels/channel.js';

/**
 * PERSISTENCE FOR CHANNELS — who we may contact, and what actually happened.
 *
 * Two tables, and the split between them is the whole design:
 *
 *   channel_targets   an address the USER gave us and CONFIRMED. svc-notify
 *                     owns this rather than reading svc-identity's `users.email`,
 *                     because §2 forbids reaching into another service's tables
 *                     and because a login address is not consent to be texted.
 *
 *   deliveries        one row per (notification, channel) — the attempt AND the
 *                     outcome, kept apart. `attempted_at` says we tried;
 *                     `accepted_at` says a transport took it. A message that was
 *                     never accepted can never read as accepted, because there
 *                     is no single column that would let it.
 *
 * Both stores come in a memory pair for tests and a Postgres pair for prod, the
 * same shape as `store.ts`, so the suite needs no database.
 */

export type DeliveryStatus =
  /** Claimed for an attempt. In flight, or the process died mid-attempt. */
  | 'pending'
  /** A transport accepted it. The only status that may read as "the user was told". */
  | 'accepted'
  /** Declined before attempting anything. `refusalCode` says why. Terminal. */
  | 'refused'
  /** Attempted, did not work, will be tried again. */
  | 'failed'
  /** Attempted, did not work, will NOT be tried again. Terminal and stated. */
  | 'abandoned';

/**
 * How long a successful claim owns a pending row before another replica may
 * re-claim it (crash recovery).
 *
 * Two bounds decide this, and they pull opposite ways:
 *
 *   at least  the longest a single attempt can take — `NOTIFY_GATEWAY_TIMEOUT_MS`
 *             — or a lease expires under a sender that is merely slow, and the
 *             double-send this lease exists to stop comes back.
 *   at most   the bus `ack_wait` (30s, `packages/events/src/jetstream-bus.ts`) —
 *             or the natural redelivery of a crashed sender's message arrives
 *             while the lease is still live and can do nothing but nak again.
 *
 * `index.ts` derives it from the configured gateway timeout for that reason
 * rather than taking this default, which only covers callers that build a store
 * by hand. An operator who raises `NOTIFY_GATEWAY_TIMEOUT_MS` to its 30s ceiling
 * puts the two bounds in genuine conflict: an attempt that may run as long as
 * `ack_wait` will always be redelivered mid-flight, and no lease length fixes
 * that. Keep the gateway timeout well under 30s.
 */
export const DEFAULT_CLAIM_LEASE_MS = 15_000;

export interface DeliveryRecord {
  id: string;
  notificationId: string;
  channel: ChannelId;
  status: DeliveryStatus;
  /** How many times a send was claimed. Bounded by `maxAttempts`. */
  attempts: number;
  /** When a send was last actually attempted. NULL on a pure refusal — nothing was tried. */
  attemptedAt: Date | null;
  /** When a transport accepted it. NULL unless `status === 'accepted'`. */
  acceptedAt: Date | null;
  /**
   * Exclusive claim window. While status is pending and this is in the future,
   * another claim must not re-own the row (two-replica double-send guard).
   * NULL means no active lease (legacy rows / settled).
   */
  leaseUntil: Date | null;
  refusalCode: RefusalCode | null;
  /** Free text from the transport, truncated. Never shown as user copy. */
  detail: string | null;
  /** The transport's own handle, when it gives one. */
  reference: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelTarget {
  userId: string;
  channel: ChannelId;
  address: string;
  locale: string;
  /** NULL means never confirmed — and nothing is ever sent to an unconfirmed address. */
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ClaimResult =
  | { claimed: true; id: string; attempt: number }
  | {
      claimed: false;
      reason: 'already_accepted' | 'terminal' | 'exhausted' | 'in_flight';
      record: DeliveryRecord;
    };

export interface SettleInput {
  id: string;
  status: Exclude<DeliveryStatus, 'pending'>;
  refusalCode?: RefusalCode | null;
  detail?: string | null;
  reference?: string | null;
  /** Set when a send was genuinely attempted. Left alone on a refusal. */
  attempted: boolean;
}

export interface DeliveryStore {
  /**
   * Take exclusive ownership of the next attempt for this (notification, channel).
   *
   * This is the idempotency guard. At-least-once bus delivery means this runs
   * twice for the same business event; the second call must not produce a second
   * email. A single atomic upsert decides — never a read-then-write, which under
   * two replicas is a race that sends twice.
   */
  claim(notificationId: string, channel: ChannelId, maxAttempts: number): Promise<ClaimResult>;
  settle(input: SettleInput): Promise<void>;
  listForNotification(notificationId: string): Promise<DeliveryRecord[]>;
}

export interface UpsertTargetInput {
  userId: string;
  channel: ChannelId;
  address: string;
  locale: string;
  verifyTokenHash: string;
  verifyExpiresAt: Date;
}

export interface TargetStore {
  /** Register or replace an address. A changed address is ALWAYS unconfirmed again. */
  upsert(input: UpsertTargetInput): Promise<ChannelTarget>;
  list(userId: string): Promise<ChannelTarget[]>;
  /** The only list the dispatcher may use. */
  verified(userId: string): Promise<ChannelTarget[]>;
  /**
   * Channels holding a registered but UNCONFIRMED address.
   *
   * Ids only, deliberately — never addresses. The dispatcher needs this to tell
   * "you gave us nothing" apart from "you gave us something and never clicked
   * the code", which are different facts and only the second one is something
   * the user can fix. Returning ids and not rows means the dispatcher cannot
   * send to one of these even by mistake: it never holds the address.
   */
  unverifiedChannels(userId: string): Promise<readonly ChannelId[]>;
  /** Confirm with the token we sent. Returns false for a wrong, expired or spent token. */
  markVerified(userId: string, channel: ChannelId, tokenHash: string, now: Date): Promise<boolean>;
  remove(userId: string, channel: ChannelId): Promise<boolean>;
}

// ── memory ───────────────────────────────────────────────────────────────────

function deliveryKey(notificationId: string, channel: ChannelId): string {
  return `${notificationId}\0${channel}`;
}

export class MemoryDeliveryStore implements DeliveryStore {
  private readonly byKey = new Map<string, DeliveryRecord>();
  private readonly byId = new Map<string, DeliveryRecord>();
  private readonly leaseMs: number;
  private readonly now: () => Date;

  constructor(opts: { leaseMs?: number; now?: () => Date } = {}) {
    this.leaseMs = opts.leaseMs ?? DEFAULT_CLAIM_LEASE_MS;
    this.now = opts.now ?? (() => new Date());
  }

  async claim(notificationId: string, channel: ChannelId, maxAttempts: number): Promise<ClaimResult> {
    const key = deliveryKey(notificationId, channel);
    const existing = this.byKey.get(key);
    const now = this.now();
    const leaseUntil = new Date(now.getTime() + this.leaseMs);

    if (!existing) {
      const record: DeliveryRecord = {
        id: randomUUID(),
        notificationId,
        channel,
        status: 'pending',
        attempts: 1,
        attemptedAt: null,
        acceptedAt: null,
        leaseUntil,
        refusalCode: null,
        detail: null,
        reference: null,
        createdAt: now,
        updatedAt: now,
      };
      this.byKey.set(key, record);
      this.byId.set(record.id, record);
      return { claimed: true, id: record.id, attempt: 1 };
    }

    if (existing.status === 'accepted') return { claimed: false, reason: 'already_accepted', record: existing };
    if (existing.status === 'refused' || existing.status === 'abandoned') {
      return { claimed: false, reason: 'terminal', record: existing };
    }
    if (existing.attempts >= maxAttempts) {
      existing.status = 'abandoned';
      existing.refusalCode = 'channel.attempts_exhausted';
      existing.leaseUntil = null;
      existing.updatedAt = now;
      return { claimed: false, reason: 'exhausted', record: existing };
    }

    // Active lease on a still-pending row: another worker owns the send.
    if (existing.status === 'pending' && existing.leaseUntil != null && existing.leaseUntil.getTime() > now.getTime()) {
      return { claimed: false, reason: 'in_flight', record: existing };
    }

    // Reclaim: failed (retryable settle) or pending with expired / null lease.
    existing.attempts += 1;
    existing.status = 'pending';
    existing.leaseUntil = leaseUntil;
    existing.updatedAt = now;
    return { claimed: true, id: existing.id, attempt: existing.attempts };
  }

  async settle(input: SettleInput): Promise<void> {
    const record = this.byId.get(input.id);
    if (!record) return;
    const now = this.now();
    record.status = input.status;
    record.refusalCode = input.refusalCode ?? null;
    record.detail = input.detail ?? null;
    record.reference = input.reference ?? null;
    if (input.attempted) record.attemptedAt = now;
    record.acceptedAt = input.status === 'accepted' ? now : null;
    // Lease ends when the attempt does — a settled failure is free for retry.
    record.leaseUntil = null;
    record.updatedAt = now;
  }

  async listForNotification(notificationId: string): Promise<DeliveryRecord[]> {
    return [...this.byId.values()].filter((r) => r.notificationId === notificationId).sort((a, b) => a.channel.localeCompare(b.channel));
  }
}

export class MemoryTargetStore implements TargetStore {
  private readonly rows = new Map<string, ChannelTarget & { verifyTokenHash: string | null; verifyExpiresAt: Date | null }>();

  private key(userId: string, channel: ChannelId): string {
    return `${userId}\0${channel}`;
  }

  async upsert(input: UpsertTargetInput): Promise<ChannelTarget> {
    const now = new Date();
    const key = this.key(input.userId, input.channel);
    const existing = this.rows.get(key);
    const row = {
      userId: input.userId,
      channel: input.channel,
      address: input.address,
      locale: input.locale,
      // A changed address is a different address. Confirmation does not carry over.
      verifiedAt: existing && existing.address === input.address ? existing.verifiedAt : null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      verifyTokenHash: input.verifyTokenHash,
      verifyExpiresAt: input.verifyExpiresAt,
    };
    this.rows.set(key, row);
    return stripSecrets(row);
  }

  async list(userId: string): Promise<ChannelTarget[]> {
    return [...this.rows.values()].filter((r) => r.userId === userId).map(stripSecrets);
  }

  async verified(userId: string): Promise<ChannelTarget[]> {
    return (await this.list(userId)).filter((r) => r.verifiedAt !== null);
  }

  async unverifiedChannels(userId: string): Promise<readonly ChannelId[]> {
    return (await this.list(userId)).filter((r) => r.verifiedAt === null).map((r) => r.channel);
  }

  async markVerified(userId: string, channel: ChannelId, tokenHash: string, now: Date): Promise<boolean> {
    const row = this.rows.get(this.key(userId, channel));
    if (!row || row.verifyTokenHash === null || row.verifyExpiresAt === null) return false;
    if (row.verifyTokenHash !== tokenHash || row.verifyExpiresAt.getTime() < now.getTime()) return false;
    row.verifiedAt = now;
    row.updatedAt = now;
    // Single use — a code that still works after it was used is a code someone can replay.
    row.verifyTokenHash = null;
    row.verifyExpiresAt = null;
    return true;
  }

  async remove(userId: string, channel: ChannelId): Promise<boolean> {
    return this.rows.delete(this.key(userId, channel));
  }
}

function stripSecrets(row: ChannelTarget & { verifyTokenHash: string | null; verifyExpiresAt: Date | null }): ChannelTarget {
  return {
    userId: row.userId,
    channel: row.channel,
    address: row.address,
    locale: row.locale,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── postgres ─────────────────────────────────────────────────────────────────

type DeliveryPgRow = {
  id: string;
  notification_id: string;
  channel: ChannelId;
  status: DeliveryStatus;
  attempts: number;
  attempted_at: Date | null;
  accepted_at: Date | null;
  lease_until: Date | null;
  refusal_code: RefusalCode | null;
  detail: string | null;
  reference: string | null;
  created_at: Date;
  updated_at: Date;
};

function fromDeliveryPg(row: DeliveryPgRow): DeliveryRecord {
  return {
    id: row.id,
    notificationId: row.notification_id,
    channel: row.channel,
    status: row.status,
    attempts: Number(row.attempts),
    attemptedAt: row.attempted_at,
    acceptedAt: row.accepted_at,
    leaseUntil: row.lease_until,
    refusalCode: row.refusal_code,
    detail: row.detail,
    reference: row.reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresDeliveryStore implements DeliveryStore {
  private readonly leaseMs: number;

  constructor(
    private readonly sql: Sql,
    opts: { leaseMs?: number } = {},
  ) {
    this.leaseMs = opts.leaseMs ?? DEFAULT_CLAIM_LEASE_MS;
  }

  async claim(notificationId: string, channel: ChannelId, maxAttempts: number): Promise<ClaimResult> {
    // ONE statement decides. Two replicas racing the same redelivered event both
    // run this; exactly one gets a row back, and the other is told why not. A
    // read-then-write here would send the same email twice under load.
    //
    // Lease: pending rows with a live lease_until are NOT re-owned. That is the
    // two-replica mid-send guard. Failed rows and expired leases remain reclaimable.
    const leaseSeconds = Math.max(1, Math.ceil(this.leaseMs / 1000));
    const claimed = await this.sql<DeliveryPgRow[]>`
      INSERT INTO notify.deliveries (notification_id, channel, status, attempts, lease_until)
      VALUES (${notificationId}, ${channel}, 'pending', 1, now() + (${leaseSeconds}::text || ' seconds')::interval)
      ON CONFLICT (notification_id, channel) DO UPDATE
        SET attempts = notify.deliveries.attempts + 1,
            status = 'pending',
            lease_until = now() + (${leaseSeconds}::text || ' seconds')::interval,
            updated_at = now()
        WHERE notify.deliveries.attempts < ${maxAttempts}
          AND (
            notify.deliveries.status = 'failed'
            OR (
              notify.deliveries.status = 'pending'
              AND (
                notify.deliveries.lease_until IS NULL
                OR notify.deliveries.lease_until <= now()
              )
            )
          )
      RETURNING id, notification_id, channel, status, attempts, attempted_at, accepted_at, lease_until, refusal_code, detail, reference, created_at, updated_at
    `;

    if (claimed.length > 0) {
      const row = fromDeliveryPg(claimed[0]!);
      return { claimed: true, id: row.id, attempt: row.attempts };
    }

    // The upsert was blocked. Say precisely why, and retire a row that has run
    // out of attempts rather than leaving it 'failed' forever, which would read
    // as "still being retried" when nothing is retrying it.
    const retired = await this.sql<DeliveryPgRow[]>`
      UPDATE notify.deliveries
         SET status = 'abandoned',
             refusal_code = 'channel.attempts_exhausted',
             lease_until = NULL,
             updated_at = now()
       WHERE notification_id = ${notificationId}
         AND channel = ${channel}
         AND status IN ('pending', 'failed')
         AND attempts >= ${maxAttempts}
      RETURNING id, notification_id, channel, status, attempts, attempted_at, accepted_at, lease_until, refusal_code, detail, reference, created_at, updated_at
    `;
    if (retired.length > 0) return { claimed: false, reason: 'exhausted', record: fromDeliveryPg(retired[0]!) };

    const current = await this.sql<DeliveryPgRow[]>`
      SELECT id, notification_id, channel, status, attempts, attempted_at, accepted_at, lease_until, refusal_code, detail, reference, created_at, updated_at FROM notify.deliveries
       WHERE notification_id = ${notificationId} AND channel = ${channel}
       LIMIT 1
    `;
    const record = fromDeliveryPg(current[0]!);
    if (record.status === 'accepted') {
      return { claimed: false, reason: 'already_accepted', record };
    }
    if (record.status === 'pending' && record.leaseUntil != null && record.leaseUntil.getTime() > Date.now()) {
      return { claimed: false, reason: 'in_flight', record };
    }
    return { claimed: false, reason: 'terminal', record };
  }

  async settle(input: SettleInput): Promise<void> {
    await this.sql`
      UPDATE notify.deliveries
         SET status = ${input.status},
             refusal_code = ${input.refusalCode ?? null},
             detail = ${input.detail ?? null},
             reference = ${input.reference ?? null},
             attempted_at = CASE WHEN ${input.attempted} THEN now() ELSE attempted_at END,
             accepted_at = CASE WHEN ${input.status === 'accepted'} THEN now() ELSE NULL END,
             lease_until = NULL,
             updated_at = now()
       WHERE id = ${input.id}
    `;
  }

  async listForNotification(notificationId: string): Promise<DeliveryRecord[]> {
    const rows = await this.sql<DeliveryPgRow[]>`
      SELECT id, notification_id, channel, status, attempts, attempted_at, accepted_at, lease_until, refusal_code, detail, reference, created_at, updated_at FROM notify.deliveries
       WHERE notification_id = ${notificationId}
       ORDER BY channel ASC
    `;
    return rows.map(fromDeliveryPg);
  }
}

type TargetPgRow = {
  user_id: string;
  channel: ChannelId;
  address: string;
  locale: string;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function fromTargetPg(row: TargetPgRow): ChannelTarget {
  return {
    userId: row.user_id,
    channel: row.channel,
    address: row.address,
    locale: row.locale,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresTargetStore implements TargetStore {
  constructor(private readonly sql: Sql) {}

  async upsert(input: UpsertTargetInput): Promise<ChannelTarget> {
    // `verified_at` resets whenever the address changes. Confirming one address
    // is not consent to be messaged at another.
    const rows = await this.sql<TargetPgRow[]>`
      INSERT INTO notify.channel_targets (user_id, channel, address, locale, verify_token_hash, verify_expires_at)
      VALUES (${input.userId}, ${input.channel}, ${input.address}, ${input.locale}, ${input.verifyTokenHash}, ${input.verifyExpiresAt})
      ON CONFLICT (user_id, channel) DO UPDATE
        SET address = EXCLUDED.address,
            locale = EXCLUDED.locale,
            verify_token_hash = EXCLUDED.verify_token_hash,
            verify_expires_at = EXCLUDED.verify_expires_at,
            verified_at = CASE
              WHEN notify.channel_targets.address = EXCLUDED.address THEN notify.channel_targets.verified_at
              ELSE NULL
            END,
            updated_at = now()
      RETURNING user_id, channel, address, locale, verified_at, created_at, updated_at
    `;
    return fromTargetPg(rows[0]!);
  }

  async list(userId: string): Promise<ChannelTarget[]> {
    const rows = await this.sql<TargetPgRow[]>`
      SELECT user_id, channel, address, locale, verified_at, created_at, updated_at FROM notify.channel_targets
       WHERE user_id = ${userId}
       ORDER BY channel ASC
    `;
    return rows.map(fromTargetPg);
  }

  async verified(userId: string): Promise<ChannelTarget[]> {
    const rows = await this.sql<TargetPgRow[]>`
      SELECT user_id, channel, address, locale, verified_at, created_at, updated_at FROM notify.channel_targets
       WHERE user_id = ${userId} AND verified_at IS NOT NULL
       ORDER BY channel ASC
    `;
    return rows.map(fromTargetPg);
  }

  async unverifiedChannels(userId: string): Promise<readonly ChannelId[]> {
    // `channel` and nothing else. This answers a labelling question, so it has
    // no reason to load an address the caller must not send to.
    const rows = await this.sql<{ channel: ChannelId }[]>`
      SELECT channel FROM notify.channel_targets
       WHERE user_id = ${userId} AND verified_at IS NULL
       ORDER BY channel ASC
    `;
    return rows.map((r) => r.channel);
  }

  async markVerified(userId: string, channel: ChannelId, tokenHash: string, now: Date): Promise<boolean> {
    // Single use: the token is cleared in the same statement that spends it, so
    // a replayed code finds nothing to match.
    const rows = await this.sql<Array<{ user_id: string }>>`
      UPDATE notify.channel_targets
         SET verified_at = ${now}, verify_token_hash = NULL, verify_expires_at = NULL, updated_at = now()
       WHERE user_id = ${userId}
         AND channel = ${channel}
         AND verify_token_hash = ${tokenHash}
         AND verify_expires_at > ${now}
      RETURNING user_id
    `;
    return rows.length > 0;
  }

  async remove(userId: string, channel: ChannelId): Promise<boolean> {
    const rows = await this.sql<Array<{ user_id: string }>>`
      DELETE FROM notify.channel_targets
       WHERE user_id = ${userId} AND channel = ${channel}
      RETURNING user_id
    `;
    return rows.length > 0;
  }
}
