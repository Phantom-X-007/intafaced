import { describe, expect, it } from 'vitest';
import type { ChainBlock, ChainSource } from './chain/source.js';
import { MemoryChainSource } from './chain/memory-source.js';
import { MemoryProjectionStore } from './projection/memory-store.js';
import { Indexer, ParentUnlinkError } from './indexer.js';
import { CHAIN_ID } from './testing/conformance.js';

/**
 * Head still matches the chain, but head+1 arrives with a foreign parentHash —
 * the mid-read reorg / inconsistent-adapter shape that used to burn a whole
 * batch as no-op "reorgs" while lastError stayed clear and /ready stayed green.
 */
function unlinkSuccessor(base: MemoryChainSource): ChainSource {
  let successor: ChainBlock | null = null;
  return {
    chainId: base.chainId,
    head: () => base.head(),
    blockAt: async (height: number) => {
      const tip = await base.head();
      if (!tip) return base.blockAt(height);
      if (height === tip.height) return base.blockAt(height);
      if (height === tip.height + 1) {
        if (!successor) {
          const real = await base.blockAt(height);
          successor = real
            ? { ...real, parentHash: '0x' + 'cd'.repeat(32) }
            : {
                chainId: CHAIN_ID,
                height: tip.height + 1,
                hash: '0x' + 'ab'.repeat(32),
                parentHash: '0x' + 'cd'.repeat(32),
                timestamp: 1_700_000_100,
                events: [],
              };
        }
        return successor;
      }
      return base.blockAt(height);
    },
  };
}

describe('Indexer · parent-unlink must not batch-spin', () => {
  it('throws ParentUnlinkError once instead of burning the batch with zero orphans', async () => {
    const store = new MemoryProjectionStore(CHAIN_ID);
    const base = new MemoryChainSource(CHAIN_ID);
    base.appendEmpty(3);

    const warm = new Indexer({
      source: base,
      store,
      finalityDepth: 64,
      batchSize: 50,
      ingestEnabled: () => true,
      startHeight: 0,
    });
    await warm.sync();
    expect((await store.head())?.height).toBe(2);

    const broken = new Indexer({
      source: unlinkSuccessor(base),
      store,
      finalityDepth: 64,
      batchSize: 50,
      ingestEnabled: () => true,
      startHeight: 0,
    });

    await expect(broken.sync()).rejects.toBeInstanceOf(ParentUnlinkError);
    expect(broken.lastError?.code).toBe('indexer.parent_unlink');
    expect((await store.head())?.height).toBe(2);
    // Retryable — not a deep reorg halt.
    expect(broken.halted).toBeNull();
  });

  it('never returns a green SyncResult for a frozen cursor with phantom reorgs', async () => {
    const store = new MemoryProjectionStore(CHAIN_ID);
    const base = new MemoryChainSource(CHAIN_ID);
    base.appendEmpty(3);
    const warm = new Indexer({
      source: base,
      store,
      finalityDepth: 64,
      batchSize: 50,
      ingestEnabled: () => true,
      startHeight: 0,
    });
    await warm.sync();

    const broken = new Indexer({
      source: unlinkSuccessor(base),
      store,
      finalityDepth: 64,
      batchSize: 50,
      ingestEnabled: () => true,
      startHeight: 0,
    });

    await expect(broken.sync()).rejects.toMatchObject({ code: 'indexer.parent_unlink' });
  });
});
