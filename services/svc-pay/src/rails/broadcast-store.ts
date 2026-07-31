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
