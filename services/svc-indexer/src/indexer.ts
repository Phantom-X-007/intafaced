import type { ChainSource } from './chain/source.js';
import type { ProjectionStore, StoredBlock } from './projection/store.js';
import { withSpan } from './tracing.js';

/**
 * THE INGEST LOOP — follow the chain, and repair the projection when it forks.
 *
 * Three jobs, in order of how much they matter:
 *
 *   1. notice that the chain we projected is no longer the chain that exists
 *   2. find where the two diverged
 *   3. delete what the dead branch wrote, and carry on from the fork
 *
 * (1) is the one everybody skips. An indexer that only ever asks "what is the
 * next block?" will happily extend a branch that no longer exists, because the
 * source will keep answering. So every pass re-reads the block at OUR OWN head
 * and compares hashes before it asks for anything newer. That single extra read
 * is the difference between a projection that repairs itself and one that
 * quietly serves a price from a branch nobody else can see.
 */

export class ReorgTooDeepError extends Error {
  constructor(
    readonly headHeight: number,
    readonly floor: number,
  ) {
    super(
      `Reorg deeper than retained history: no common ancestor between height ${headHeight} and ${floor}. ` +
        `The projection cannot be repaired from what is stored — raise INDEXER_FINALITY_DEPTH and re-index from genesis.`,
    );
    this.name = 'ReorgTooDeepError';
  }
}

export interface IndexerDeps {
  readonly source: ChainSource;
  readonly store: ProjectionStore;
  /**
   * How deep a reorg this projection can repair. Also the `prune` horizon —
   * they are the same number because they are the same question: how much
   * history is worth keeping in order to be able to undo.
   */
  readonly finalityDepth: number;
  /** Blocks per pass. Bounds how long one pass holds the loop. */
  readonly batchSize?: number;
  /**
   * First height to index. A real adapter sets this to the deployment block of
   * the contracts it reads; indexing from genesis on an established chain is
   * hours of empty blocks.
   */
  readonly startHeight?: number;
  /** Mirrors the `indexer.ingest` kill-switch (§14 admin controls). */
  readonly ingestEnabled: () => boolean;
  readonly onError?: (err: unknown, context: string) => void;
}

export interface SyncResult {
  readonly blocksApplied: number;
  readonly blocksOrphaned: number;
  readonly reorgs: number;
  readonly head: StoredBlock | null;
  /** False when the batch ran out before the chain head was reached. */
  readonly caughtUp: boolean;
  /** Why nothing happened, when nothing happened. */
  readonly idle: 'disabled' | 'no-chain' | 'halted' | null;
}

export interface HaltState {
  readonly reason: string;
  readonly at: Date;
}

/**
 * The last thing that ended a pass badly, kept so a stalled cursor can say why.
 *
 * Before the EVM adapter existed this was unnecessary: `NullChainSource` cannot
 * fail, `MemoryChainSource` cannot fail, and the only error the loop could hit
 * was a reorg deeper than retained history — which already sets `halted`. A real
 * RPC introduces a whole class of pass that ends in neither progress nor a halt:
 * the endpoint is down, the venue holds no code, the node is answering for
 * another chain. Every one of those leaves `indexedHeight` frozen at a perfectly
 * plausible number.
 *
 * A frozen cursor with no stated reason is the failure this service exists to
 * prevent, arriving from underneath it. `code` carries the typed refusal where
 * there is one (`chain/evm/availability.ts`), so a caller can tell "we cannot
 * reach the chain" from "this service has a bug".
 */
export interface SyncFailure {
  readonly code: string | null;
  readonly message: string;
  readonly at: Date;
}

export class Indexer {
  #timer: NodeJS.Timeout | null = null;
  #running = false;
  #halted: HaltState | null = null;
  #lastError: SyncFailure | null = null;

  constructor(private readonly deps: IndexerDeps) {}

  /**
   * A projection known to be wrong.
   *
   * Set only by a reorg deeper than retained history — the one failure this
   * design cannot repair. It is surfaced rather than swallowed, and
   * `/ready` fails on it, because a read model that knows it is wrong should
   * stop answering. A stale book is a bad experience; a confidently wrong book
   * is the thing this whole service was written to avoid.
   */
  get halted(): HaltState | null {
    return this.#halted;
  }

  /**
   * Why the last pass did not get anywhere, if it did not.
   *
   * Cleared by the next pass that completes, so it describes the present rather
   * than an incident from an hour ago that has since resolved itself.
   */
  get lastError(): SyncFailure | null {
    return this.#lastError;
  }

  /** Clears the halt. An operator calls this AFTER re-indexing, not instead. */
  resume(): void {
    this.#halted = null;
    this.#lastError = null;
  }

