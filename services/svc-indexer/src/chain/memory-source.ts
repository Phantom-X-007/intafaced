import { createHash } from 'node:crypto';
import { assertValidBlock, type ChainBlock, type ChainEvent, type ChainHead, type ChainSource } from './source.js';

/**
 * A DETERMINISTIC IN-MEMORY CHAIN — the reference `ChainSource` (§13 socket
 * `socket.evm-rpc` covers the real one).
 *
 * This exists because the property this whole service is built around — that a
 * projection survives a reorg — cannot be observed on a real chain on demand.
 * A test suite that waits for mainnet to fork is not a test suite.
 *
 * Deterministic in the strong sense: block hashes are derived from the content
 * (height, parent, timestamp, events) rather than randomly generated, so the
 * same script produces the same hashes on every run and in every process. A
 * failing reorg test therefore names the same block every time, which is the
 * difference between a bug you can reproduce and a flake you retry.
 *
 * NOT selectable at boot. `src/index.ts` wires `NullChainSource`, because a
 * fabricated chain served through a production read API is precisely the "ship
 * a mock behind a real name" failure §13 sockets exist to prevent.
 */
export class MemoryChainSource implements ChainSource {
  /** Canonical chain, index = height offset from `#startHeight`. */
  #chain: ChainBlock[] = [];

  constructor(
    readonly chainId: number,
    /** Height of the first block. Non-zero starts are the normal case on L2s. */
    private readonly startHeight = 0,
  ) {}

  async head(): Promise<ChainHead | null> {
    const tip = this.#chain.at(-1);
    return tip ? { height: tip.height, hash: tip.hash } : null;
  }

  async blockAt(height: number): Promise<ChainBlock | null> {
    return this.#chain[height - this.startHeight] ?? null;
  }

  // ── Test-side controls ────────────────────────────────────────────────────

  /** Append one block to the tip. Returns it, so a test can name its hash. */
  append(events: readonly ChainEvent[] = [], timestamp?: number): ChainBlock {
    const tip = this.#chain.at(-1);
    const height = tip ? tip.height + 1 : this.startHeight;
    const parentHash = tip ? tip.hash : GENESIS_PARENT;
    const ts = timestamp ?? 1_700_000_000 + height * 12;

    const block: ChainBlock = {
      chainId: this.chainId,
      height,
      hash: hashBlock(this.chainId, height, parentHash, ts, events),
      parentHash,
      timestamp: ts,
      events,
    };

    assertValidBlock(block);
    this.#chain.push(block);
    return block;
  }

  /** Convenience: append several empty blocks (to bury something, or to lag). */
  appendEmpty(count: number): void {
    for (let i = 0; i < count; i++) this.append([]);
  }

  /**
   * REORG. Drop every block above `forkHeight` and build a new branch.
   *
   * `forkHeight` is the last block that SURVIVES, so the new branch starts at
   * `forkHeight + 1`. The new blocks hash differently from the ones they
   * replace even when their contents are identical, because a `salt` is folded
   * into the hash — a competing branch that produced byte-identical blocks
   * would be the same branch, and a test that accidentally built one would
   * quietly assert nothing.
   */
  reorg(forkHeight: number, branch: readonly (readonly ChainEvent[])[], salt = 'reorg'): ChainBlock[] {
    const keep = forkHeight - this.startHeight + 1;
    if (keep < 1 || keep > this.#chain.length) {
      throw new Error(`cannot reorg to height ${forkHeight}: chain holds ${this.#chain.length} block(s)`);
    }
    this.#chain = this.#chain.slice(0, keep);

    const produced: ChainBlock[] = [];
    for (const events of branch) {
      const tip = this.#chain.at(-1)!;
      const height = tip.height + 1;
      const ts = 1_700_000_000 + height * 12;
      const block: ChainBlock = {
        chainId: this.chainId,
        height,
        hash: hashBlock(this.chainId, height, tip.hash, ts, events, salt),
        parentHash: tip.hash,
        timestamp: ts,
        events,
      };
      assertValidBlock(block);
      this.#chain.push(block);
      produced.push(block);
    }
    return produced;
  }

  /** The canonical chain as the source currently believes it. For assertions. */
  canonical(): readonly ChainBlock[] {
    return this.#chain;
  }
}

/** Genesis has no parent; the zero hash is the conventional stand-in. */
export const GENESIS_PARENT = `0x${'0'.repeat(64)}`;

function hashBlock(
  chainId: number,
  height: number,
  parentHash: string,
  timestamp: number,
  events: readonly ChainEvent[],
  salt = '',
): string {
  const digest = createHash('sha256').update(JSON.stringify({ chainId, height, parentHash, timestamp, events, salt })).digest('hex');
  return `0x${digest}`;
}

/**
 * The production wiring: a chain source that reports no chain.
 *
 * Honest rather than convenient. With no EVM RPC and no deployed CLOB, the
 * truthful answer to "what is the head?" is "there is no chain to read", and
 * the ingest loop treats that as "nothing to do" rather than as an error. The
 * service still serves everything already in Postgres, and `status` reports
 * `chainSource: 'null'` so nobody can mistake an idle indexer for a current one.
 */
export class NullChainSource implements ChainSource {
  constructor(readonly chainId: number) {}

  async head(): Promise<ChainHead | null> {
    return null;
  }

  async blockAt(): Promise<ChainBlock | null> {
    return null;
  }
}
