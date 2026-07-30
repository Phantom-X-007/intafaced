/**
 * Idempotent outbound broadcast journal.
 *
 * `ChainSendRequest.idempotencyKey` must never produce a second broadcast. A
 * process that dies after eth_sendRawTransaction but before remembering the
 * hash will, on retry, ask again — and without this store that is a second
 * transfer of real money that will not come back.
 *
 * The port talks to this interface, not to Postgres, so the conformance suite
 * and unit tests can use the in-memory implementation while production uses a
 * durable one.
 */

export interface BroadcastStore {
  /** Prior txHash for this business key, or null if never broadcast. */
  get(idempotencyKey: string): Promise<string | null>;
  /**
   * Record a broadcast. If the key already exists, leave the original and
   * return it — never overwrite. A race between two workers must converge on
   * one hash, not invent a second.
   */
  put(idempotencyKey: string, txHash: string): Promise<string>;
}

/** In-memory journal — tests and single-process local runners. */
export class MemoryBroadcastStore implements BroadcastStore {
  private readonly map = new Map<string, string>();

  async get(idempotencyKey: string): Promise<string | null> {
    return this.map.get(idempotencyKey) ?? null;
  }

  async put(idempotencyKey: string, txHash: string): Promise<string> {
    const existing = this.map.get(idempotencyKey);
    if (existing) return existing;
    this.map.set(idempotencyKey, txHash);
    return txHash;
  }

  reset(): void {
    this.map.clear();
  }
}