  /**
   * One pass. Wrapped so a failure is RECORDED as well as thrown.
   *
   * Recorded here rather than in the poll loop's `catch` because a direct caller
   * — every test in this service, and any future admin action — must leave the
   * same trace behind as the timer does. Two places to record a failure is one
   * place to forget.
   */
  async sync(): Promise<SyncResult> {
    try {
      const result = await this.#sync();
      this.#lastError = null;
      return result;
    } catch (err) {
      const code = typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : null;
      this.#lastError = { code, message: (err as Error).message, at: new Date() };
      throw err;
    }
  }

  async #sync(): Promise<SyncResult> {
    if (this.#halted) return idleResult('halted', await this.deps.store.head());
    if (!this.deps.ingestEnabled()) return idleResult('disabled', await this.deps.store.head());

    const chainHead = await this.deps.source.head();
    if (!chainHead) return idleResult('no-chain', await this.deps.store.head());

    const { source, store, batchSize = 200, startHeight = 0 } = this.deps;

    let blocksApplied = 0;
    let blocksOrphaned = 0;
    let reorgs = 0;
    let caughtUp = false;

    for (let step = 0; step < batchSize; step++) {
      const head = await store.head();

      // Cold start.
      if (!head) {
        const first = await source.blockAt(startHeight);
        if (!first) {
          caughtUp = true;
          break;
        }
        await store.applyBlock(first);
        blocksApplied++;
        continue;
      }

      // ── (1) Is the branch we projected still the chain? ───────────────────
      //
      // Asked every pass, before anything else. A reorg that replaces the tip
      // without extending it — the common shape — is invisible to any check
      // that only looks forward.
      const atOurHead = await source.blockAt(head.height);
      if (!atOurHead || atOurHead.hash !== head.hash) {
        blocksOrphaned += await this.#repair(head);
        reorgs++;
        continue;
      }

      const next = await source.blockAt(head.height + 1);
      if (!next) {
        caughtUp = true;
        break;
      }

      // The source answered for both heights but they do not link. Either the
      // chain reorged between the two reads, or the adapter is inconsistent.
      // Both are handled the same way and neither is projected: find the fork.
      if (next.parentHash !== head.hash) {
        blocksOrphaned += await this.#repair(head);
        reorgs++;
        continue;
      }

      await store.applyBlock(next);
      blocksApplied++;
    }

    const head = await store.head();

    // Prune once per pass rather than per block: it is bookkeeping, and running
    // it inside the block loop would put a delete-with-subquery between every
    // pair of blocks during a backfill.
    if (head && blocksApplied > 0) {
      const horizon = head.height - this.deps.finalityDepth;
      if (horizon > 0) await store.prune(horizon);
    }

    return { blocksApplied, blocksOrphaned, reorgs, head, caughtUp, idle: null };
  }

  /** Find the fork and delete everything the dead branch wrote. */
  async #repair(head: StoredBlock): Promise<number> {
    const fork = await this.#findForkPoint(head.height);
    const outcome = await this.deps.store.unwindTo(fork + 1);
    return outcome.blocksOrphaned;
  }

  /**
   * The highest height at which our stored chain and the source still agree.
   *
   * Walks down comparing hashes. The floor is not arbitrary: below
   * `head - finalityDepth` the superseded versions have been pruned, so an
   * unwind past it would delete a level's last surviving version and leave
   * nothing to fall back to. Rather than unwind into that and produce a book
   * with holes in it, this throws.
   *
   * Refusing is the point. A reorg that deep is a chain-level event, and the
   * honest responses are "stop serving" and "re-index" — not "guess, and hope
   * the guess is invisible". Everything else in this service exists to avoid
   * serving a number we cannot justify; this is the same rule applied to the
   * case where the design runs out.
   */
  async #findForkPoint(fromHeight: number): Promise<number> {
    const earliest = (await this.deps.store.earliestHeight()) ?? 0;
    const floor = Math.max(earliest, fromHeight - this.deps.finalityDepth);

    for (let height = fromHeight; height >= floor; height--) {
      const [stored, onChain] = await Promise.all([this.deps.store.blockAt(height), this.deps.source.blockAt(height)]);
      if (stored && onChain && stored.hash === onChain.hash) return height;
    }

    const err = new ReorgTooDeepError(fromHeight, floor);
    this.#halted = { reason: err.message, at: new Date() };
    throw err;
  }

  // ── Loop ──────────────────────────────────────────────────────────────────

  start(intervalMs: number): void {
    if (this.#timer) return;
    const tick = () => {
      if (this.#running) return; // never overlap a pass with itself
      this.#running = true;
      void withSpan('indexer.sync', () => this.sync())
        .catch((err) => this.deps.onError?.(err, 'sync'))
        .finally(() => {
          this.#running = false;
        });
    };
    this.#timer = setInterval(tick, intervalMs);
    // `unref` so a stopped process is not held open by the poll timer.
    this.#timer.unref?.();
    tick();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}

function idleResult(idle: 'disabled' | 'no-chain' | 'halted', head: StoredBlock | null): SyncResult {
  return { blocksApplied: 0, blocksOrphaned: 0, reorgs: 0, head, caughtUp: true, idle };
}
