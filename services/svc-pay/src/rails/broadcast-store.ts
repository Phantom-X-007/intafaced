/**
 * Idempotent outbound broadcast journal.
 *
 * `ChainSendRequest.idempotencyKey` must never produce a second broadcast. A
 * process that dies after eth_sendRawTransaction but before remembering the
 * hash will, on retry, ask again — and without this store that is a second
 * transfer of real money that will not come back.
 *
 * Ordering for Class M:
 *   1. `claim` — exactly one caller may broadcast for a key
 *   2. `eth_sendRawTransaction`
 *   3. `put` the returned hash **before** waiting for the receipt
 *   4. wait for receipt (retryable; hash already journalled)
 *
 * The port talks to this interface, not to Postgres, so the conformance suite
 * and unit tests can use the in-memory implementation. Production multi-replica
 * MUST supply a durable store — `MemoryBroadcastStore` is single-process only.
 */

/** Sentinel while a worker owns the right to broadcast but has not yet put a hash. */
export const BROADCAST_PENDING = '__pending__' as const;

export type ClaimResult = { readonly kind: 'mine' } | { readonly kind: 'done'; readonly txHash: string };

export interface BroadcastStore {
  /** Prior txHash for this business key, or null if never completed. */
  get(idempotencyKey: string): Promise<string | null>;
  /**
   * Atomically reserve the key for broadcast. Exactly one concurrent caller
   * receives `mine`; others receive `done` once the winner puts a hash.
   */
  claim(idempotencyKey: string): Promise<ClaimResult>;
  /**
   * Record a broadcast. If the key already holds a real hash, leave it and
   * return it — never overwrite. Pending sentinels are replaced by the hash.
   */
  put(idempotencyKey: string, txHash: string): Promise<string>;
}

/** In-memory journal — tests and single-process local runners. Not multi-replica safe. */
export class MemoryBroadcastStore implements BroadcastStore {
  private readonly map = new Map<string, string>();
  private readonly waiters = new Map<string, Array<() => void>>();

  async get(idempotencyKey: string): Promise<string | null> {
    const v = this.map.get(idempotencyKey);
    if (!v || v === BROADCAST_PENDING) return null;
    return v;
  }

  async claim(idempotencyKey: string): Promise<ClaimResult> {
    // Check + set with no await between — atomic on the JS event loop.
    const existing = this.map.get(idempotencyKey);
    if (existing && existing !== BROADCAST_PENDING) {
      return { kind: 'done', txHash: existing };
    }
    if (existing === BROADCAST_PENDING) {
      await this.#waitUntilSettled(idempotencyKey);
      const settled = this.map.get(idempotencyKey);
      if (!settled || settled === BROADCAST_PENDING) {
        throw new Error(`broadcast claim for ${idempotencyKey} stalled while pending`);
      }
      return { kind: 'done', txHash: settled };
    }
    this.map.set(idempotencyKey, BROADCAST_PENDING);
    return { kind: 'mine' };
  }

  async put(idempotencyKey: string, txHash: string): Promise<string> {
    if (txHash === BROADCAST_PENDING) {
      throw new Error('txHash must not be the pending sentinel');
    }
    const existing = this.map.get(idempotencyKey);
    if (existing && existing !== BROADCAST_PENDING) return existing;
    this.map.set(idempotencyKey, txHash);
    this.#release(idempotencyKey);
    return txHash;
  }

  reset(): void {
    this.map.clear();
    for (const list of this.waiters.values()) {
      for (const wake of list) wake();
    }
    this.waiters.clear();
  }

  #waitUntilSettled(idempotencyKey: string): Promise<void> {
    return new Promise((resolve) => {
      const list = this.waiters.get(idempotencyKey) ?? [];
      list.push(resolve);
      this.waiters.set(idempotencyKey, list);
    });
  }

  #release(idempotencyKey: string): void {
    const list = this.waiters.get(idempotencyKey);
    if (!list) return;
    this.waiters.delete(idempotencyKey);
    for (const wake of list) wake();
  }
}

/** Minimal postgres.js surface used by the durable journal (keeps tests mockable). */
export type BroadcastSql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
};

const DEFAULT_PENDING_POLL_MS = 50;
const DEFAULT_PENDING_MAX_WAITS = 200; // ~10s at 50ms

/**
 * Postgres-backed journal for multi-replica / crash-safe outbound crypto sends.
 *
 * claim uses INSERT … ON CONFLICT DO NOTHING so exactly one replica gets `mine`.
 * Concurrent claimers poll until the winner `put`s a real hash (or stall).
 */
export class PostgresBroadcastStore implements BroadcastStore {
  constructor(
    private readonly sql: BroadcastSql,
    private readonly opts: { pollMs?: number; maxWaits?: number } = {},
  ) {}

  async get(idempotencyKey: string): Promise<string | null> {
    const rows = await this.sql<{ tx_hash: string }>`
      SELECT tx_hash FROM pay.crypto_broadcasts WHERE idempotency_key = ${idempotencyKey}
    `;
    const v = rows[0]?.tx_hash;
    if (!v || v === BROADCAST_PENDING) return null;
    return v;
  }

  async claim(idempotencyKey: string): Promise<ClaimResult> {
    const inserted = await this.sql<{ idempotency_key: string }>`
      INSERT INTO pay.crypto_broadcasts (idempotency_key, tx_hash)
      VALUES (${idempotencyKey}, ${BROADCAST_PENDING})
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING idempotency_key
    `;
    if (inserted.length > 0) return { kind: 'mine' };

    const pollMs = this.opts.pollMs ?? DEFAULT_PENDING_POLL_MS;
    const maxWaits = this.opts.maxWaits ?? DEFAULT_PENDING_MAX_WAITS;
    for (let i = 0; i < maxWaits; i++) {
      const rows = await this.sql<{ tx_hash: string }>`
        SELECT tx_hash FROM pay.crypto_broadcasts WHERE idempotency_key = ${idempotencyKey}
      `;
      const v = rows[0]?.tx_hash;
      if (v && v !== BROADCAST_PENDING) return { kind: 'done', txHash: v };
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`broadcast claim for ${idempotencyKey} stalled while pending`);
  }

  async put(idempotencyKey: string, txHash: string): Promise<string> {
    if (txHash === BROADCAST_PENDING) {
      throw new Error('txHash must not be the pending sentinel');
    }
    // Only replace pending (or same hash). Never overwrite a different settled hash.
    const updated = await this.sql<{ tx_hash: string }>`
      UPDATE pay.crypto_broadcasts
      SET tx_hash = ${txHash}, updated_at = now()
      WHERE idempotency_key = ${idempotencyKey}
        AND (tx_hash = ${BROADCAST_PENDING} OR tx_hash = ${txHash})
      RETURNING tx_hash
    `;
    if (updated[0]?.tx_hash) return updated[0].tx_hash;

    const existing = await this.sql<{ tx_hash: string }>`
      SELECT tx_hash FROM pay.crypto_broadcasts WHERE idempotency_key = ${idempotencyKey}
    `;
    const v = existing[0]?.tx_hash;
    if (v && v !== BROADCAST_PENDING) return v;
    throw new Error(`broadcast put for ${idempotencyKey}: no claim row (call claim first)`);
  }
}
