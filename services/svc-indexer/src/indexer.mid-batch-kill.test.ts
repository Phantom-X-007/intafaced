import { describe, expect, it } from 'vitest';
import { MemoryChainSource } from './chain/memory-source.js';
import { MemoryProjectionStore } from './projection/memory-store.js';
import { Indexer } from './indexer.js';
import { CHAIN_ID } from './testing/conformance.js';

/**
 * Mid-batch kill re-check (#1483 code path).
 *
 * Conformance only flips the switch *between* passes. Without this test, a
 * regression that removes the per-step re-check would still look green: the
 * pre-pass check alone would idle a fully-disabled pass.
 */
describe('Indexer · mid-batch kill re-check', () => {
  it('stops applying remaining steps of one pass when kill flips after partial apply', async () => {
    const source = new MemoryChainSource(CHAIN_ID, 0);
    source.appendEmpty(20); // 0..19
    const store = new MemoryProjectionStore(CHAIN_ID);

    let allow = true;
    const originalApply = store.applyBlock.bind(store);
    let applied = 0;
    store.applyBlock = async (block) => {
      const outcome = await originalApply(block);
      applied++;
      if (applied >= 2) allow = false;
      return outcome;
    };

    const indexer = new Indexer({
      source,
      store,
      finalityDepth: 64,
      batchSize: 20,
      ingestEnabled: () => allow,
      startHeight: 0,
    });

    const result = await indexer.sync();
    expect(result.blocksApplied).toBe(2);
    expect(result.idle).toBe('disabled');
    expect(result.caughtUp).toBe(false);
    expect((await store.head())?.height).toBe(1);

    // Remaining heights must not have been projected.
    expect(await store.blockAt(2)).toBeNull();
    expect(await store.blockAt(19)).toBeNull();
  });

  it('pre-pass kill reports idle:disabled without claiming caughtUp when tip is ahead', async () => {
    const source = new MemoryChainSource(CHAIN_ID, 0);
    source.appendEmpty(5);
    const store = new MemoryProjectionStore(CHAIN_ID);
    // Seed two blocks while enabled.
    const seed = new Indexer({
      source,
      store,
      finalityDepth: 64,
      batchSize: 2,
      ingestEnabled: () => true,
      startHeight: 0,
    });
    await seed.sync();
    expect((await store.head())?.height).toBe(1);

    const frozen = new Indexer({
      source,
      store,
      finalityDepth: 64,
      batchSize: 10,
      ingestEnabled: () => false,
      startHeight: 0,
    });
    const result = await frozen.sync();
    expect(result.idle).toBe('disabled');
    expect(result.caughtUp).toBe(false);
    expect(result.blocksApplied).toBe(0);
    expect((await store.head())?.height).toBe(1);
  });
});
