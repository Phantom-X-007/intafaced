import { createHash } from 'node:crypto';

/**
 * HTTP Idempotency-Key journal for the merchant REST surface (ADR §2.2).
 *
 * Every mutating POST requires the header. A repeated key with an identical
 * request fingerprint returns the stored response; a repeated key with a
 * different fingerprint is a conflict — answering either way would be worse
 * than refusing.
 *
 * This is the HTTP-layer contract. Ledger / rail business keys underneath
 * stay whatever `payment-service` already uses; this store is what makes a
 * merchant retry safe before any of that runs twice.
 *
 * Ordering for Class M (same claim→put shape as crypto broadcasts):
 *   1. `claim` — exactly one concurrent caller may execute for (owner, key)
 *   2. run the handler
 *   3. `put` the response (or `abandon` on 5xx so a retry may try again)
 *
 * `MemoryRestIdempotencyStore` is single-process. Production multi-replica
 * MUST supply `PostgresRestIdempotencyStore`.
 */

export interface RestIdempotencyRecord {
  readonly statusCode: number;
  readonly body: unknown;
}

export type RestIdempotencyClaim =
  { readonly kind: 'mine' } | { readonly kind: 'replay'; readonly record: RestIdempotencyRecord } | { readonly kind: 'conflict' };

export interface RestIdempotencyStore {
  /**
   * Reserve `(ownerId, key)` for this fingerprint, or return a prior result.
   * `conflict` means the key was already used for a different request.
   */
  claim(ownerId: string, key: string, fingerprint: string): Promise<RestIdempotencyClaim>;
  /** Persist a completed response. Never overwrites a different settled body. */
  put(ownerId: string, key: string, record: RestIdempotencyRecord): Promise<void>;
  /**
   * Drop a pending claim after a 5xx so a retry with the same key may execute.
   * Settled rows are left alone.
   */
  abandon(ownerId: string, key: string): Promise<void>;
}

/** Canonical request fingerprint — method + path + body bytes, SHA-256 hex. */
export function fingerprintRequest(method: string, path: string, body: unknown): string {
  const payload = `${method.toUpperCase()}\n${path}\n${stableStringify(body)}`;
  return createHash('sha256').update(payload).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === undefined) return '';
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortKeys(obj[key]);
    return out;
  }
  return value;
}

type PendingSlot = { fingerprint: string; waiters: Array<() => void> };
type SettledSlot = { fingerprint: string; record: RestIdempotencyRecord };

/** In-memory journal — unit tests and single-process local runners. */
export class MemoryRestIdempotencyStore implements RestIdempotencyStore {
  private readonly map = new Map<string, PendingSlot | SettledSlot>();

  async claim(ownerId: string, key: string, fingerprint: string): Promise<RestIdempotencyClaim> {
    const id = slotId(ownerId, key);
    const existing = this.map.get(id);
    if (existing && 'record' in existing) {
      if (existing.fingerprint !== fingerprint) return { kind: 'conflict' };
      return { kind: 'replay', record: existing.record };
    }
    if (existing && !('record' in existing)) {
      if (existing.fingerprint !== fingerprint) return { kind: 'conflict' };
      await new Promise<void>((resolve) => {
        existing.waiters.push(resolve);
      });
      const settled = this.map.get(id);
      if (!settled || !('record' in settled)) {
        throw new Error(`rest idempotency claim for ${id} stalled while pending`);
      }
      if (settled.fingerprint !== fingerprint) return { kind: 'conflict' };
      return { kind: 'replay', record: settled.record };
    }
    this.map.set(id, { fingerprint, waiters: [] });
    return { kind: 'mine' };
  }

  async put(ownerId: string, key: string, record: RestIdempotencyRecord): Promise<void> {
    const id = slotId(ownerId, key);
    const existing = this.map.get(id);
    if (existing && 'record' in existing) return;
    const fingerprint = existing && !('record' in existing) ? existing.fingerprint : '';
    const waiters = existing && !('record' in existing) ? existing.waiters : [];
    this.map.set(id, { fingerprint, record });
    for (const wake of waiters) wake();
  }

  async abandon(ownerId: string, key: string): Promise<void> {
    const id = slotId(ownerId, key);
    const existing = this.map.get(id);
    if (!existing || 'record' in existing) return;
    this.map.delete(id);
    for (const wake of existing.waiters) wake();
  }
}

export type RestIdempotencySql = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (strings: TemplateStringsArray, ...values: any[]): Promise<readonly any[]>;
};

const DEFAULT_POLL_MS = 50;
const DEFAULT_MAX_WAITS = 200;

/**
 * Durable journal for multi-replica merchant REST mutations.
 * Pending rows use `status_code = 0` and an empty body until `put`.
 */
export class PostgresRestIdempotencyStore implements RestIdempotencyStore {
  constructor(
    private readonly sql: RestIdempotencySql,
    private readonly opts: { pollMs?: number; maxWaits?: number } = {},
  ) {}

  async claim(ownerId: string, key: string, fingerprint: string): Promise<RestIdempotencyClaim> {
    const inserted = (await this.sql`
      INSERT INTO pay.rest_idempotency (owner_id, idempotency_key, request_fingerprint, status_code, response_body)
      VALUES (${ownerId}, ${key}, ${fingerprint}, 0, ${null})
      ON CONFLICT (owner_id, idempotency_key) DO NOTHING
      RETURNING owner_id
    `) as ReadonlyArray<{ owner_id: string }>;
    if (inserted.length > 0) return { kind: 'mine' };

    const pollMs = this.opts.pollMs ?? DEFAULT_POLL_MS;
    const maxWaits = this.opts.maxWaits ?? DEFAULT_MAX_WAITS;
    for (let i = 0; i < maxWaits; i++) {
      const rows = (await this.sql`
        SELECT request_fingerprint, status_code, response_body
        FROM pay.rest_idempotency
        WHERE owner_id = ${ownerId} AND idempotency_key = ${key}
      `) as ReadonlyArray<{
        request_fingerprint: string;
        status_code: number;
        response_body: unknown;
      }>;
      const row = rows[0];
      if (!row) {
        // Winner abandoned — try to claim again.
        return this.claim(ownerId, key, fingerprint);
      }
      if (row.request_fingerprint !== fingerprint) return { kind: 'conflict' };
      if (row.status_code !== 0) {
        return {
          kind: 'replay',
          record: { statusCode: row.status_code, body: row.response_body },
        };
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`rest idempotency claim for ${ownerId}/${key} stalled while pending`);
  }

  async put(ownerId: string, key: string, record: RestIdempotencyRecord): Promise<void> {
    // postgres.js serialises plain objects into jsonb. Only replace pending.
    await this.sql`
      UPDATE pay.rest_idempotency
      SET status_code = ${record.statusCode},
          response_body = ${record.body as never},
          updated_at = now()
      WHERE owner_id = ${ownerId}
        AND idempotency_key = ${key}
        AND status_code = 0
    `;
  }

  async abandon(ownerId: string, key: string): Promise<void> {
    await this.sql`
      DELETE FROM pay.rest_idempotency
      WHERE owner_id = ${ownerId}
        AND idempotency_key = ${key}
        AND status_code = 0
    `;
  }
}

function slotId(ownerId: string, key: string): string {
  return `${ownerId}\0${key}`;
}
